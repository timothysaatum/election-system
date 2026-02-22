import { useState, useEffect, useCallback, useRef } from "react";
import { BarChart3, Users, TrendingUp, RefreshCw, LogOut, Wifi, WifiOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { AlertModal } from "../components/Modal";
import { ToastContainer } from "../components/Toast";
import { useModal } from "../hooks/useModal";
import { useToast } from "../hooks/useToast";

// ---------------------------------------------------------------------------
// Portfolio Card
// ---------------------------------------------------------------------------

const SimplePortfolioCard = ({ portfolio }) => {
  const totalVotes = (portfolio.total_votes || 0) + (portfolio.total_rejected || 0);

  return (
    <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        {portfolio.portfolio_name || portfolio.name}
      </h3>

      <div className="mb-4">
        <p className="text-sm text-gray-600">Total Votes</p>
        <p className="text-2xl font-bold text-gray-900">{totalVotes}</p>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Connection status badge
// ---------------------------------------------------------------------------

const StreamStatus = ({ connected }) => (
  <span
    className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${connected
      ? "bg-green-100 text-green-700"
      : "bg-red-100 text-red-700"
      }`}
  >
    {connected ? (
      <>
        <Wifi className="h-3 w-3" /> Live
      </>
    ) : (
      <>
        <WifiOff className="h-3 w-3" /> Reconnecting…
      </>
    )}
  </span>
);

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

const PollingAgentLogin = ({ onLogin, alertModal }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!username || !password) {
      alertModal.showAlert({
        title: "Error",
        message: "Please enter username and password",
        type: "error",
      });
      return;
    }

    setLoading(true);
    try {
      const data = await api.login(username, password);

      if (data.role === "polling_agent" || data.role === "admin") {
        localStorage.setItem("admin_token", data.access_token);
        onLogin(data);
      } else {
        throw new Error(
          `Access denied. This portal is for Polling Agents only. You are logged in as ${data.role}.`
        );
      }
    } catch (err) {
      alertModal.showAlert({
        title: "Login Failed",
        message: err.message || "Invalid credentials",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-teal-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <BarChart3 className="h-16 w-16 text-green-600 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900">Live Results Portal</h1>
          <p className="text-gray-600 mt-2">Polling Agent Access</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="Enter username"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="Enter password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium transition-colors"
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Dashboard — SSE-powered
// ---------------------------------------------------------------------------

const PollingAgentDashboard = ({ agent, onLogout }) => {
  const [stats, setStats] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [streamsConnected, setStreamsConnected] = useState(false);

  // Refs to hold the two EventSource instances so we can close them on unmount
  const resultsStreamRef = useRef(null);
  const statsStreamRef = useRef(null);
  // Track how many streams have successfully received at least one message
  const connectedCountRef = useRef(0);

  const alertModalRef = useRef(useModal());
  const alertModal = alertModalRef.current;
  const toast = useToast();

  // ---- helpers ----

  const markConnected = useCallback(() => {
    connectedCountRef.current += 1;
    // Both streams are up once we've received from each
    if (connectedCountRef.current >= 2) {
      setStreamsConnected(true);
      setLoading(false);
    }
  }, []);

  const closeStreams = useCallback(() => {
    if (resultsStreamRef.current) {
      resultsStreamRef.current.close();
      resultsStreamRef.current = null;
    }
    if (statsStreamRef.current) {
      statsStreamRef.current.close();
      statsStreamRef.current = null;
    }
    connectedCountRef.current = 0;
  }, []);

  // ---- open SSE connections ----

  const openStreams = useCallback(() => {
    closeStreams();
    setStreamsConnected(false);

    // Results stream
    resultsStreamRef.current = api.streamResults(
      (data) => {
        setResults(data);
        setLastUpdate(new Date());
        if (connectedCountRef.current < 1) markConnected();
      },
      (err) => {
        console.error("[SSE] Results stream error:", err);
        setStreamsConnected(false);
        // EventSource auto-reconnects natively; we just reflect the status
      }
    );

    // Statistics stream
    statsStreamRef.current = api.streamStatistics(
      (data) => {
        setStats(data);
        setLastUpdate(new Date());
        if (connectedCountRef.current < 2) markConnected();
      },
      (err) => {
        console.error("[SSE] Statistics stream error:", err);
        setStreamsConnected(false);
      }
    );
  }, [closeStreams, markConnected]);

  // Open streams on mount, close on unmount
  useEffect(() => {
    openStreams();
    return closeStreams;
  }, [openStreams, closeStreams]);

  // ---- manual refresh: close & re-open streams ----
  const handleManualRefresh = useCallback(() => {
    setLoading(true);
    openStreams();
  }, [openStreams]);

  // ---- render ----

  const votingStats = stats?.voting || {};

  return (
    <div className="min-h-screen bg-gray-50">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />
      <AlertModal {...alertModal} onClose={alertModal.handleClose} {...alertModal.modalProps} />

      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Kratos (Live Results)</h1>
              <p className="text-sm text-gray-600">
                Welcome, {agent?.username}
                <span className="ml-2 text-green-600 font-medium">
                  ({agent?.role === "admin" ? "Admin Access" : "Polling Agent"})
                </span>
              </p>
            </div>

            <div className="flex items-center gap-4">
              {/* Live / Reconnecting badge */}
              <StreamStatus connected={streamsConnected} />

              {/* Manual refresh */}
              <button
                onClick={handleManualRefresh}
                disabled={loading}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50 transition-colors"
                title="Reconnect streams"
              >
                <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
              </button>

              <button
                onClick={onLogout}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <LogOut className="h-5 w-5" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Votes</p>
                <p className="text-3xl font-bold text-gray-900">
                  {votingStats?.total_votes || 0}
                </p>
              </div>
              <BarChart3 className="h-12 w-12 text-green-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Voters</p>
                <p className="text-3xl font-bold text-gray-900">
                  {votingStats?.total_electorates || 0}
                </p>
              </div>
              <Users className="h-12 w-12 text-blue-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Voted</p>
                <p className="text-3xl font-bold text-gray-900">
                  {votingStats?.voted_electorates || 0}
                </p>
              </div>
              <TrendingUp className="h-12 w-12 text-purple-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Turnout</p>
                <p className="text-3xl font-bold text-gray-900">
                  {votingStats?.voting_percentage?.toFixed(1) || 0}%
                </p>
              </div>
              <BarChart3 className="h-12 w-12 text-orange-500" />
            </div>
          </div>
        </div>

        {/* Portfolio results */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Portfolio Results</h2>

          {loading && !results ? (
            <div className="text-center py-12">
              <RefreshCw className="h-12 w-12 text-green-600 animate-spin mx-auto" />
              <p className="mt-4 text-gray-600">Connecting to live results…</p>
            </div>
          ) : !results || results.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <p className="text-gray-600">No results available yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {results.map((portfolio) => (
                <SimplePortfolioCard
                  key={portfolio.portfolio_id}
                  portfolio={portfolio}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">
            Last updated: {lastUpdate.toLocaleTimeString()}
            {streamsConnected ? "" : " (Disconnected, trying to reconnect…)"}
          </p>
        </div>
      </main>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Root — auth gate
// ---------------------------------------------------------------------------

export default function PollingAgentPortal() {
  const navigate = useNavigate();
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const alertModal = useModal();

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem("admin_token");
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const data = await api.verify();

      if (data.role === "polling_agent" || data.role === "admin") {
        setAgent(data);
      } else {
        const correctRoute = api.getRoleBasedRoute(data.role);
        localStorage.removeItem("admin_token");
        await alertModal.showAlert({
          title: "Access Denied",
          message: `This page is for Polling Agents only. Redirecting to ${data.role} portal…`,
          type: "error",
        });
        setTimeout(() => navigate(correctRoute), 2000);
        return;
      }
    } catch (err) {
      console.error("Auth check failed:", err);
      localStorage.removeItem("admin_token");
      await alertModal.showAlert({
        title: "Access Denied",
        message: err.message || "You don't have permission to access this portal",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [alertModal, navigate]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const handleLogin = (data) => {
    if (data.role === "polling_agent" || data.role === "admin") {
      setAgent(data);
    } else {
      const correctRoute = api.getRoleBasedRoute(data.role);
      alertModal.showAlert({
        title: "Wrong Portal",
        message: `You are logged in as ${data.role}. Redirecting to your portal…`,
        type: "info",
      });
      setTimeout(() => navigate(correctRoute), 2000);
      localStorage.removeItem("admin_token");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    setAgent(null);
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <RefreshCw className="h-12 w-12 text-green-600 animate-spin" />
      </div>
    );
  }

  if (!agent) {
    return (
      <>
        <AlertModal {...alertModal} onClose={alertModal.handleClose} {...alertModal.modalProps} />
        <PollingAgentLogin onLogin={handleLogin} alertModal={alertModal} />
      </>
    );
  }

  return <PollingAgentDashboard agent={agent} onLogout={handleLogout} />;
}