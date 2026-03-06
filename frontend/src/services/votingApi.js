/**
 * votingApi.js — Voter-side API Service
 *
 */

const API_BASE_URL = process.env.REACT_APP_API_URL || "/api";

const TOKEN_KEY = "voting_token";
const VOTER_DATA_KEY = "voting_voter_data";

class VotingApiService {
  // -------------------------------------------------------------------------
  // Internal request helper
  // -------------------------------------------------------------------------

  async request(endpoint, options = {}) {
    const token = this.getToken();
    const headers = {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    // 401 — token invalid / expired
    if (response.status === 401) {
      this.clearToken();
      // Do NOT redirect automatically — let the component/hook decide
      throw new Error("Session expired. Please verify your token again.");
    }

    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Request failed");
    return data;
  }

  // -------------------------------------------------------------------------
  // Token storage
  // -------------------------------------------------------------------------

  getToken() {
    try {
      return sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  setToken(token) {
    try {
      sessionStorage.setItem(TOKEN_KEY, token);
    } catch {
      console.warn("[votingApi] sessionStorage unavailable — token kept in memory only");
    }
  }

  clearToken() {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(VOTER_DATA_KEY);
    } catch {
      // ignore
    }
  }

  // -------------------------------------------------------------------------
  // — voter data persistence
  // -------------------------------------------------------------------------

  saveVoterData(data) {
    try {
      sessionStorage.setItem(VOTER_DATA_KEY, JSON.stringify(data));
    } catch {
      // ignore
    }
  }

  getStoredVoterData() {
    try {
      const raw = sessionStorage.getItem(VOTER_DATA_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // — JWT expiry helpers
  // -------------------------------------------------------------------------

  /**
   * Decode the JWT payload without verifying the signature (client-side only).
   * Returns null if the token is missing or malformed.
   */
  _decodeJwtPayload() {
    const token = this.getToken();
    if (!token) return null;
    try {
      const [, payloadB64] = token.split(".");
      const json = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  /**
   * Returns true if the stored JWT is missing or its exp claim is in the past.
   */
  isTokenExpired() {
    const payload = this._decodeJwtPayload();
    if (!payload) return true;
    return Date.now() >= payload.exp * 1000;
  }

  /**
   * Returns milliseconds remaining until the JWT expires.
   * Returns 0 if expired or token unavailable.
   */
  getRemainingTime() {
    const payload = this._decodeJwtPayload();
    if (!payload) return 0;
    return Math.max(payload.exp * 1000 - Date.now(), 0);
  }

  // -------------------------------------------------------------------------
  // Auth endpoints
  // -------------------------------------------------------------------------

  /**
   * — POST /auth/verify-id
   * Sends { token, student_id } matching TokenVerificationRequest.
   * Stores the JWT and voter data on success.
   */
  async verifyToken(token, studentId) {
    const data = await this.request("/auth/verify-id", {
      method: "POST",
      body: JSON.stringify({
        token: token,
        student_id: studentId,
      }),
    });

    // Store the access token for subsequent requests
    if (data.access_token) {
      this.setToken(data.access_token);
    }

    // Persist electorate data so session can be restored on page refresh
    if (data.electorate) {
      this.saveVoterData(data.electorate);
    }

    return data;
  }

  /**
   * GET /auth/verify-session — lightweight session check.
   * Returns true if the session is still valid, false otherwise.
   * Does NOT throw on 401 (treats it as "session invalid").
   */
  async checkSession() {
    try {
      await this.request("/auth/verify-session");
      return true;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Voting endpoints
  // -------------------------------------------------------------------------

  /**
   * GET /voting/ballot
   * Returns the list of active candidates grouped by portfolio.
   */
  async getBallot() {
    return this.request("/voting/ballot");
  }

  /**
   * POST /voting/vote
   *
   * @param {Array<{ portfolio_id, candidate_id, vote_type }>} votes
   */
  async castVote(votes) {
    const VOTE_TYPE_MAP = {
      endorsed: "endorsed",
      rejected: "abstain",
      abstain: "abstain",
    };

    const payload = votes.map((v) => ({
      portfolio_id: v.portfolio_id,
      candidate_id: v.candidate_id,
      vote_type: VOTE_TYPE_MAP[v.vote_type] ?? "abstain",
    }));

    const result = await this.request("/voting/vote", {
      method: "POST",
      body: JSON.stringify({ votes: payload }),
    });

    // Session ends after a successful vote — clear storage immediately
    this.clearToken();
    return result;
  }

  /**
   * GET /voting/my-votes
   * Fetch this voter's submitted votes (useful for confirmation screen).
   * NOTE: call this BEFORE castVote() clears the token, or this will 401.
   */
  async getMyVotes() {
    return this.request("/voting/my-votes");
  }
}

export const votingApi = new VotingApiService();