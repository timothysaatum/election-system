/**
 * api.js — Admin API Service
 *
 * FIXES APPLIED (vs previous version):
 * ─────────────────────────────────────
 * 1. streamSSE() — replaced native EventSource (which cannot send auth headers
 *    and always returned 401) with fetch-based SSE using AbortController.
 *    Returns { close() } so call sites are unchanged.
 *
 * 2. streamResults() / streamStatistics() — now pass election_id as a query
 *    param so the backend _resolve_election helper is not used as a fallback.
 *
 * 3. getStatistics() — now appends election_id query param.
 *
 * 4. getResults() — now appends election_id query param.
 *
 * 5. getElectorateTokens() — now appends election_id query param.
 *
 * 6. getRecentActivity() — now appends election_id query param.
 *
 * 7. lockElection() / unlockElection() — new methods matching backend endpoints
 *    POST /elections/:id/lock and POST /elections/:id/unlock.
 *
 * 8. Voter-roll management methods added:
 *    getVoterRoll(), addVoterToRoll(), removeVoterFromRoll(), bulkUploadVoterRoll()
 */

const API_BASE_URL = process.env.REACT_APP_API_URL || "/api";

// Request cache to prevent duplicate simultaneous requests
const pendingRequests = new Map();

// Cache for data with TTL
const dataCache = new Map();
const CACHE_TTL = 5000; // 5 seconds

class ApiService {
  async request(endpoint, options = {}) {
    const token = localStorage.getItem("admin_token");
    const headers = {
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    };

    if (!(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      localStorage.removeItem("admin_token");
      // Also wipe the persisted election ID — the next login will re-select it
      this.setActiveElectionId(null);
      window.location.href = "/";
      return;
    }

    if (response.status === 204) {
      if (!response.ok) throw new Error("Request failed");
      return null;
    }

    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Request failed");
    return data;
  }

  async requestWithDedup(endpoint, options = {}) {
    const cacheKey = `${options.method || "GET"}:${endpoint}`;

    if (pendingRequests.has(cacheKey)) {
      return pendingRequests.get(cacheKey);
    }

    if (!options.method || options.method === "GET") {
      const cached = dataCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
      }
    }

    const promise = this.request(endpoint, options)
      .then((data) => {
        if (!options.method || options.method === "GET") {
          dataCache.set(cacheKey, { data, timestamp: Date.now() });
        }
        return data;
      })
      .finally(() => {
        pendingRequests.delete(cacheKey);
      });

    pendingRequests.set(cacheKey, promise);
    return promise;
  }

  clearCache(endpoint = null) {
    if (endpoint) {
      for (const key of dataCache.keys()) {
        if (key.includes(endpoint)) {
          dataCache.delete(key);
        }
      }
    } else {
      dataCache.clear();
    }
  }

  // -------------------------------------------------------------------------
  // Election ID resolution
  // -------------------------------------------------------------------------

  // FIX #5 — rehydrate from localStorage on startup so that a page refresh
  // does not reset _activeElectionId to null and break every _electionQuery()
  // call before the admin/official page has a chance to re-set it.
  _activeElectionId = localStorage.getItem("active_election_id") || null;

  setActiveElectionId(id) {
    this._activeElectionId = id;
    if (id != null) {
      localStorage.setItem("active_election_id", String(id));
    } else {
      localStorage.removeItem("active_election_id");
    }
  }

  getActiveElectionId() {
    return this._activeElectionId;
  }

  _electionQuery(extraParams = "") {
    if (!this._activeElectionId) {
      throw new Error(
        "No active election selected. Load an election before performing this action."
      );
    }
    const base = `election_id=${this._activeElectionId}`;
    return extraParams ? `${base}&${extraParams}` : base;
  }

  // ------------------------------------------------------------------
  // FIX #1 — SSE Streaming
  //
  // Native EventSource cannot set request headers, so the admin JWT was never
  // sent and every SSE connection returned 401.  Replaced with fetch + manual
  // stream reading via ReadableStream, wrapped in an AbortController so the
  // caller can still call .close() on the returned object.
  // -------------------------------------------------------------------------

  /**
   * Opens an SSE connection to a streaming endpoint using fetch (not EventSource)
   * so the Authorization header can be included.
   *
   * @param {string} endpoint  - Path relative to API_BASE_URL, WITHOUT query string
   * @param {string} query     - Full query string (no leading ?) e.g. "election_id=...&interval=3"
   * @param {function} onMessage
   * @param {function|null} onError
   * @returns {{ close: () => void }}
   */
  streamSSE(endpoint, query, onMessage, onError = null) {
    const token = localStorage.getItem("admin_token");
    if (!token) {
      const err = new Error("No auth token found");
      if (onError) onError(err);
      return { close: () => { } };
    }

    const controller = new AbortController();
    const url = `${API_BASE_URL}${endpoint}?${query}`;

    const connect = async () => {
      try {
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`SSE connection failed: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop(); // keep incomplete last line

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                onMessage(data);
              } catch (parseErr) {
                console.error("[SSE] Failed to parse message:", parseErr);
              }
            }
          }
        }
      } catch (err) {
        if (err.name === "AbortError") return; // intentional close — ignore
        console.error("[SSE] Connection error on", endpoint, err);
        if (onError) onError(err);

        // Auto-reconnect after 3 seconds (mirrors EventSource native behaviour)
        setTimeout(() => {
          if (!controller.signal.aborted) connect();
        }, 3000);
      }
    };

    connect();
    return { close: () => controller.abort() };
  }

  // FIX #2 — election_id is now explicitly included in stream URLs
  /** Stream live election results. Returns { close() } — call to stop. */
  streamResults(onData, onError = null, interval = 3) {
    const query = this._electionQuery(`interval=${interval}`);
    return this.streamSSE("/admin/stream/results", query, onData, onError);
  }

  /** Stream live election statistics. Returns { close() } — call to stop. */
  streamStatistics(onData, onError = null, interval = 3) {
    const query = this._electionQuery(`interval=${interval}`);
    return this.streamSSE("/admin/stream/statistics", query, onData, onError);
  }

  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------

  async login(username, password) {
    return this.request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  }

  async verify() {
    return this.requestWithDedup("/auth/admin/verify");
  }

  getRoleBasedRoute(role) {
    const routes = {
      admin: "/admin",
      ec_official: "/official",
      polling_agent: "/agent",
    };
    return routes[role] || "/";
  }

  // -------------------------------------------------------------------------
  // Elections
  // -------------------------------------------------------------------------

  async getElections() {
    return this.requestWithDedup("/elections");
  }

  async getElection(id) {
    return this.requestWithDedup(`/elections/${id}`);
  }

  async createElection(data) {
    this.clearCache("/elections");
    return this.request("/elections", { method: "POST", body: JSON.stringify(data) });
  }

  async updateElection(id, data) {
    this.clearCache("/elections");
    return this.request(`/elections/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  }

  async updateElectionStatus(id, status) {
    this.clearCache("/elections");
    return this.request(`/elections/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    });
  }

  // FIX #7 — lock / unlock endpoints were missing entirely
  async lockElection(id) {
    this.clearCache("/elections");
    return this.request(`/elections/${id}/lock`, { method: "POST" });
  }

  async unlockElection(id) {
    this.clearCache("/elections");
    return this.request(`/elections/${id}/unlock`, { method: "POST" });
  }

  async uploadElectionLogo(id, file) {
    const formData = new FormData();
    formData.append("file", file);
    const token = localStorage.getItem("admin_token");
    const response = await fetch(`${API_BASE_URL}/elections/${id}/logo`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Logo upload failed");
    }
    this.clearCache("/elections");
    return response.json();
  }

  // -------------------------------------------------------------------------
  // Voter Roll management (FIX #8 — these were completely missing)
  // -------------------------------------------------------------------------

  async getVoterRoll(electionId, skip = 0, limit = 200) {
    return this.requestWithDedup(
      `/elections/${electionId}/voter-roll?skip=${skip}&limit=${limit}`
    );
  }

  async addVoterToRoll(electionId, electorateId) {
    this.clearCache("/elections");
    return this.request(`/elections/${electionId}/voter-roll`, {
      method: "POST",
      body: JSON.stringify({ electorate_id: electorateId }),
    });
  }

  async removeVoterFromRoll(electionId, electorateId) {
    this.clearCache("/elections");
    return this.request(
      `/elections/${electionId}/voter-roll/${electorateId}`,
      { method: "DELETE" }
    );
  }

  async bulkUploadVoterRoll(electionId, file) {
    const formData = new FormData();
    formData.append("file", file);
    const token = localStorage.getItem("admin_token");
    const response = await fetch(
      `${API_BASE_URL}/elections/${electionId}/voter-roll/bulk-upload`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      }
    );
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Voter roll bulk upload failed");
    }
    this.clearCache("/elections");
    return response.json();
  }

  // -------------------------------------------------------------------------
  // Portfolios
  // -------------------------------------------------------------------------

  async getPortfolios() {
    return this.requestWithDedup(`/portfolios?${this._electionQuery()}`);
  }

  async createPortfolio(data) {
    const payload = { ...data, election_id: this._activeElectionId };
    this.clearCache("/portfolios");
    this.clearCache("/admin/statistics");
    return this.request(`/portfolios?${this._electionQuery()}`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async updatePortfolio(id, data) {
    this.clearCache("/portfolios");
    this.clearCache("/admin/statistics");
    return this.request(`/portfolios/${id}?${this._electionQuery()}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deletePortfolio(id) {
    this.clearCache("/portfolios");
    this.clearCache("/admin/statistics");
    return this.request(`/portfolios/${id}?${this._electionQuery()}`, {
      method: "DELETE",
    });
  }

  // -------------------------------------------------------------------------
  // Candidates
  // -------------------------------------------------------------------------

  async getCandidates() {
    return this.requestWithDedup(
      `/candidates?${this._electionQuery("active_only=false")}`
    );
  }

  async createCandidate(data) {
    this.clearCache("/candidates");
    this.clearCache("/admin/statistics");
    this.clearCache("/admin/results");
    return this.request(`/candidates?${this._electionQuery()}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateCandidate(id, data) {
    this.clearCache("/candidates");
    this.clearCache("/admin/statistics");
    this.clearCache("/admin/results");
    return this.request(`/candidates/${id}?${this._electionQuery()}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteCandidate(id) {
    this.clearCache("/candidates");
    this.clearCache("/admin/statistics");
    this.clearCache("/admin/results");
    return this.request(`/candidates/${id}?${this._electionQuery()}`, {
      method: "DELETE",
    });
  }

  async uploadCandidateImage(file) {
    const formData = new FormData();
    formData.append("file", file);
    const token = localStorage.getItem("admin_token");
    const response = await fetch(`${API_BASE_URL}/candidates/upload-image`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Image upload failed");
    }
    return response.json();
  }

  // -------------------------------------------------------------------------
  // Electorates
  // -------------------------------------------------------------------------

  async getElectorates(skip = 0, limit = 50) {
    return this.requestWithDedup(`/admin/voters?skip=${skip}&limit=${limit}`);
  }

  /**
   * Fetch ALL electorates by walking pages until a partial page is returned.
   * Uses plain request() (not requestWithDedup) so every page is a live fetch
   * and the pagination loop never gets a stale cached response.
   * PAGE_SIZE is kept at 500 — large enough to be efficient, small enough to
   * avoid backend query-planner issues on 3000+ row tables.
   */
  async getAllElectorates() {
    const PAGE_SIZE = 500;
    const all = [];
    let skip = 0;
    while (true) {
      const page = await this.request(`/admin/voters?skip=${skip}&limit=${PAGE_SIZE}`);
      const rows = Array.isArray(page) ? page : (page?.items ?? []);
      all.push(...rows);
      if (rows.length < PAGE_SIZE) break;
      skip += PAGE_SIZE;
    }
    return all;
  }

  async createElectorate(data) {
    this.clearCache("/admin/voters");
    this.clearCache("/admin/statistics");
    return this.request("/electorates/", { method: "POST", body: JSON.stringify(data) });
  }

  async updateElectorate(id, data) {
    this.clearCache("/admin/voters");
    this.clearCache("/admin/statistics");
    return this.request(`/electorates/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteElectorate(id) {
    this.clearCache("/admin/voters");
    this.clearCache("/admin/statistics");
    return this.request(`/electorates/${id}`, { method: "DELETE" });
  }

  async bulkCreateElectorates(data) {
    this.clearCache("/admin/voters");
    this.clearCache("/admin/statistics");
    return this.request("/electorates/bulk", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async bulkUploadElectorates(file) {
    const electionId = this._activeElectionId;
    if (!electionId) {
      throw new Error("No active election selected. Select an election before uploading voters.");
    }
    const formData = new FormData();
    formData.append("file", file);
    formData.append("election_id", electionId);   // required by the backend route
    const token = localStorage.getItem("admin_token");
    const response = await fetch(`${API_BASE_URL}/electorates/bulk-upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Bulk upload failed");
    }
    this.clearCache("/admin/voters");
    this.clearCache("/admin/statistics");
    return response.json();
  }

  // -------------------------------------------------------------------------
  // Token Generation
  // -------------------------------------------------------------------------

  async generateTokensForAll(options = {}) {
    this.clearCache("/admin/voters");
    this.clearCache("/admin/statistics");
    return this.request("/admin/generate-tokens/all", {
      method: "POST",
      body: JSON.stringify({
        election_id: this._activeElectionId,
        exclude_voted: options.exclude_voted ?? true,
      }),
    });
  }

  async generateTokensForElectorates(electorate_ids) {
    this.clearCache("/admin/voters");
    this.clearCache("/admin/statistics");
    return this.request("/admin/generate-tokens/bulk", {
      method: "POST",
      body: JSON.stringify({
        election_id: this._activeElectionId,
        electorate_ids,
      }),
    });
  }

  async regenerateTokenForElectorate(electorate_id) {
    this.clearCache("/admin/voters");
    this.clearCache("/admin/statistics");
    return this.request(`/admin/regenerate-token/${electorate_id}`, {
      method: "POST",
      body: JSON.stringify({
        election_id: this._activeElectionId,
      }),
    });
  }

  // -------------------------------------------------------------------------
  // Statistics & Results — FIX #3, #4, #5, #6: election_id now included
  // -------------------------------------------------------------------------

  async getStatistics() {
    return this.requestWithDedup(`/admin/statistics?${this._electionQuery()}`);
  }

  async getResults() {
    return this.requestWithDedup(`/admin/results?${this._electionQuery()}`);
  }

  async getRecentActivity(limit = 50) {
    return this.requestWithDedup(
      `/admin/recent-activity?${this._electionQuery(`limit=${limit}`)}`
    );
  }

  async getElectorateTokens() {
    return this.requestWithDedup(
      `/admin/electorate-tokens?${this._electionQuery()}`
    );
  }
}

export const api = new ApiService();