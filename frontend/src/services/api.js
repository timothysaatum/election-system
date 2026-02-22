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
      const cacheKey = `GET:${endpoint}`;
      dataCache.delete(cacheKey);
    } else {
      dataCache.clear();
    }
  }

  // -------------------------------------------------------------------------
  // SSE Streaming
  // -------------------------------------------------------------------------

  /**
   * Opens an SSE connection to a streaming endpoint.
   *
   * Because the native EventSource API cannot send custom headers (like
   * Authorization), we pass the JWT as a ?token= query param. The backend
   * reads it from there as a fallback.
   *
   * @param {string} endpoint         - e.g. "/admin/stream/results"
   * @param {Function} onMessage      - called with the parsed JSON payload on each event
   * @param {Function} [onError]      - called when a connection error occurs
   * @param {number}   [interval=3]  - server-side push interval in seconds
   * @returns {EventSource}           - call .close() to stop streaming
   */
  streamSSE(endpoint, onMessage, onError = null, interval = 3) {
    const token = localStorage.getItem("admin_token");
    if (!token) {
      const err = new Error("No auth token found");
      if (onError) onError(err);
      return null;
    }

    const url = `${API_BASE_URL}${endpoint}?token=${encodeURIComponent(token)}&interval=${interval}`;
    const es = new EventSource(url);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch (parseError) {
        console.error("[SSE] Failed to parse message:", parseError);
      }
    };

    es.addEventListener("error", (event) => {
      // event here is an SSE error event, not a JS Error object
      const err = new Error("SSE connection error");
      console.error("[SSE] Connection error on", endpoint, event);
      if (onError) onError(err);
    });

    return es;
  }

  /**
   * Stream live election results.
   * @param {Function} onData   - called with parsed results array on each push
   * @param {Function} onError  - called on connection error
   * @param {number} interval   - seconds between server pushes (default 3)
   * @returns {EventSource}
   */
  streamResults(onData, onError = null, interval = 3) {
    return this.streamSSE("/admin/stream/results", onData, onError, interval);
  }

  /**
   * Stream live election statistics.
   * @param {Function} onData   - called with parsed stats object on each push
   * @param {Function} onError  - called on connection error
   * @param {number} interval   - seconds between server pushes (default 3)
   * @returns {EventSource}
   */
  streamStatistics(onData, onError = null, interval = 3) {
    return this.streamSSE("/admin/stream/statistics", onData, onError, interval);
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

  async refreshToken() {
    return this.request("/auth/refresh", { method: "POST" });
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
  // Portfolios
  // -------------------------------------------------------------------------

  async getPortfolios() {
    return this.requestWithDedup("/portfolios");
  }

  async createPortfolio(data) {
    this.clearCache("/portfolios");
    this.clearCache("/admin/statistics");
    return this.request("/portfolios", { method: "POST", body: JSON.stringify(data) });
  }

  async updatePortfolio(id, data) {
    this.clearCache("/portfolios");
    this.clearCache("/admin/statistics");
    return this.request(`/portfolios/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  }

  async deletePortfolio(id) {
    this.clearCache("/portfolios");
    this.clearCache("/admin/statistics");
    return this.request(`/portfolios/${id}`, { method: "DELETE" });
  }

  // -------------------------------------------------------------------------
  // Candidates
  // -------------------------------------------------------------------------

  async getCandidates() {
    return this.requestWithDedup("/candidates?active_only=false");
  }

  async createCandidate(data) {
    this.clearCache("/candidates?active_only=false");
    this.clearCache("/admin/statistics");
    this.clearCache("/admin/results");
    return this.request("/candidates", { method: "POST", body: JSON.stringify(data) });
  }

  async updateCandidate(id, data) {
    this.clearCache("/candidates?active_only=false");
    this.clearCache("/admin/statistics");
    this.clearCache("/admin/results");
    return this.request(`/candidates/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  }

  async deleteCandidate(id) {
    this.clearCache("/candidates?active_only=false");
    this.clearCache("/admin/statistics");
    this.clearCache("/admin/results");
    return this.request(`/candidates/${id}`, { method: "DELETE" });
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

  async getElectorates(skip = 0, limit = 100) {
    return this.requestWithDedup(`/admin/voters?skip=${skip}&limit=${limit}`);
  }

  async createElectorate(data) {
    this.clearCache("/admin/voters");
    this.clearCache("/admin/statistics");
    return this.request("/electorates", { method: "POST", body: JSON.stringify(data) });
  }

  async updateElectorate(id, data) {
    this.clearCache("/admin/voters");
    this.clearCache("/admin/statistics");
    return this.request(`/electorates/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  }

  async deleteElectorate(id) {
    this.clearCache("/admin/voters");
    this.clearCache("/admin/statistics");
    return this.request(`/electorates/${id}`, { method: "DELETE" });
  }

  async bulkCreateElectorates(data) {
    this.clearCache("/admin/voters");
    this.clearCache("/admin/statistics");
    return this.request("/electorates/bulk", { method: "POST", body: JSON.stringify(data) });
  }

  async bulkUploadElectorates(file) {
    const formData = new FormData();
    formData.append("file", file);
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
        election_name: options.election_name || "Election",
        voting_url: options.voting_url || window.location.origin,
        send_notifications: options.send_notifications ?? true,
        notification_methods: options.notification_methods || ["email", "sms"],
        exclude_voted: options.exclude_voted ?? true,
      }),
    });
  }

  async generateTokensForElectorates(electorate_ids, options = {}) {
    this.clearCache("/admin/voters");
    this.clearCache("/admin/statistics");
    return this.request("/admin/generate-tokens/bulk", {
      method: "POST",
      body: JSON.stringify({
        electorate_ids,
        election_name: options.election_name || "Election",
        voting_url: options.voting_url || window.location.origin,
        send_notifications: options.send_notifications ?? true,
        notification_methods: options.notification_methods || ["email", "sms"],
      }),
    });
  }

  async regenerateTokenForElectorate(electorate_id, options = {}) {
    this.clearCache("/admin/voters");
    this.clearCache("/admin/statistics");
    return this.request(`/admin/regenerate-token/${electorate_id}`, {
      method: "POST",
      body: JSON.stringify({
        election_name: options.election_name || "Election",
        voting_url: options.voting_url || window.location.origin,
        send_notification: options.send_notification ?? true,
        notification_methods: options.notification_methods || ["email", "sms"],
      }),
    });
  }

  // -------------------------------------------------------------------------
  // Statistics & Results (one-shot, kept for non-streaming uses)
  // -------------------------------------------------------------------------

  async getStatistics() {
    return this.requestWithDedup("/admin/statistics");
  }

  async getResults() {
    return this.requestWithDedup("/admin/results");
  }

  async getRecentActivity(limit = 50) {
    return this.requestWithDedup(`/admin/recent-activity?limit=${limit}`);
  }

  async getElectorateTokens() {
    return this.requestWithDedup("/admin/electorate-tokens");
  }
}

export const api = new ApiService();