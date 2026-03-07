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

const API_BASE_URL = process.env.REACT_APP_API_URL || "/api";

// ---------------------------------------------------------------------------
// Shared navbar logo/name block — reused in both header instances
// ---------------------------------------------------------------------------
const ElectionNavBrand = ({ activeElection, apiBase }) => {
  const logoUrl = activeElection?.logo_url
    ? activeElection.logo_url.startsWith("http")
      ? activeElection.logo_url
      : `${apiBase.replace(/\/api$/, "")}${activeElection.logo_url.startsWith("/") ? "" : "/"}${activeElection.logo_url}`
    : null;

  return (
    <div className="flex items-center gap-3">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={activeElection?.name ?? "Election logo"}
          className="h-10 w-10 object-contain rounded-lg border border-gray-100 shadow-sm flex-shrink-0"
          onError={(e) => { e.target.style.display = "none"; }}
        />
      ) : (
        <div className="h-10 w-10 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-lg border border-indigo-200 flex-shrink-0">
          {activeElection?.name?.[0]?.toUpperCase() ?? "E"}
        </div>
      )}
      <div>
        <p className="text-base font-bold text-gray-900 leading-tight">
          {activeElection?.name ?? "Election Portal"}
        </p>
        <p className="text-xs text-indigo-600 font-semibold">EC Official Portal</p>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// ECOfficial page
// ---------------------------------------------------------------------------
const ECOfficial = () => {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [official, setOfficial] = useState(null);
  const [activeElection, setActiveElection] = useState(null);
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

  const loadAndSetActiveElection = useCallback(async () => {
    try {
      const data = await api.getElections().catch(() => []);
      const list = Array.isArray(data) ? data : [];
      if (!list.length) return null;
      // Use is_active flag — consistent with the rest of the system
      const chosen = list.find((e) => e.is_active) ?? list[0];
      api.setActiveElectionId(chosen.id);
      setActiveElection(chosen);
      return chosen;
    } catch {
      return null;
    }
  }, []);

  const loadElectorates = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getAllElectorates();
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
    if (!token) { setLoading(false); return; }
    try {
      const data = await api.verify();
      if (data.role === "ec_official" || data.role === "admin") {
        setOfficial(data);
        setIsAuthenticated(true);
        await loadAndSetActiveElection();
        await loadElectorates();
      } else {
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

  useEffect(() => { checkAuth(); }, []);

  const getTokenStatus = (e) => {
    if (e.has_voted) return "token_used";
    if (e.voting_token) return "has_token";
    return "no_token";
  };

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
      filtered = filtered.filter((e) => getTokenStatus(e) === filterStatus);
    }
    setFilteredElectorates(filtered);
  }, [electorates, searchTerm, filterStatus]);

  const handleLogin = async (data) => {
    if (data.role === "ec_official" || data.role === "admin") {
      setOfficial(data);
      setIsAuthenticated(true);
      await loadAndSetActiveElection();
      await loadElectorates();
    } else {
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
    api.setActiveElectionId(null);
    setIsAuthenticated(false);
    setOfficial(null);
    setActiveElection(null);
    setGeneratedToken(null);
    setSelectedElectorate(null);
    setSearchTerm("");
    setFilterStatus("all");
    navigate("/");
  };

  const handleGenerateToken = async (electorate) => {
    setGeneratingFor(electorate.id);
    setGeneratedToken(null);
    setSelectedElectorate(electorate);
    try {
      const result = await api.regenerateTokenForElectorate(electorate.id);
      if (!result.token) throw new Error(result.message || "Token generation returned no token");
      setGeneratedToken(result.token);
      await loadElectorates();
      toast.showSuccess("Voting token generated successfully!");
    } catch (err) {
      console.error("Token generation failed:", err);
      await alertModal.showAlert({ title: "Generation Failed", message: err.message || "Could not generate token", type: "error" });
      setSelectedElectorate(null);
    } finally {
      setGeneratingFor(null);
    }
  };

  const handleNewGeneration = () => {
    setGeneratedToken(null);
    setSelectedElectorate(null);
  };

  const clearSearch = () => setSearchTerm("");

  const stats = {
    total: electorates.length,
    noToken: electorates.filter((e) => getTokenStatus(e) === "no_token").length,
    hasToken: electorates.filter((e) => getTokenStatus(e) === "has_token").length,
    tokenUsed: electorates.filter((e) => getTokenStatus(e) === "token_used").length,
  };

  // ── Loading / unauth screens ──

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

  if (!isAuthenticated) {
    return (
      <>
        <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />
        <AlertModal {...alertModal} onClose={alertModal.handleClose} {...alertModal.modalProps} />
        <ECOfficialLogin onLogin={handleLogin} alertModal={alertModal} />
      </>
    );
  }

  // ── Token display screen ──

  if (generatedToken && selectedElectorate) {
    return (
      <div className="min-h-screen bg-gray-50">
        <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />
        <AlertModal {...alertModal} onClose={alertModal.handleClose} {...alertModal.modalProps} />

        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex justify-between items-center">
              <ElectionNavBrand activeElection={activeElection} apiBase={API_BASE_URL} />
              <div className="flex flex-col items-end">
                <p className="text-sm font-semibold text-gray-800">Token Generated Successfully</p>
                <p className="text-xs text-gray-500">Give this token to the voter</p>
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
          <TokenDisplay token={generatedToken} electorate={selectedElectorate} onNewGeneration={handleNewGeneration} />
          <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-800">
              <strong>Important:</strong> The voter must keep this token safe. It is required to vote.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // ── Main screen ──

  return (
    <div className="min-h-screen bg-gray-50">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />
      <AlertModal {...alertModal} onClose={alertModal.handleClose} {...alertModal.modalProps} />

      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">

            {/* Left: election branding */}
            <ElectionNavBrand activeElection={activeElection} apiBase={API_BASE_URL} />

            {/* Centre: welcome */}
            <p className="hidden md:block text-sm text-gray-500">
              Welcome,{" "}
              <strong className="text-gray-700">{official?.username}</strong>
              <span className="ml-1 text-indigo-600 font-medium">
                ({official?.role === "admin" ? "Admin Access" : "EC Official"})
              </span>
            </p>

            {/* Right: actions */}
            <div className="flex items-center gap-3">
              {activeElection && (
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-full">
                  <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-pulse inline-block" />
                  LIVE
                </span>
              )}
              <button
                onClick={loadElectorates}
                disabled={loading}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50 transition-colors"
                title="Refresh voter list"
              >
                <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
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
            <p className="text-3xl font-bold text-gray-900">{loading ? "…" : stats.total}</p>
          </div>
          <div className="bg-orange-50 rounded-lg shadow p-6">
            <p className="text-sm text-orange-600 font-medium">No Token</p>
            <p className="text-3xl font-bold text-orange-900">{loading ? "…" : stats.noToken}</p>
          </div>
          <div className="bg-green-50 rounded-lg shadow p-6">
            <p className="text-sm text-green-600 font-medium">Token Issued</p>
            <p className="text-3xl font-bold text-green-900">{loading ? "…" : stats.hasToken}</p>
          </div>
          <div className="bg-blue-50 rounded-lg shadow p-6">
            <p className="text-sm text-blue-600 font-medium">Token Used</p>
            <p className="text-3xl font-bold text-blue-900">{loading ? "…" : stats.tokenUsed}</p>
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
              <option value="has_token">Token Issued</option>
              <option value="token_used">Token Used</option>
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
          getTokenStatus={getTokenStatus}
        />
      </main>
    </div>
  );
};

export default ECOfficial;