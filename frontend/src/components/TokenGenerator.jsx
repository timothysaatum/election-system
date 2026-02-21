import { useState, useEffect } from "react";
import {
  Key,
  Copy,
  Check,
  RefreshCw,
  User,
  Phone,
  Mail,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";

const TokenGeneratorPage = () => {
  const navigate = useNavigate();
  const [electorates, setElectorates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generatedTokens, setGeneratedTokens] = useState([]);
  const [generatingFor, setGeneratingFor] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [copiedToken, setCopiedToken] = useState(null);

  useEffect(() => {
    loadElectorates();
  }, []);

  const loadElectorates = async () => {
    setLoading(true);
    try {
      const data = await api.getElectorates(0, 1000);
      setElectorates(data);
    } catch (error) {
      console.error("Failed to load electorates:", error);
      alert("Failed to load voters. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateToken = async (electorate) => {
    setGeneratingFor(electorate.id);
    try {
      const result = await api.regenerateTokenForElectorate(electorate.id, {
        election_name: "SRC Election 2024",
        send_notification: false,
      });

      setGeneratedTokens((prev) => [
        {
          token: result.token || result.voting_token || "TOKEN_GEN",
          electorate_id: electorate.id,
          electorate,
          timestamp: new Date().toISOString(),
        },
        ...prev,
      ]);

      await loadElectorates();
    } catch (error) {
      console.error("Token generation failed:", error);
      alert(error.message || "Failed to generate token. Please try again.");
    } finally {
      setGeneratingFor(null);
    }
  };

  const handleCopyToken = (token) => {
    navigator.clipboard.writeText(token);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const filteredElectorates = electorates.filter((e) => {
    const matchesSearch =
      e.student_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.name &&
        e.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (e.full_name &&
        e.full_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (e.program && e.program.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesFilter =
      filterStatus === "all" ||
      (filterStatus === "no_token" && !e.voting_token) ||
      (filterStatus === "has_token" && e.voting_token) ||
      (filterStatus === "voted" && e.has_voted);

    return matchesSearch && matchesFilter;
  });

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate("/admin")}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="h-5 w-5" />
                Back
              </button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  Token Generation
                </h1>
                <p className="text-gray-600 mt-1">
                  Generate voting tokens for electorates
                </p>
              </div>
            </div>
            <button
              onClick={loadElectorates}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-sm text-blue-600 font-medium">Total Voters</p>
              <p className="text-2xl font-bold text-blue-900">
                {electorates.length}
              </p>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <p className="text-sm text-green-600 font-medium">
                Tokens Generated
              </p>
              <p className="text-2xl font-bold text-green-900">
                {electorates.filter((e) => e.voting_token).length}
              </p>
            </div>
            <div className="bg-orange-50 rounded-lg p-4">
              <p className="text-sm text-orange-600 font-medium">Pending</p>
              <p className="text-2xl font-bold text-orange-900">
                {electorates.filter((e) => !e.voting_token).length}
              </p>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <p className="text-sm text-purple-600 font-medium">
                Already Voted
              </p>
              <p className="text-2xl font-bold text-purple-900">
                {electorates.filter((e) => e.has_voted).length}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Voter List */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Voters</h2>

                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-4">
                  <input
                    type="text"
                    placeholder="Search by ID, name, or program..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
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
              </div>

              {/* Voter List */}
              <div className="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">
                {loading ? (
                  <div className="p-8 text-center text-gray-500">
                    Loading...
                  </div>
                ) : filteredElectorates.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    No voters found
                  </div>
                ) : (
                  filteredElectorates.map((electorate) => (
                    <div
                      key={electorate.id}
                      className="p-4 hover:bg-gray-50 transition"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold text-gray-900">
                              {electorate.name || electorate.full_name || electorate.student_id}
                            </h3>
                            {electorate.has_voted && (
                              <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full">
                                Voted
                              </span>
                            )}
                            {electorate.voting_token &&
                              !electorate.has_voted && (
                                <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                                  Has Token
                                </span>
                              )}
                          </div>
                          <div className="space-y-1 text-sm text-gray-600">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              <span>{electorate.student_id}</span>
                              <span className="text-gray-400">•</span>
                              <span>{electorate.program || "N/A"}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Phone className="h-4 w-4" />
                              <span>{electorate.phone_number || "N/A"}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Mail className="h-4 w-4" />
                              <span>{electorate.email || "N/A"}</span>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => handleGenerateToken(electorate)}
                          disabled={
                            generatingFor === electorate.id ||
                            electorate.has_voted
                          }
                          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
                        >
                          {generatingFor === electorate.id ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                              Generating...
                            </>
                          ) : (
                            <>
                              <Key className="h-4 w-4" />
                              {electorate.voting_token
                                ? "Regenerate"
                                : "Generate"}
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Generated Tokens Panel */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm sticky top-6">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-900">
                  Recently Generated
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  Write these tokens for voters
                </p>
              </div>

              <div className="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">
                {generatedTokens.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <Key className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                    <p>No tokens generated yet</p>
                  </div>
                ) : (
                  generatedTokens.map((item, index) => (
                    <div
                      key={index}
                      className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50"
                    >
                      <div className="mb-3">
                        <p className="font-semibold text-gray-900">
                          {item.electorate.name || item.electorate.full_name ||
                            item.electorate.student_id}
                        </p>
                        <p className="text-sm text-gray-600">
                          {item.electorate.student_id}
                        </p>
                      </div>

                      <div className="bg-white rounded-lg p-4 border-2 border-blue-300">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-medium text-gray-600">
                            VOTING TOKEN
                          </p>
                          <button
                            onClick={() => handleCopyToken(item.token)}
                            className="text-blue-600 hover:text-blue-700"
                            title="Copy token"
                          >
                            {copiedToken === item.token ? (
                              <Check className="h-4 w-4" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                        <p className="text-2xl font-bold text-gray-900 tracking-wider font-mono">
                          {item.token}
                        </p>
                      </div>

                      <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
                        <AlertCircle className="h-3 w-3" />
                        <span>
                          Generated{" "}
                          {new Date(item.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TokenGeneratorPage;