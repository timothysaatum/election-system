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
import { ResultsView } from "../components/ResultsView";
import TokenGenerator from '../components/TokenGenerator';

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

  const alertModal = useModal();
  const toast = useToast();

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
        api.getElectorates(0, 1000).catch(() => []),
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
  }, [alertModal]);

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem("admin_token");
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const data = await api.verify();

      console.log("Admin page - User data:", data);

      // Only allow admin role - redirect others
      if (data.role === "admin") {
        setAdminData(data);
        setIsAuthenticated(true);
        await loadData();
      } else {
        // Redirect to appropriate page based on role
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

  useEffect(() => {
    checkAuth();
  }, []);

  const handleLogin = async (data) => {
    console.log("Login response:", data);

    // Verify role access after login
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
      // Redirect to correct portal
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
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Kratos Admin</h1>
              <p className="text-sm text-gray-600">
                Welcome, {adminData?.username} <span className="text-blue-600 font-medium">(Admin)</span>
              </p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={refreshData}
                disabled={refreshing}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                title="Refresh Data"
              >
                <RefreshCw
                  className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`}
                />
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

      {/* Navigation */}
      <nav className="bg-white shadow-sm border-t border-gray-200 sticky top-[73px] z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8 overflow-x-auto">
            {[
              "dashboard",
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
          <ElectorateManager electorates={electorates} onUpdate={refreshData} />
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