import { useState, useEffect, useCallback } from "react";
import { RefreshCw, LogOut, Search, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { AlertModal } from "../components/Modal";
import { ToastContainer } from "../components/Toast";
import { useModal } from "../hooks/useModal";
import { useToast } from "../hooks/useToast";
import { ECOfficialLogin } from "../components/ECOfficialLogin";
import { TokenDisplay } from "../components/TokenDisplay";
import { VoterList } from "../components/VoterList";

const ECOfficial = () => {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [official, setOfficial] = useState(null);
  const [electorates, setElectorates] = useState([]);
  const [filteredElectorates, setFilteredElectorates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generatingFor, setGeneratingFor] = useState(null);
  const [generatedToken, setGeneratedToken] = useState(null);
  const [selectedElectorate, setSelectedElectorate] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const alertModal = useModal();
  const toast = useToast();

  const loadElectorates = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getElectorates(0, 1000);
      setElectorates(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load electorates:", err);
      toast.showError("Failed to load voters: " + err.message);
      setElectorates([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem("admin_token");
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const data = await api.verify();

      console.log("EC Official - User data:", data);

      // Allow ec_official and admin roles only
      if (data.role === "ec_official" || data.role === "admin") {
        setOfficial(data);
        setIsAuthenticated(true);
        await loadElectorates();
      } else {
        // Redirect to appropriate page
        const correctRoute = api.getRoleBasedRoute(data.role);
        localStorage.removeItem("admin_token");
        await alertModal.showAlert({
          title: "Access Denied",
          message: `This page is for EC Officials only. Redirecting to ${data.role} portal...`,
          type: "error",
        });
        setTimeout(() => navigate(correctRoute), 2000);
        return;
      }
    } catch (err) {
      console.error("Auth failed:", err);
      localStorage.removeItem("admin_token");
      setIsAuthenticated(false);
      await alertModal.showAlert({
        title: "Access Denied",
        message: err.message || "You don't have permission to access this portal",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [alertModal, navigate, loadElectorates]);

  useEffect(() => {
    checkAuth();
  }, []);

  // Filter electorates based on search and status
  useEffect(() => {
    let filtered = electorates;

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.student_id?.toLowerCase().includes(search) ||
          e.name?.toLowerCase().includes(search) ||
          e.full_name?.toLowerCase().includes(search) ||
          e.program?.toLowerCase().includes(search) ||
          e.phone_number?.includes(search)
      );
    }

    if (filterStatus !== "all") {
      filtered = filtered.filter((e) => {
        if (filterStatus === "no_token") return !e.voting_token;
        if (filterStatus === "has_token") return e.voting_token && !e.has_voted;
        if (filterStatus === "voted") return e.has_voted;
        return true;
      });
    }

    setFilteredElectorates(filtered);
  }, [electorates, searchTerm, filterStatus]);

  const handleLogin = async (data) => {
    console.log("Login attempt - User data:", data);

    // Verify role access after login
    if (data.role === "ec_official" || data.role === "admin") {
      setOfficial(data);
      setIsAuthenticated(true);
      await loadElectorates();
    } else {
      // Redirect to correct portal
      const correctRoute = api.getRoleBasedRoute(data.role);
      await alertModal.showAlert({
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
    setIsAuthenticated(false);
    setOfficial(null);
    setGeneratedToken(null);
    setSelectedElectorate(null);
    setSearchTerm("");
    setFilterStatus("all");
    navigate('/');
  };

  const handleGenerateToken = async (electorate) => {
    setGeneratingFor(electorate.id);
    setGeneratedToken(null);
    setSelectedElectorate(electorate);

    try {
      const result = await api.regenerateTokenForElectorate(electorate.id, {
        election_name: "SRC Election 2025",
        voting_url: window.location.origin,
        send_notification: false,
      });

      setGeneratedToken(result.token || result.voting_token);
      await loadElectorates();

      toast.showSuccess("Voting token generated successfully!");
    } catch (err) {
      console.error("Token generation failed:", err);
      await alertModal.showAlert({
        title: "Generation Failed",
        message: err.message || "Could not generate token",
        type: "error",
      });
      setSelectedElectorate(null);
    } finally {
      setGeneratingFor(null);
    }
  };

  const handleNewGeneration = () => {
    setGeneratedToken(null);
    setSelectedElectorate(null);
  };

  const clearSearch = () => {
    setSearchTerm("");
  };

  // Stats calculations
  const stats = {
    total: electorates.length,
    withToken: electorates.filter((e) => e.voting_token).length,
    noToken: electorates.filter((e) => !e.voting_token).length,
    voted: electorates.filter((e) => e.has_voted).length,
  };

  // Loading Screen
  if (loading && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading EC Portal...</p>
        </div>
      </div>
    );
  }

  // Login Screen
  if (!isAuthenticated) {
    return (
      <>
        <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />
        <AlertModal
          {...alertModal}
          onClose={alertModal.handleClose}
          {...alertModal.modalProps}
        />
        <ECOfficialLogin onLogin={handleLogin} alertModal={alertModal} />
      </>
    );
  }

  // Token Display Screen
  if (generatedToken && selectedElectorate) {
    return (
      <div className="min-h-screen bg-gray-50">
        <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />
        <AlertModal
          {...alertModal}
          onClose={alertModal.handleClose}
          {...alertModal.modalProps}
        />

        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Token Generated Successfully
                </h1>
                <p className="text-sm text-gray-600">
                  Give this token to the voter
                </p>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <LogOut className="h-5 w-5" />
                Logout
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <TokenDisplay
            token={generatedToken}
            electorate={selectedElectorate}
            onNewGeneration={handleNewGeneration}
          />

          <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-800">
              <strong>Important:</strong> The voter must keep this token safe.
              It is required to vote.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // Main Dashboard
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
                Kratos(EC Offical)
              </h1>
              <p className="text-sm text-gray-600">
                Welcome, <strong>{official?.username}</strong>
                <span className="ml-2 text-blue-600 font-medium">
                  ({official?.role === "admin" ? "Admin Access" : "EC Official"})
                </span>
              </p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={loadElectorates}
                disabled={loading}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50 transition-colors"
                title="Refresh voter list"
              >
                <RefreshCw
                  className={`h-5 w-5 ${loading ? "animate-spin" : ""}`}
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-600 font-medium">Total Voters</p>
            <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div className="bg-green-50 rounded-lg shadow p-6">
            <p className="text-sm text-green-600 font-medium">With Token</p>
            <p className="text-3xl font-bold text-green-900">
              {stats.withToken}
            </p>
          </div>
          <div className="bg-orange-50 rounded-lg shadow p-6">
            <p className="text-sm text-orange-600 font-medium">No Token</p>
            <p className="text-3xl font-bold text-orange-900">
              {stats.noToken}
            </p>
          </div>
          <div className="bg-blue-50 rounded-lg shadow p-6">
            <p className="text-sm text-blue-600 font-medium">Already Voted</p>
            <p className="text-3xl font-bold text-blue-900">{stats.voted}</p>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by ID, name, program, or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {searchTerm && (
                <button
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Voters</option>
              <option value="no_token">No Token</option>
              <option value="has_token">Has Token</option>
              <option value="voted">Already Voted</option>
            </select>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            Showing {filteredElectorates.length} of {stats.total} voters
          </p>
        </div>

        <VoterList
          electorates={filteredElectorates}
          loading={loading}
          generatingFor={generatingFor}
          onGenerateToken={handleGenerateToken}
        />
      </main>
    </div>
  );
};

export default ECOfficial;