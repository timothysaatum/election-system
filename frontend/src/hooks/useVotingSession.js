import { useState, useEffect, useCallback, useRef } from "react";
import { votingApi } from "../services/votingApi";

const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes (based on refresh token)
const TOKEN_CHECK_INTERVAL = 30 * 1000; // Check token every 30 seconds

export const useVotingSession = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [voterData, setVoterData] = useState(null);
  const [sessionTime, setSessionTime] = useState(SESSION_TIMEOUT);
  const [loading, setLoading] = useState(true);
  const sessionTimerRef = useRef(null);
  const tokenCheckTimerRef = useRef(null);

  // Initialize session from stored data
  useEffect(() => {
    const initializeSession = async () => {
      const token = votingApi.getToken();
      const storedVoter = votingApi.getVoterData();

      if (token && storedVoter) {
        // Check if token is expired
        if (votingApi.isTokenExpired()) {
          try {
            // Try to refresh
            await votingApi.refreshAccessToken();
            setIsAuthenticated(true);
            setVoterData(storedVoter);
          } catch (error) {
            console.error("Session initialization failed:", error);
            logout();
          }
        } else {
          // Token is still valid
          setIsAuthenticated(true);
          setVoterData(storedVoter);
        }
      }
      setLoading(false);
    };

    initializeSession();
  }, []);

  // Session timeout countdown
  useEffect(() => {
    if (!isAuthenticated) return;

    sessionTimerRef.current = setInterval(() => {
      setSessionTime((prev) => {
        const newTime = prev - 1000;
        if (newTime <= 0) {
          logout();
          return 0;
        }
        return newTime;
      });
    }, 1000);

    return () => {
      if (sessionTimerRef.current) {
        clearInterval(sessionTimerRef.current);
      }
    };
  }, [isAuthenticated]);

  // Periodic token refresh check
  useEffect(() => {
    if (!isAuthenticated) return;

    tokenCheckTimerRef.current = setInterval(async () => {
      try {
        // Check if token needs refresh
        if (votingApi.needsRefresh()) {
          console.log("Token needs refresh, refreshing...");
          await votingApi.refreshAccessToken();
          // Reset session timer since we have a fresh token
          setSessionTime(SESSION_TIMEOUT);
        }
      } catch (error) {
        console.error("Token refresh check failed:", error);
        logout();
      }
    }, TOKEN_CHECK_INTERVAL);

    return () => {
      if (tokenCheckTimerRef.current) {
        clearInterval(tokenCheckTimerRef.current);
      }
    };
  }, [isAuthenticated]);

  // Login function
  const login = useCallback((data) => {
    setIsAuthenticated(true);
    setVoterData(data.electorate);
    setSessionTime(SESSION_TIMEOUT);
  }, []);

  // Logout function
  const logout = useCallback(() => {
    votingApi.logout();
    setIsAuthenticated(false);
    setVoterData(null);
    setSessionTime(0);

    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current);
    }
    if (tokenCheckTimerRef.current) {
      clearInterval(tokenCheckTimerRef.current);
    }
  }, []);

  // Refresh session
  const refreshSession = useCallback(async () => {
    try {
      await votingApi.refreshAccessToken();
      setSessionTime(SESSION_TIMEOUT);
      return true;
    } catch (error) {
      logout();
      return false;
    }
  }, [logout]);

  // Format session time for display
  const formatSessionTime = useCallback(() => {
    const minutes = Math.floor(sessionTime / 60000);
    const seconds = Math.floor((sessionTime % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }, [sessionTime]);

  return {
    isAuthenticated,
    voterData,
    sessionTime,
    formattedSessionTime: formatSessionTime(),
    loading,
    login,
    logout,
    refreshSession,
  };
};

export default useVotingSession;