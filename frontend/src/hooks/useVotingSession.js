/**
 * useVotingSession.js — Voter Session Hook
 *
 * FIXES APPLIED:
 * ─────────────────────────────────────────
 * 1. Removed all calls to votingApi.refreshAccessToken() and
 *    votingApi.needsRefresh() — these methods do not exist on the backend.
 *    The backend issues single-use short-lived JWTs with no refresh endpoint.
 *
 * 2. SESSION_TIMEOUT is no longer hardcoded at 30 minutes.
 *    login() now accepts data.expires_in (seconds) from the
 *    POST /auth/verify-id response and uses that as the timer duration.
 *    Falls back to 600 s (10 min) if the field is absent.
 *
 * 3. Periodic token health-check now calls votingApi.checkSession()
 *    (which hits GET /auth/verify-session) instead of the non-existent
 *    refreshAccessToken().  If the session is invalid the voter is
 *    logged out immediately.
 *
 * 4. On mount, an existing token is validated via votingApi.checkSession()
 *    before restoring the authenticated state — prevents stale tokens from
 *    silently failing mid-ballot.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { votingApi } from "../services/votingApi";

// How often (ms) we ping the backend to check the session is still alive.
const TOKEN_CHECK_INTERVAL = 60_000; // 1 minute

export const useVotingSession = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [voterData, setVoterData] = useState(null);
  // sessionTime: milliseconds remaining — driven by a countdown.
  const [sessionTime, setSessionTime] = useState(0);
  const [loading, setLoading] = useState(true);

  // Refs so interval/timeout callbacks always see current values without
  // needing to be recreated on every render.
  const sessionTimerRef = useRef(null);   // countdown interval
  const tokenCheckRef = useRef(null);   // health-check interval
  const sessionDurationMs = useRef(0);      // total session length in ms

  // -------------------------------------------------------------------------
  // Cleanup helpers
  // -------------------------------------------------------------------------

  const clearAllTimers = useCallback(() => {
    if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    if (tokenCheckRef.current) clearInterval(tokenCheckRef.current);
    sessionTimerRef.current = null;
    tokenCheckRef.current = null;
  }, []);

  // -------------------------------------------------------------------------
  // logout — callable from anywhere
  // -------------------------------------------------------------------------

  const logout = useCallback(() => {
    clearAllTimers();
    votingApi.clearToken();
    setIsAuthenticated(false);
    setVoterData(null);
    setSessionTime(0);
  }, [clearAllTimers]);

  // -------------------------------------------------------------------------
  // startTimers — kicks off the countdown and the periodic health check
  // -------------------------------------------------------------------------

  const startTimers = useCallback((durationMs) => {
    clearAllTimers();
    sessionDurationMs.current = durationMs;

    // 1. Countdown (updates every second)
    const startedAt = Date.now();
    sessionTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(durationMs - elapsed, 0);
      setSessionTime(remaining);
      if (remaining === 0) logout();
    }, 1000);

    // 2. Backend health check (once per minute)
    tokenCheckRef.current = setInterval(async () => {
      // First do a cheap client-side expiry check
      if (votingApi.isTokenExpired()) {
        logout();
        return;
      }
      // Then verify the session is still recognised server-side
      try {
        const valid = await votingApi.checkSession();
        if (!valid) logout();
      } catch {
        logout();
      }
    }, TOKEN_CHECK_INTERVAL);
  }, [clearAllTimers, logout]);

  // -------------------------------------------------------------------------
  // login — called by TokenVerification once /auth/verify-id succeeds
  //
  // Expected shape of `data`:
  //   {
  //     access_token : string,
  //     expires_in   : number,   // seconds — from backend JWT config
  //     electorate   : { student_id, program, … }
  //   }
  // -------------------------------------------------------------------------

  const login = useCallback((data) => {
    const expiresInMs = (data.expires_in ?? 600) * 1000; // default 10 min

    setIsAuthenticated(true);
    setVoterData(data.electorate);
    setSessionTime(expiresInMs);

    startTimers(expiresInMs);
  }, [startTimers]);

  // -------------------------------------------------------------------------
  // On mount — restore session if a token already exists in storage
  // -------------------------------------------------------------------------

  useEffect(() => {
    const restoreSession = async () => {
      try {
        // votingApi stores the token in sessionStorage after verifyToken()
        if (!votingApi.getToken()) return;

        // Validate the stored token is still accepted by the server
        const valid = await votingApi.checkSession();
        if (!valid) {
          votingApi.clearToken();
          return;
        }

        // We don't know how much time is left from storage alone, so we
        // check the decoded expiry via the helper (if implemented) or fall
        // back to a conservative 5-minute remaining window.
        const remainingMs = votingApi.getRemainingTime?.() ?? 5 * 60 * 1000;
        if (remainingMs <= 0) {
          votingApi.clearToken();
          return;
        }

        // Attempt to get voter data from session storage
        const stored = votingApi.getStoredVoterData?.();
        setVoterData(stored ?? null);
        setIsAuthenticated(true);
        setSessionTime(remainingMs);
        startTimers(remainingMs);
      } catch {
        votingApi.clearToken();
      } finally {
        setLoading(false);
      }
    };

    restoreSession();

    // Clean up all timers when the component unmounts
    return clearAllTimers;
  }, [startTimers, clearAllTimers]);

  return {
    isAuthenticated,
    voterData,
    sessionTime,  // milliseconds remaining
    loading,
    login,
    logout,
  };
};