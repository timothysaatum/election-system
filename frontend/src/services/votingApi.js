// // const API_BASE_URL = "http://localhost:8000/api";
// const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000/api";

// const MAX_RETRIES = 3;
// const RETRY_DELAY = 1000;
// const TOKEN_REFRESH_THRESHOLD = 2 * 60 * 1000; // Refresh if less than 2 minutes left

// class VotingApiService {
//   constructor() {
//     this.tokenKey = "voting_token";
//     this.voterDataKey = "voter_data";
//     this.tokenExpiryKey = "token_expiry";
//     this.refreshPromise = null;
//   }

//   // Helper: Get stored token
//   getToken() {
//     return sessionStorage.getItem(this.tokenKey);
//   }

//   // Helper: Set token with expiry tracking
//   setToken(token, expiresIn = 600) {
//     sessionStorage.setItem(this.tokenKey, token);
//     const expiryTime = Date.now() + expiresIn * 1000;
//     sessionStorage.setItem(this.tokenExpiryKey, expiryTime.toString());
//   }

//   // Helper: Check if token needs refresh
//   needsRefresh() {
//     const expiryTime = sessionStorage.getItem(this.tokenExpiryKey);
//     if (!expiryTime) return false;

//     const timeUntilExpiry = parseInt(expiryTime) - Date.now();
//     return timeUntilExpiry > 0 && timeUntilExpiry < TOKEN_REFRESH_THRESHOLD;
//   }

//   // Helper: Check if token is expired
//   isTokenExpired() {
//     const expiryTime = sessionStorage.getItem(this.tokenExpiryKey);
//     if (!expiryTime) return true;

//     return Date.now() >= parseInt(expiryTime);
//   }

//   // Helper: Check if user has a token (logged in)
//   hasToken() {
//     return !!this.getToken();
//   }

//   // Helper: Clear token
//   clearToken() {
//     sessionStorage.removeItem(this.tokenKey);
//     sessionStorage.removeItem(this.voterDataKey);
//     sessionStorage.removeItem(this.tokenExpiryKey);
//     localStorage.removeItem(this.tokenKey);
//     localStorage.removeItem(this.voterDataKey);
//   }

//   // Helper: Refresh access token using refresh token cookie
//   async refreshAccessToken() {
//     if (this.refreshPromise) {
//       return this.refreshPromise;
//     }

//     this.refreshPromise = (async () => {
//       try {
//         const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
//           method: "POST",
//           credentials: "include",
//           headers: {
//             "Content-Type": "application/json",
//           },
//         });

//         if (!response.ok) {
//           throw new Error("Token refresh failed");
//         }

//         const data = await response.json();
//         this.setToken(data.access_token, data.expires_in);

//         console.log("Access token refreshed successfully");
//         return data.access_token;
//       } catch (error) {
//         console.error("Token refresh error:", error);
//         this.clearToken();
//         throw error;
//       } finally {
//         this.refreshPromise = null;
//       }
//     })();

//     return this.refreshPromise;
//   }

//   // Helper: Retry logic with exponential backoff
//   async retryRequest(fn, retries = MAX_RETRIES) {
//     for (let i = 0; i < retries; i++) {
//       try {
//         return await fn();
//       } catch (error) {
//         if (i === retries - 1) throw error;
//         await new Promise((resolve) =>
//           setTimeout(resolve, RETRY_DELAY * Math.pow(2, i))
//         );
//       }
//     }
//   }

//   // Helper: Make authenticated request with auto-refresh
//   async request(endpoint, options = {}) {
//     // DON'T try to refresh if we don't have a token yet
//     if (!this.hasToken()) {
//       // This is likely the initial login request, proceed normally
//       const headers = {
//         "Content-Type": "application/json",
//         ...options.headers,
//       };

//       const response = await fetch(`${API_BASE_URL}${endpoint}`, {
//         ...options,
//         headers,
//         credentials: "include",
//       });

//       if (!response.ok) {
//         const error = await response.json().catch(() => ({}));
//         throw new Error(
//           error.detail || `Request failed with status ${response.status}`
//         );
//       }

//       return response.json();
//     }

//     // Check if token needs refresh (only if we have a token)
//     if (this.needsRefresh() && !this.isTokenExpired()) {
//       try {
//         await this.refreshAccessToken();
//       } catch (error) {
//         console.error("Failed to refresh token:", error);
//         // Continue with existing token - it might still be valid
//       }
//     }

//     let token = this.getToken();

//     // If token is expired, try to refresh
//     if (this.isTokenExpired()) {
//       try {
//         token = await this.refreshAccessToken();
//       } catch (error) {
//         this.clearToken();
//         throw new Error("Session expired. Please verify your token again.");
//       }
//     }

//     const headers = {
//       "Content-Type": "application/json",
//       ...(token && { Authorization: `Bearer ${token}` }),
//       ...options.headers,
//     };

//     const response = await fetch(`${API_BASE_URL}${endpoint}`, {
//       ...options,
//       headers,
//       credentials: "include",
//     });

//     // Handle token expiration - try to refresh once
//     if (response.status === 401 && !options._isRetry) {
//       try {
//         await this.refreshAccessToken();
//         return this.request(endpoint, { ...options, _isRetry: true });
//       } catch (refreshError) {
//         this.clearToken();
//         throw new Error("Session expired. Please verify your token again.");
//       }
//     }

//     // Handle rate limiting
//     if (response.status === 429) {
//       const retryAfter = response.headers.get("Retry-After");
//       throw new Error(
//         `Rate limit exceeded. Please try again ${
//           retryAfter ? `in ${retryAfter} seconds` : "later"
//         }.`
//       );
//     }

//     if (!response.ok) {
//       const error = await response.json().catch(() => ({}));
//       throw new Error(
//         error.detail || `Request failed with status ${response.status}`
//       );
//     }

//     return response.json();
//   }

//   /**
//    * Verify voting token
//    */
//   async verifyToken(token, options = {}) {
//     const cleanToken = token.replace(/[^A-Za-z0-9]/g, "");

//     if (cleanToken.length !== 8) {
//       throw new Error("Token must be exactly 8 characters");
//     }

//     const data = await this.request("/auth/verify-id", {
//       method: "POST",
//       body: JSON.stringify({
//         token: cleanToken,
//         current_location: options.location || null,
//       }),
//     });

//     // Store token with expiry tracking
//     this.setToken(data.access_token, data.expires_in);
//     sessionStorage.setItem(this.voterDataKey, JSON.stringify(data.electorate));

//     return data;
//   }

//   /**
//    * Get voting ballot for authenticated voter
//    */
//   async getBallot() {
//     return this.retryRequest(() => this.request("/voting/ballot"));
//   }

//   /**
//    * Cast votes for selected candidates
//    */
//   async castVote(votes) {
//     if (!Array.isArray(votes) || votes.length === 0) {
//       throw new Error("Votes must be a non-empty array");
//     }

//     votes.forEach((vote) => {
//       if (!vote.portfolio_id || !vote.candidate_id) {
//         throw new Error("Each vote must have portfolio_id and candidate_id");
//       }
//     });

//     const result = await this.request("/voting/vote", {
//       method: "POST",
//       body: JSON.stringify({ votes }),
//     });

//     this.clearToken();
//     return result;
//   }

//   /**
//    * Get votes cast by current voter
//    */
//   async getMyVotes() {
//     return this.request("/voting/my-votes");
//   }

//   /**
//    * Check if current session is valid
//    */
//   async checkSession() {
//     try {
//       await this.request("/auth/verify");
//       return true;
//     } catch {
//       return false;
//     }
//   }

//   /**
//    * Get stored voter data
//    */
//   getVoterData() {
//     const data = sessionStorage.getItem(this.voterDataKey);
//     return data ? JSON.parse(data) : null;
//   }

//   /**
//    * Logout and clear all session data
//    */
//   logout() {
//     this.clearToken();
//   }
// }

// export const votingApi = new VotingApiService();
// export default votingApi;
// const API_BASE_URL = "http://localhost:8000/api";
const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000/api";
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const TOKEN_REFRESH_THRESHOLD = 2 * 60 * 1000; // Refresh if less than 2 minutes left

class VotingApiService {
  constructor() {
    this.tokenKey = "voting_token";
    this.voterDataKey = "voter_data";
    this.tokenExpiryKey = "token_expiry";
    this.refreshPromise = null;
  }

  // Helper: Get stored token
  getToken() {
    return sessionStorage.getItem(this.tokenKey);
  }

  // Helper: Set token with expiry tracking
  setToken(token, expiresIn = 600) {
    // Ensure expiresIn is a number
    const expiresInSeconds = parseInt(expiresIn, 10) || 600;
    sessionStorage.setItem(this.tokenKey, token);
    const expiryTime = Date.now() + expiresInSeconds * 1000;
    sessionStorage.setItem(this.tokenExpiryKey, expiryTime.toString());
    console.log(`[VotingAPI] Token set with expiry in ${expiresInSeconds} seconds`);
  }

  // Helper: Check if token needs refresh
  needsRefresh() {
    const expiryTime = sessionStorage.getItem(this.tokenExpiryKey);
    if (!expiryTime) return false;

    const timeUntilExpiry = parseInt(expiryTime) - Date.now();
    return timeUntilExpiry > 0 && timeUntilExpiry < TOKEN_REFRESH_THRESHOLD;
  }

  // Helper: Check if token is expired
  isTokenExpired() {
    const expiryTime = sessionStorage.getItem(this.tokenExpiryKey);
    if (!expiryTime) return true;

    return Date.now() >= parseInt(expiryTime);
  }

  // Helper: Check if user has a token (logged in)
  hasToken() {
    return !!this.getToken();
  }

  // Helper: Clear token
  clearToken() {
    sessionStorage.removeItem(this.tokenKey);
    sessionStorage.removeItem(this.voterDataKey);
    sessionStorage.removeItem(this.tokenExpiryKey);
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.voterDataKey);
  }

  // Helper: Refresh access token using refresh token cookie
  async refreshAccessToken() {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      try {
        console.log("[VotingAPI] Attempting to refresh access token...");
        const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          throw new Error("Token refresh failed");
        }

        const data = await response.json();
        this.setToken(data.access_token, data.expires_in);

        console.log("[VotingAPI] Access token refreshed successfully");
        return data.access_token;
      } catch (error) {
        console.error("[VotingAPI] Token refresh error:", error);
        this.clearToken();
        throw error;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  // Helper: Retry logic with exponential backoff
  async retryRequest(fn, retries = MAX_RETRIES) {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === retries - 1) throw error;
        const delay = RETRY_DELAY * Math.pow(2, i);
        console.log(`[VotingAPI] Retry ${i + 1}/${retries} after ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // Helper: Make authenticated request with auto-refresh
  async request(endpoint, options = {}) {
    // DON'T try to refresh if we don't have a token yet
    if (!this.hasToken()) {
      // This is likely the initial login request, proceed normally
      console.log(`[VotingAPI] Making unauthenticated request to ${endpoint}`);
      const headers = {
        "Content-Type": "application/json",
        ...options.headers,
      };

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(
          error.detail || `Request failed with status ${response.status}`
        );
      }

      return response.json();
    }

    // Check if token needs refresh (only if we have a token)
    if (this.needsRefresh() && !this.isTokenExpired()) {
      console.log("[VotingAPI] Token needs refresh - refreshing proactively...");
      try {
        await this.refreshAccessToken();
      } catch (error) {
        console.error("[VotingAPI] Failed to refresh token:", error);
        // Continue with existing token - it might still be valid
      }
    }

    let token = this.getToken();

    // If token is expired, try to refresh
    if (this.isTokenExpired()) {
      console.log("[VotingAPI] Token is expired - attempting refresh...");
      try {
        token = await this.refreshAccessToken();
      } catch (error) {
        this.clearToken();
        throw new Error("Session expired. Please verify your token again.");
      }
    }

    console.log(`[VotingAPI] Making authenticated request to ${endpoint} with token: ${token ? token.substring(0, 20) + "..." : "MISSING"}`);

    const headers = {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    };

    console.log("[VotingAPI] Request headers:", {
      Authorization: token ? "Bearer " + token.substring(0, 20) + "..." : "NONE",
      "Content-Type": headers["Content-Type"]
    });

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
      credentials: "include",
    });

    console.log(`[VotingAPI] Response status from ${endpoint}:`, response.status, response.statusText);

    // Handle token expiration - try to refresh once
    if (response.status === 401 && !options._isRetry) {
      console.log("[VotingAPI] Received 401 - attempting token refresh...");
      try {
        await this.refreshAccessToken();
        return this.request(endpoint, { ...options, _isRetry: true });
      } catch (refreshError) {
        console.error("[VotingAPI] Token refresh failed:", refreshError);
        this.clearToken();
        throw new Error("Session expired. Please verify your token again.");
      }
    }

    // Handle 403 specifically for voting
    if (response.status === 403) {
      const error = await response.json().catch(() => ({}));
      console.error("[VotingAPI] 403 Forbidden:", error);

      // If it's "Not authenticated", try refreshing token
      if (error.detail === "Not authenticated" && !options._isRetry) {
        console.log("[VotingAPI] Attempting to recover from authentication error...");
        try {
          await this.refreshAccessToken();
          return this.request(endpoint, { ...options, _isRetry: true });
        } catch (refreshError) {
          console.error("[VotingAPI] Cannot recover - session expired");
          this.clearToken();
          throw new Error("Session expired. Please verify your token again.");
        }
      }

      throw new Error(error.detail || "Access forbidden");
    }

    // Handle rate limiting
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      throw new Error(
        `Rate limit exceeded. Please try again ${retryAfter ? `in ${retryAfter} seconds` : "later"
        }.`
      );
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error(`[VotingAPI] Request failed with status ${response.status}:`, error);
      throw new Error(
        error.detail || `Request failed with status ${response.status}`
      );
    }

    return response.json();
  }

  /**
   * Verify voting token
   */
  async verifyToken(token, options = {}) {
    const cleanToken = token.replace(/[^A-Za-z0-9]/g, "");

    if (cleanToken.length !== 8) {
      throw new Error("Token must be exactly 8 characters");
    }

    console.log("[VotingAPI] Verifying token...");
    const data = await this.request("/auth/verify-id", {
      method: "POST",
      body: JSON.stringify({
        token: cleanToken,
        current_location: options.location || null,
      }),
    });

    // Store token with expiry tracking
    this.setToken(data.access_token, data.expires_in);
    sessionStorage.setItem(this.voterDataKey, JSON.stringify(data.electorate));

    console.log("[VotingAPI] Token verified successfully, expires in:", data.expires_in, "seconds");
    return data;
  }

  /**
   * Get voting ballot for authenticated voter
   */
  async getBallot() {
    console.log("[VotingAPI] Fetching ballot...");
    return this.retryRequest(() => this.request("/voting/ballot"));
  }

  /**
   * Cast votes for selected candidates
   */
  async castVote(votes) {
    if (!Array.isArray(votes) || votes.length === 0) {
      throw new Error("Votes must be a non-empty array");
    }

    votes.forEach((vote) => {
      if (!vote.portfolio_id || !vote.candidate_id) {
        throw new Error("Each vote must have portfolio_id and candidate_id");
      }
    });

    console.log("[VotingAPI] Casting votes:", votes.length, "selections");

    // Ensure we have a valid token before casting vote
    if (this.isTokenExpired()) {
      console.log("[VotingAPI] Token expired before vote submission - refreshing...");
      try {
        await this.refreshAccessToken();
      } catch (error) {
        throw new Error("Your session has expired. Please verify your token again.");
      }
    }

    const result = await this.request("/voting/vote", {
      method: "POST",
      body: JSON.stringify({ votes }),
    });

    console.log("[VotingAPI] Vote cast successfully");
    this.clearToken();
    return result;
  }

  /**
   * Get votes cast by current voter
   */
  async getMyVotes() {
    console.log("[VotingAPI] Fetching my votes...");
    return this.request("/voting/my-votes");
  }

  /**
   * Check if current session is valid
   */
  async checkSession() {
    try {
      console.log("[VotingAPI] Checking session validity...");
      await this.request("/auth/verify");
      console.log("[VotingAPI] Session is valid");
      return true;
    } catch (error) {
      console.log("[VotingAPI] Session is invalid:", error.message);
      return false;
    }
  }

  /**
   * Get stored voter data
   */
  getVoterData() {
    const data = sessionStorage.getItem(this.voterDataKey);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Logout and clear all session data
   */
  logout() {
    console.log("[VotingAPI] Logging out...");
    this.clearToken();
  }
}

export const votingApi = new VotingApiService();
export default votingApi;