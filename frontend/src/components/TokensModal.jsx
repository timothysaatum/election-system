import { useState, useEffect } from "react";
import { Eye, EyeOff, Copy, CheckCircle, X, Search, Key, Loader } from "lucide-react";
import { api } from "../services/api";

export const TokensModal = ({ electorates, onClose }) => {
  const [visibleTokens, setVisibleTokens] = useState({});
  const [copiedToken, setCopiedToken] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [electoratesWithTokens, setElectoratesWithTokens] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadTokens();
  }, []);

  const loadTokens = async () => {
    try {
      setLoading(true);
      const data = await api.getElectorateTokens();
      setElectoratesWithTokens(data);
    } catch (err) {
      setError(err.message || "Failed to load tokens");
      console.error("Error loading tokens:", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleTokenVisibility = (id) => {
    setVisibleTokens((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const copyToken = (token, id) => {
    navigator.clipboard.writeText(token);
    setCopiedToken(id);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const filteredElectorates = electoratesWithTokens.filter((e) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      e.student_id?.toLowerCase().includes(search) ||
      e.name?.toLowerCase().includes(search) ||
      e.program?.toLowerCase().includes(search) ||
      e.token?.toLowerCase().includes(search)
    );
  });

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');
        
        * {
          font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        
        .token-text {
          font-family: 'JetBrains Mono', monospace;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        .modal-backdrop {
          animation: fadeIn 0.2s ease-out;
        }
      `}</style>

      <div className="modal-backdrop fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
          {/* Header */}
          <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-purple-50">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-600 rounded-lg">
                  <Key className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">
                    Generated Voting Tokens
                  </h2>
                  <p className="text-sm text-gray-600">View and manage voter tokens</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-gray-700 p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Close modal"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by Student ID, Program, or Token..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
              />
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader className="h-12 w-12 text-indigo-600 animate-spin mb-4" />
                <p className="text-gray-600">Loading tokens...</p>
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <X className="h-8 w-8 text-red-600" />
                </div>
                <p className="text-red-600 font-semibold mb-2">Failed to load tokens</p>
                <p className="text-gray-600 text-sm">{error}</p>
              </div>
            ) : filteredElectorates.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Key className="h-8 w-8 text-gray-400" />
                </div>
                <p className="text-gray-600">
                  {searchTerm
                    ? "No matching tokens found"
                    : "No tokens generated yet"}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredElectorates.map((electorate) => (
                  <div
                    key={electorate.id}
                    className="bg-gradient-to-r from-gray-50 to-indigo-50/30 rounded-xl p-5 border-2 border-gray-200 hover:border-indigo-300 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-4">
                        <div>
                          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1">Student ID</p>
                          <p className="font-bold text-gray-900">
                            {electorate.student_id}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1">Name</p>
                          <p className="font-medium text-gray-900">
                            {electorate.name || "N/A"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1">Program</p>
                          <p className="font-medium text-gray-900">
                            {electorate.program || "N/A"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1">Phone</p>
                          <p className="font-medium text-gray-900">
                            {electorate.phone_number || "N/A"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1">Token</p>
                          <div className="flex items-center gap-2">
                            {electorate.has_voted ? (
                              <span className="token-text font-bold text-gray-400 line-through">
                                {electorate.token || "••••"}
                              </span>
                            ) : (
                              <span className="token-text font-bold text-indigo-600 text-lg tracking-wider">
                                {visibleTokens[electorate.id]
                                  ? electorate.token
                                  : "••••"}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 ml-4">
                        {!electorate.has_voted && (
                          <>
                            <button
                              onClick={() => toggleTokenVisibility(electorate.id)}
                              className="p-2 text-gray-600 hover:bg-indigo-100 hover:text-indigo-700 rounded-lg transition-all"
                              title={
                                visibleTokens[electorate.id]
                                  ? "Hide Token"
                                  : "Show Token"
                              }
                            >
                              {visibleTokens[electorate.id] ? (
                                <EyeOff className="h-5 w-5" />
                              ) : (
                                <Eye className="h-5 w-5" />
                              )}
                            </button>

                            {visibleTokens[electorate.id] && (
                              <button
                                onClick={() =>
                                  copyToken(electorate.token, electorate.id)
                                }
                                className="p-2 text-gray-600 hover:bg-green-100 hover:text-green-700 rounded-lg transition-all relative"
                                title="Copy Token"
                              >
                                {copiedToken === electorate.id ? (
                                  <CheckCircle className="h-5 w-5 text-green-600" />
                                ) : (
                                  <Copy className="h-5 w-5" />
                                )}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
                      <span className="text-gray-600">
                        Email: <span className="font-medium">{electorate.email || "N/A"}</span>
                      </span>
                      {electorate.has_voted && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-lg font-semibold">
                          <CheckCircle className="h-3 w-3" />
                          Voted
                        </span>
                      )}
                      {!electorate.has_voted && electorate.token && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-lg font-semibold">
                          <Key className="h-3 w-3" />
                          Token Active
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-200 bg-gray-50">
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-600">
                Showing {filteredElectorates.length} of {electoratesWithTokens.length} tokens
                {electoratesWithTokens.filter(e => e.has_voted).length > 0 && (
                  <span className="ml-2 text-green-600 font-semibold">
                    • {electoratesWithTokens.filter(e => e.has_voted).length} voted
                  </span>
                )}
              </p>
              <button
                onClick={onClose}
                className="px-6 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-semibold transition-all shadow-lg hover:shadow-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};