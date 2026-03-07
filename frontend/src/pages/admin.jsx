import { useState, useEffect, useCallback } from "react";
import { LogOut, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { AlertModal } from "../components/Modal";
import { ToastContainer } from "../components/Toast";
import { useModal } from "../hooks/useModal";
import { useToast } from "../hooks/useToast";
import { Login } from "../components/Login";
import { Dashboard } from "../components/Dashboard";
import { PortfolioManager } from "../components/PortfolioManager";
import { CandidateManager } from "../components/CandidateManager";
import { ElectorateManager } from "../components/ElectorateManager";
import { ElectionManager } from "../components/ElectionManager";
import { ResultsView } from "../components/ResultsView";

const Admin = () => {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminData, setAdminData] = useState(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data states
  const [stats, setStats] = useState(null);
  const [portfolios, setPortfolios] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [electorates, setElectorates] = useState([]);
  const [results, setResults] = useState([]);
  const [elections, setElections] = useState([]);

  const alertModal = useModal();
  const toast = useToast();

  // Derived: the one active election (for navbar display)
  const activeElection = elections.find(e => e.is_active) || null;

  const loadData = useCallback(async () => {
    try {
      const fetchAllElectorates = async () => {
        const pageSize = 500;
        let skip = 0;
        let allElectorates = [];
        let hasMore = true;
        while (hasMore) {
          const batch = await api.getElectorates(skip, pageSize);
          if (!batch || batch.length === 0) { hasMore = false; }
          else {
            allElectorates = [...allElectorates, ...batch];
            skip += pageSize;
            if (batch.length < pageSize) hasMore = false;
          }
        }
        return allElectorates;
      };

      const [
        statsData,
        portfoliosData,
        candidatesData,
        electoratesData,
        resultsData,
        electionsData,
      ] = await Promise.all([
        api.getStatistics().catch(() => null),
        api.getPortfolios().catch(() => []),
        api.getCandidates().catch(() => []),
        fetchAllElectorates().catch(() => []),
        api.getResults().catch(() => []),
        api.getElections().catch(() => []),
      ]);

      setStats(statsData);
      setPortfolios(portfoliosData || []);
      setCandidates(candidatesData || []);
      setElectorates(electoratesData || []);
      setResults(resultsData || []);
      setElections(electionsData || []);
    } catch (err) {
      console.error("Failed to load data:", err);
      await alertModal.showAlert({
        title: "Error",
        message: "Failed to load some data. Please try refreshing.",
        type: "error",
      });
    }
  }, [alertModal]);

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem("admin_token");
    if (!token) { setLoading(false); return; }
    try {
      const data = await api.verify();
      if (data.role === "admin") {
        setAdminData(data);
        setIsAuthenticated(true);
        await loadData();
      } else {
        const correctRoute = api.getRoleBasedRoute(data.role);
        localStorage.removeItem("admin_token");
        toast.showError(`This page is for admins only. Redirecting to ${data.role} portal...`);
        setTimeout(() => navigate(correctRoute), 2000);
        return;
      }
    } catch (err) {
      console.error("Auth verification failed:", err);
      localStorage.removeItem("admin_token");
      setIsAuthenticated(false);
      await alertModal.showAlert({
        title: "Access Denied",
        message: err.message || "You don't have permission to access the admin panel",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [alertModal, navigate, toast, loadData]);

  useEffect(() => { checkAuth(); }, []);

  const handleLogin = async (data) => {
    if (data.role === "admin") {
      setAdminData(data);
      setIsAuthenticated(true);
      setLoading(true);
      try {
        await loadData();
        toast.showSuccess("Login successful!");
      } catch (err) {
        console.error("Post-login data load failed:", err);
      } finally {
        setLoading(false);
      }
    } else {
      const correctRoute = api.getRoleBasedRoute(data.role);
      toast.showInfo(`You are logged in as ${data.role}. Redirecting to your portal...`);
      setTimeout(() => navigate(correctRoute), 2000);
      localStorage.removeItem("admin_token");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    setIsAuthenticated(false);
    setAdminData(null);
    setActiveTab("dashboard");
    setStats(null);
    setPortfolios([]);
    setCandidates([]);
    setElectorates([]);
    setResults([]);
    setElections([]);
    navigate('/');
  };

  const refreshData = async () => {
    setRefreshing(true);
    try {
      await loadData();
      toast.showSuccess("Data refreshed successfully!");
    } catch (err) {
      toast.showError("Failed to refresh data: " + err.message);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />
        <AlertModal {...alertModal} onClose={alertModal.handleClose} {...alertModal.modalProps} />
        <Login onLogin={handleLogin} />
      </>
    );
  }

  const tabs = ["dashboard", "elections", "portfolios", "candidates", "voters", "results"];

  return (
    <div className="min-h-screen bg-gray-50">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />
      <AlertModal {...alertModal} onClose={alertModal.handleClose} {...alertModal.modalProps} />

      {/* ── Header ── */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex justify-between items-center">

            {/* Left: logo + election name */}
            <div className="flex items-center gap-3">
              {activeElection?.logo_url ? (
                <img
                  src={
                    activeElection.logo_url.startsWith('http')
                      ? activeElection.logo_url
                      : (process.env.REACT_APP_API_URL || '/api').replace(/\/api$/, '') +
                      (activeElection.logo_url.startsWith('/') ? '' : '/') +
                      activeElection.logo_url
                  }
                  alt={activeElection.name}
                  className="h-10 w-10 rounded-xl object-contain border border-slate-200 bg-white shadow-sm"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              ) : (
                /* Fallback monogram when no logo */
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-sm flex-shrink-0">
                  <span className="text-white font-bold text-sm">
                    {activeElection
                      ? activeElection.name.charAt(0).toUpperCase()
                      : 'EC'}
                  </span>
                </div>
              )}
              <div>
                <h1 className="text-lg font-bold text-gray-900 leading-tight">
                  {activeElection ? activeElection.name : 'Electoral Commissioner'}
                </h1>
                <p className="text-xs text-gray-500">
                  Welcome, <span className="font-medium text-gray-700">{adminData?.username}</span>
                  <span className="ml-1 text-blue-600 font-medium">(Admin)</span>
                </p>
              </div>
            </div>

            {/* Right: refresh + logout */}
            <div className="flex items-center gap-3">
              {activeElection && (
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-full">
                  <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-pulse inline-block" />
                  LIVE
                </span>
              )}
              <button
                onClick={refreshData}
                disabled={refreshing}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                title="Refresh Data"
              >
                <RefreshCw className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`} />
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Navigation ── */}
      <nav className="bg-white shadow-sm border-t border-gray-200 sticky top-[65px] z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-6 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-4 px-1 border-b-2 font-medium text-sm capitalize transition-colors whitespace-nowrap ${activeTab === tab
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* ── Main Content ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === "dashboard" && (
          <Dashboard stats={stats} electorates={electorates} onRefresh={refreshData} />
        )}
        {activeTab === "elections" && (
          <ElectionManager elections={elections} onUpdate={refreshData} />
        )}
        {activeTab === "portfolios" && (
          <PortfolioManager portfolios={portfolios} onUpdate={refreshData} />
        )}
        {activeTab === "candidates" && (
          <CandidateManager candidates={candidates} portfolios={portfolios} onUpdate={refreshData} />
        )}
        {activeTab === "voters" && (
          <ElectorateManager electorates={electorates} onUpdate={refreshData} />
        )}
        {activeTab === "results" && <ResultsView results={results} />}
      </main>

      {/* ── Footer ── */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-sm text-gray-500">
            {activeElection ? activeElection.name : 'Election Management System'} © {new Date().getFullYear()}
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Admin;