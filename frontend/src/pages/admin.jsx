import { useState, useEffect, useCallback } from "react";
import { LogOut, RefreshCw, ChevronDown, AlertTriangle } from "lucide-react";
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
import { ResultsView } from "../components/ResultsView";
import TokenGenerator from '../components/TokenGenerator';
import { ElectionManager } from '../components/ElectionManager';

const STATUS_STYLES = {
  DRAFT: "bg-gray-100 text-gray-700",
  READY: "bg-blue-100 text-blue-700",
  OPEN: "bg-green-100 text-green-700",
  CLOSED: "bg-red-100 text-red-700",
  PUBLISHED: "bg-purple-100 text-purple-700",
};

const ElectionSelector = ({ elections, activeElection, onSelect, onCreateNew }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex items-center gap-2">
      <button
        onClick={onCreateNew}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        title="Create new election"
      >
        <span className="text-lg leading-none">+</span>
        <span className="hidden sm:inline">New</span>
      </button>

      {elections.length > 0 && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
        >
          {activeElection ? (
            <>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_STYLES[activeElection.status] || "bg-gray-100 text-gray-700"}`}>
                {activeElection.status}
              </span>
              <span className="max-w-[160px] truncate">{activeElection.name}</span>
            </>
          ) : (
            <span className="text-amber-600 flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" /> No election
            </span>
          )}
          <ChevronDown className="h-4 w-4 text-gray-500" />
        </button>
      )}

      {!elections.length && (
        <span className="text-amber-600 flex items-center gap-1 text-sm font-medium">
          <AlertTriangle className="h-4 w-4" /> No election
        </span>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-72 bg-white rounded-xl shadow-xl border border-gray-100 z-30 overflow-hidden top-full">
            <p className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 border-b">
              Select Election
            </p>
            {elections.map((election) => (
              <button
                key={election.id}
                onClick={() => { onSelect(election); setOpen(false); }}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-center justify-between gap-3 ${activeElection?.id === election.id ? "bg-blue-50" : ""}`}
              >
                <span className="text-sm font-medium text-gray-900 truncate">{election.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${STATUS_STYLES[election.status] || "bg-gray-100 text-gray-700"}`}>
                  {election.status}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const Admin = () => {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminData, setAdminData] = useState(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [elections, setElections] = useState([]);
  const [activeElection, setActiveElection] = useState(null);

  const [stats, setStats] = useState(null);
  const [portfolios, setPortfolios] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [electorates, setElectorates] = useState([]);
  const [results, setResults] = useState([]);

  const alertModal = useModal();
  const toast = useToast();

  const loadAndSetActiveElection = useCallback(async () => {
    const data = await api.getElections().catch(() => []);
    const list = Array.isArray(data) ? data : [];
    setElections(list);
    if (!list.length) return null;

    const priority = ["OPEN", "READY", "DRAFT", "CLOSED", "PUBLISHED"];
    let chosen = null;
    for (const status of priority) {
      chosen = list.find((e) => e.status === status);
      if (chosen) break;
    }
    if (!chosen) chosen = list[0];

    setActiveElection(chosen);
    api.setActiveElectionId(chosen.id);
    return chosen;
  }, []);

  const handleSelectElection = useCallback((election) => {
    setActiveElection(election);
    api.setActiveElectionId(election.id);
    api.clearCache();
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ELEC_PAGE = 500;
  const loadAllElectorates = useCallback(async () => {
    const all = [];
    let skip = 0;
    while (true) {
      const page = await api.getElectorates(skip, ELEC_PAGE);
      const rows = Array.isArray(page) ? page : (page?.items ?? []);
      all.push(...rows);
      if (rows.length < ELEC_PAGE) break;
      skip += ELEC_PAGE;
    }
    return all;
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [
        statsData,
        portfoliosData,
        candidatesData,
        electoratesData,
        resultsData,
      ] = await Promise.all([
        api.getStatistics().catch(() => null),
        api.getPortfolios().catch(() => []),
        api.getCandidates().catch(() => []),
        loadAllElectorates().catch(() => []),
        api.getResults().catch(() => []),
      ]);

      setStats(statsData);
      setPortfolios(portfoliosData || []);
      setCandidates(candidatesData || []);
      setElectorates(electoratesData || []);
      setResults(resultsData || []);
    } catch (err) {
      console.error("Failed to load data:", err);
      await alertModal.showAlert({
        title: "Error",
        message: "Failed to load some data. Please try refreshing.",
        type: "error",
      });
    }
  }, [alertModal, loadAllElectorates]);

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem("admin_token");
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const data = await api.verify();

      console.log("Admin page - User data:", data);

      if (data.role === "admin") {
        setAdminData(data);
        setIsAuthenticated(true);
        const chosen = await loadAndSetActiveElection();
        if (chosen) {
          await loadData();
        } else {
          toast.showInfo("No elections found. Create one to get started.");
          setActiveTab("elections");
        }
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
  }, [alertModal, navigate, toast, loadData, loadAndSetActiveElection]);

  useEffect(() => {
    checkAuth();
  }, []);

  const handleLogin = async (data) => {
    console.log("Login response:", data);

    if (data.role === "admin") {
      setAdminData(data);
      setIsAuthenticated(true);
      setLoading(true);
      try {
        const chosen = await loadAndSetActiveElection();
        if (chosen) {
          await loadData();
        } else {
          toast.showInfo("No elections found. Create one to get started.");
          setActiveTab("elections");
        }
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
    api.setActiveElectionId(null);
    setIsAuthenticated(false);
    setAdminData(null);
    setActiveTab("dashboard");
    setElections([]);
    setActiveElection(null);
    setStats(null);
    setPortfolios([]);
    setCandidates([]);
    setElectorates([]);
    setResults([]);
    navigate('/');
  };

  const refreshData = async () => {
    setRefreshing(true);
    try {
      await loadAndSetActiveElection();
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
        <AlertModal
          {...alertModal}
          onClose={alertModal.handleClose}
          {...alertModal.modalProps}
        />
        <Login onLogin={handleLogin} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />
      <AlertModal
        {...alertModal}
        onClose={alertModal.handleClose}
        {...alertModal.modalProps}
      />

      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              {activeElection?.logo_url ? (
                <div className="flex-shrink-0 w-10 h-10 rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                  <img
                    src={activeElection.logo_url}
                    alt={`${activeElection.name} logo`}
                    className="w-full h-full object-contain p-0.5"
                  />
                </div>
              ) : (
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-bold text-lg select-none">
                  {activeElection ? activeElection.name.charAt(0).toUpperCase() : 'E'}
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold text-gray-900 leading-tight">
                  {activeElection ? activeElection.name : 'Election Admin'}
                </h1>
                <p className="text-sm text-gray-600">
                  Welcome, {adminData?.username} <span className="text-blue-600 font-medium">(Admin)</span>
                </p>
              </div>
            </div>
            <div className="flex-1 flex justify-center">
              <ElectionSelector
                elections={elections}
                activeElection={activeElection}
                onSelect={handleSelectElection}
                onCreateNew={() => setActiveTab("elections")}
              />
            </div>
            <div className="flex items-center gap-4">
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
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <LogOut className="h-5 w-5" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* No-election warning */}
      {!activeElection && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 text-center">
          <p className="text-sm text-amber-800 flex items-center justify-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            No election selected. Portfolio, candidate, and results data require an active election.{" "}
            <button
              onClick={() => setActiveTab("elections")}
              className="underline font-semibold hover:text-amber-900 transition-colors"
            >
              Create or select one →
            </button>
          </p>
        </div>
      )}

      {/* Navigation */}
      <nav className="bg-white shadow-sm border-t border-gray-200 sticky top-[73px] z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8 overflow-x-auto">
            {[
              "dashboard",
              "elections",
              "portfolios",
              "candidates",
              "voters",
              "tokens",
              "results",
            ].map((tab) => (
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

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === "dashboard" && (
          <Dashboard
            stats={stats}
            electorates={electorates}
            onRefresh={refreshData}
          />
        )}
        {activeTab === "elections" && (
          <ElectionManager
            elections={elections}
            activeElection={activeElection}
            electorates={electorates}
            onSelect={(election) => {
              handleSelectElection(election);
              setActiveTab("dashboard");
            }}
            onUpdate={async () => {
              await loadAndSetActiveElection();
              await loadData();
            }}
          />
        )}
        {activeTab === "portfolios" && (
          <PortfolioManager portfolios={portfolios} onUpdate={refreshData} />
        )}
        {activeTab === "candidates" && (
          <CandidateManager
            candidates={candidates}
            portfolios={portfolios}
            onUpdate={refreshData}
          />
        )}
        {activeTab === "voters" && (
          <ElectorateManager electorates={electorates} onUpdate={refreshData} activeElection={activeElection} />
        )}
        {activeTab === "tokens" && (
          <TokenGenerator electorates={electorates} onUpdate={refreshData} />
        )}
        {activeTab === "results" && <ResultsView results={results} />}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-sm text-gray-500">
            Election Management System © 2025
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Admin;