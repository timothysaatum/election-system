import { useState, useEffect, useCallback, useRef } from "react";
import { BarChart3, Users, TrendingUp, RefreshCw, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { AlertModal } from "../components/Modal";
import { ToastContainer } from "../components/Toast";
import { useModal } from "../hooks/useModal";
import { useToast } from "../hooks/useToast";

const SimplePortfolioCard = ({ portfolio }) => {
  const totalVotes = portfolio.total_votes || 0;
  const totalRejected = portfolio.total_rejected || 0;
  const candidates = portfolio.candidates || [];

  return (
    <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        {portfolio.portfolio_name || portfolio.name}
      </h3>

      <div className="mb-4 grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-gray-600">Endorsed</p>
          <p className="text-2xl font-bold text-green-600">{totalVotes}</p>
        </div>
        <div>
          <p className="text-sm text-gray-600">Rejected</p>
          <p className="text-2xl font-bold text-red-600">{totalRejected}</p>
        </div>
      </div>

      {/* {candidates.length > 0 && (
        <div className="border-t pt-4 mt-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">Candidates</p>
          <div className="space-y-2">
            {candidates.map((candidate) => (
              <div key={candidate.id} className="text-sm">
                <p className="font-medium text-gray-800">{candidate.name}</p>
                <div className="flex gap-4 text-xs">
                  <span className="text-green-600">
                    ✓ {candidate.vote_count || 0} endorsed
                  </span>
                  <span className="text-red-600">
                    ✗ {candidate.rejected_count || 0} rejected
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )} */}
    </div>
  );
};

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

      // FIXED: Allow polling_agent AND admin roles
      if (data.role === "polling_agent" || data.role === "admin") {
        localStorage.setItem("admin_token", data.access_token);
        onLogin(data);
      } else {
        throw new Error(`Access denied. This portal is for Polling Agents only. You are logged in as ${data.role}.`);
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
          <h1 className="text-3xl font-bold text-gray-900">
            Live Results Portal
          </h1>
          <p className="text-gray-600 mt-2">Polling Agent Access</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Username
            </label>
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
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

const PollingAgentDashboard = ({ agent, onLogout }) => {
  const [stats, setStats] = useState(null);
  const [results, setResults] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const alertModalRef = useRef(useModal());
  const alertModal = alertModalRef.current;
  const toast = useToast();

  const loadResults = useCallback(async () => {
    try {
      const [statsData, resultsData] = await Promise.all([
        api.getStatistics().catch(() => null),
        api.getResults().catch(() => []),
      ]);
      setStats(statsData);
      setResults(resultsData);
      setLastUpdate(new Date());
    } catch (err) {
      console.error("Failed to load results:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  useEffect(() => {
    if (!autoRefresh) return;

    console.log("Setting up auto-refresh interval (5 seconds)");
    const interval = setInterval(() => {
      console.log("Auto-refreshing results...");
      loadResults();
    }, 5000);

    return () => {
      console.log("Cleaning up auto-refresh interval");
      clearInterval(interval);
    };
  }, [autoRefresh, loadResults]);

  const votingStats = stats?.voting || {};

  return (
    <div className="min-h-screen bg-gray-50">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />
      <AlertModal
        {...alertModal}
        onClose={alertModal.handleClose}
        {...alertModal.modalProps}
      />

      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Kratos(Live Results)
              </h1>
              <p className="text-sm text-gray-600">
                Welcome, {agent?.username}
                <span className="ml-2 text-green-600 font-medium">
                  ({agent?.role === "admin" ? "Admin Access" : "Polling Agent"})
                </span>
              </p>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="h-4 w-4 text-green-600 rounded focus:ring-2 focus:ring-green-500"
                />
                Auto-refresh (5s)
              </label>
              <button
                onClick={loadResults}
                disabled={loading}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50 transition-colors"
                title="Refresh Now"
              >
                <RefreshCw
                  className={`h-5 w-5 ${loading ? "animate-spin" : ""}`}
                />
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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

        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Portfolio Results
          </h2>
          {loading && !results ? (
            <div className="text-center py-12">
              <RefreshCw className="h-12 w-12 text-green-600 animate-spin mx-auto" />
              <p className="mt-4 text-gray-600">Loading live results...</p>
            </div>
          ) : !results || results.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <p className="text-gray-600">No results available yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {results.map((portfolio) => (
                <SimplePortfolioCard key={portfolio.portfolio_id} portfolio={portfolio} />
              ))}
            </div>
          )}
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">
            Last updated: {lastUpdate.toLocaleTimeString()}
            {autoRefresh && " • Auto-refreshing every 5 seconds"}
          </p>
        </div>
      </main>
    </div>
  );
};

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

      console.log("Polling Agent - User data:", data);

      // Allow polling_agent and admin roles only
      if (data.role === "polling_agent" || data.role === "admin") {
        setAgent(data);
      } else {
        // Redirect to appropriate page
        const correctRoute = api.getRoleBasedRoute(data.role);
        localStorage.removeItem("admin_token");
        await alertModal.showAlert({
          title: "Access Denied",
          message: `This page is for Polling Agents only. Redirecting to ${data.role} portal...`,
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
    console.log("Login attempt - User data:", data);

    // Verify role access after login
    if (data.role === "polling_agent" || data.role === "admin") {
      setAgent(data);
    } else {
      // Redirect to correct portal
      const correctRoute = api.getRoleBasedRoute(data.role);
      alertModal.showAlert({
        title: "Wrong Portal",
        message: `You are logged in as ${data.role}. Redirecting to your portal...`,
        type: "info",
      });
      setTimeout(() => navigate(correctRoute), 2000);
      localStorage.removeItem("admin_token");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    setAgent(null);
    navigate('/');
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
        <AlertModal
          {...alertModal}
          onClose={alertModal.handleClose}
          {...alertModal.modalProps}
        />
        <PollingAgentLogin onLogin={handleLogin} alertModal={alertModal} />
      </>
    );
  }

  return <PollingAgentDashboard agent={agent} onLogout={handleLogout} />;
}