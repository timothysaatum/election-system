import { useState } from "react";
import { Eye, EyeOff, Copy, CheckCircle, X, Search } from "lucide-react";

export const TokensModal = ({ electorates, onClose }) => {
  const [visibleTokens, setVisibleTokens] = useState({});
  const [copiedToken, setCopiedToken] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

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

  const filteredElectorates = electorates.filter((e) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      e.student_id?.toLowerCase().includes(search) ||
      e.name?.toLowerCase().includes(search) ||
      e.full_name?.toLowerCase().includes(search) ||
      e.program?.toLowerCase().includes(search)
    );
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-900">
              Generated Tokens
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by Student ID, Name, or Program..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {filteredElectorates.length === 0 ? (
            <div className="text-center py-12">
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
                  className="bg-gray-50 rounded-lg p-4 border border-gray-200 hover:border-indigo-300 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-gray-500">Student ID</p>
                        <p className="font-medium text-gray-900">
                          {electorate.student_id}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Name</p>
                        <p className="font-medium text-gray-900">
                          {electorate.name || electorate.full_name || "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Program</p>
                        <p className="font-medium text-gray-900">
                          {electorate.program || "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Token</p>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-gray-900">
                            {visibleTokens[electorate.id]
                              ? electorate.voting_token
                              : "••••••••"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => toggleTokenVisibility(electorate.id)}
                        className="p-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
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
                            copyToken(electorate.voting_token, electorate.id)
                          }
                          className="p-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors relative"
                          title="Copy Token"
                        >
                          {copiedToken === electorate.id ? (
                            <CheckCircle className="h-5 w-5 text-green-600" />
                          ) : (
                            <Copy className="h-5 w-5" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-gray-500">
                    <span>Phone: {electorate.phone_number || "N/A"}</span>
                    <span>Email: {electorate.email || "N/A"}</span>
                    {electorate.has_voted && (
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded font-medium">
                        ✓ Voted
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
              Showing {filteredElectorates.length} of {electorates.length}{" "}
              tokens
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
