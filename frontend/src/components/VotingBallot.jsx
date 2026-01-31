import { useState, useEffect, useMemo, memo, useCallback } from "react";
import { votingApi } from "../services/votingApi";
import LoadingSpinner from "./shared/LoadingSpinner";

const API_BASE_URL = process.env.REACT_APP_API_URL || "/api";

// Memoized candidate card component for performance
const CandidateCard = memo(({ candidate, isSelected, portfolio, onSelect, index }) => {
  return (
    <button
      onClick={() => onSelect(portfolio.id, candidate.id)}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative group flex flex-col items-center p-6 rounded-3xl border-2 transition-all duration-300 hover:scale-105 ${isSelected
        ? "border-blue-500 bg-gradient-to-br from-blue-50 to-blue-100 shadow-2xl ring-4 ring-blue-200"
        : "border-gray-300 hover:border-blue-400 hover:bg-gray-50 hover:shadow-xl"
        }`}
      title="Select candidate"
    >
      {/* Selection Badge */}
      {isSelected && (
        <div className="absolute -top-3 -right-3 w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center shadow-lg">
          <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </div>
      )}

      {/* Candidate Photo */}
      <div className="relative mb-4">
        {candidate.picture_url ? (
          <div className={`relative rounded-2xl overflow-hidden shadow-xl bg-gray-100 ${isSelected ? 'ring-4 ring-blue-400' : ''}`}>
            <img
              src={`${API_BASE_URL.replace("/api", "")}${candidate.picture_url}`}
              alt={candidate.name}
              className="w-48 h-48 object-cover lazy-load"
              loading="lazy"
              onError={(e) => {
                e.target.src = "https://via.placeholder.com/192x192?text=No+Photo";
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none"></div>
          </div>
        ) : (
          <div className="w-48 h-48 bg-gradient-to-br from-gray-200 to-gray-300 rounded-2xl flex items-center justify-center text-gray-400 text-lg font-semibold shadow-lg">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto mb-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
              </svg>
              No Photo
            </div>
          </div>
        )}
      </div>

      {/* Candidate Info */}
      <div className="w-full text-center">
        <h3 className="text-xl font-bold text-gray-900 mb-2 line-clamp-2">{candidate.name}</h3>

        {candidate.party && (
          <span className="inline-block mb-3 px-4 py-1.5 bg-gradient-to-r from-indigo-100 to-purple-100 text-indigo-800 text-sm font-semibold rounded-full shadow-sm">
            {candidate.party}
          </span>
        )}

        {candidate.bio && (
          <p className="text-gray-600 text-sm mb-3 line-clamp-2 px-2 h-10">
            {candidate.bio}
          </p>
        )}

        {candidate.manifesto && (
          <div className="bg-blue-50 rounded-lg p-3 mt-3 border border-blue-100">
            <p className="text-blue-900 text-xs font-medium italic line-clamp-2 h-8">
              "{candidate.manifesto}"
            </p>
          </div>
        )}
      </div>

      {/* Click indicator */}
      <div className="mt-4 text-xs font-medium text-gray-500 group-hover:text-blue-600 transition-colors">
        {isSelected ? "Click to deselect" : "Click to select"}
      </div>
    </button>
  );
});

CandidateCard.displayName = "CandidateCard";

// Memoized portfolio component
const PortfolioSection = memo(({ portfolio, index, selectedVotes, onCandidateSelect, portfolioCount }) => {
  const selectedVote = selectedVotes[portfolio.id];

  return (
    <div className="bg-white rounded-3xl shadow-lg border border-gray-200 p-8 hover:shadow-xl transition-shadow">
      {/* Portfolio Header */}
      <div className="text-center mb-8 pb-6 border-b-2 border-gray-200">
        <div className="flex items-center justify-center gap-4 mb-3 flex-wrap">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-700 rounded-full flex items-center justify-center shadow-lg">
            <span className="text-xl font-bold text-white">{index + 1}</span>
          </div>
          <h2 className="text-3xl font-bold text-gray-900">{portfolio.name}</h2>
          {selectedVote && (
            <span className="bg-green-500 text-white text-xs font-bold px-4 py-1.5 rounded-full flex items-center gap-2 ml-auto">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Selected
            </span>
          )}
        </div>
        {portfolio.description && (
          <p className="text-gray-600 text-base font-medium">{portfolio.description}</p>
        )}
      </div>

      {/* Candidates Grid */}
      <div className="flex justify-center">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl w-full">
          {portfolio.candidates.map((candidate) => (
            <CandidateCard
              key={candidate.id}
              candidate={candidate}
              portfolio={portfolio}
              isSelected={selectedVotes[portfolio.id] === candidate.id}
              onSelect={onCandidateSelect}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

PortfolioSection.displayName = "PortfolioSection";

const VotingBallot = ({ voterData, onVoteComplete, sessionTime }) => {
  const [candidates, setCandidates] = useState([]);
  const [selectedVotes, setSelectedVotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSecurityPin, setShowSecurityPin] = useState(false);
  const [securityPin, setSecurityPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [hasInteracted, setHasInteracted] = useState(false);

  useEffect(() => {
    const loadBallot = async () => {
      try {
        setLoading(true);
        setError(""); // Clear any previous errors
        console.log("[VotingBallot] Loading ballot for voter:", voterData?.id);
        const data = await votingApi.getBallot();
        console.log("[VotingBallot] Ballot loaded successfully:", data.length, "candidates");
        setCandidates(data);
      } catch (err) {
        const errorMsg = err.message || "Failed to load ballot";
        console.error("[VotingBallot] Ballot load error:", errorMsg, err);

        // More detailed error messages
        if (errorMsg.includes("Session expired") || errorMsg.includes("session") || errorMsg.includes("401")) {
          setError("Your voting session has expired. Please verify your token again.");
        } else if (errorMsg.includes("Not authenticated") || errorMsg.includes("Invalid")) {
          setError("Authentication failed. Please verify your token and try again.");
        } else {
          setError(errorMsg);
        }
      } finally {
        setLoading(false);
      }
    };
    loadBallot();
  }, []);

  const portfolios = useMemo(() => {
    const map = new Map();
    candidates.forEach((cand) => {
      const port = cand.portfolio;
      if (!port) return;
      const key = port.id;
      if (!map.has(key)) {
        map.set(key, { ...port, candidates: [] });
      }
      map.get(key).candidates.push(cand);
    });

    return Array.from(map.values())
      .sort((a, b) => a.voting_order - b.voting_order)
      .map((port) => ({
        ...port,
        candidates: port.candidates.sort(
          (a, b) => a.display_order - b.display_order
        ),
      }));
  }, [candidates]);

  const handleCandidateSelect = useCallback((portfolioId, candidateId) => {
    setHasInteracted(true);
    setSelectedVotes((prev) => {
      const current = prev[portfolioId];
      if (current === candidateId) {
        const newVotes = { ...prev };
        delete newVotes[portfolioId];
        return newVotes;
      }
      return {
        ...prev,
        [portfolioId]: candidateId,
      };
    });
  }, []);

  const handleSubmitVotes = useCallback(() => {
    setError("");
    if (Object.keys(selectedVotes).length === 0) {
      setError("Please make at least one selection");
      return;
    }
    setShowConfirmModal(true);
  }, [selectedVotes]);

  const confirmSubmit = async () => {
    // Require PIN verification before submission
    if (!securityPin || securityPin.length === 0) {
      // setShowSecurityPin(true);
      setShowConfirmModal(false);
      return;
    }

    const votes = Object.entries(selectedVotes)
      .filter(([_, value]) => value !== "refuse")
      .map(([portfolio_id, candidate_id]) => ({
        portfolio_id,
        candidate_id,
      }));

    setSubmitting(true);
    setError("");
    setShowConfirmModal(false);

    try {
      const result = await votingApi.castVote(votes);
      onVoteComplete(result);
    } catch (err) {
      setError(err.message || "Failed to cast votes");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSecurityPinSubmit = () => {
    if (!securityPin || securityPin.trim().length === 0) {
      setPinError("PIN is required");
      return;
    }
    // Simple PIN validation (in production, use server-side validation)
    if (securityPin.length < 4) {
      setPinError("PIN must be at least 4 characters");
      return;
    }
    setPinError("");
    setShowSecurityPin(false);
    confirmSubmit();
  };

  const formatTime = (ms) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const selectedCount = Object.keys(selectedVotes).length;
  const isSessionExpiring = sessionTime < 5 * 60 * 1000;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-12 max-w-md w-full">
          <LoadingSpinner message="Loading your ballot..." />
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Security Watermark */}
      <div className="fixed inset-0 pointer-events-none select-none opacity-5 z-0 flex items-center justify-center">
        <div className="transform -rotate-45 text-9xl font-bold text-gray-800 whitespace-nowrap">
          KRATOS ELECTION
        </div>
      </div>

      {/* Fixed Header */}
      <div className="sticky top-0 z-50 bg-white/95 backdrop-blur-md shadow-lg border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              {/* Left: Voter Info */}
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-xl shadow-lg flex-shrink-0">
                  {voterData.name?.charAt(0) || "V"}
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg font-bold text-gray-900 truncate">
                    {voterData.name}
                  </h1>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    {voterData.electoral_area && (
                      <>
                        <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                        </svg>
                        <span className="truncate">{voterData.electoral_area}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Center: Progress */}
              <div className="flex-1 max-w-md">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Selection Progress
                  </span>
                  <span className="text-sm font-bold text-blue-600">
                    {selectedCount} / {portfolios.length}
                  </span>
                </div>
                <div className="w-full bg-gray-300 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-500 ease-out rounded-full"
                    style={{
                      width: `${portfolios.length > 0 ? (selectedCount / portfolios.length) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              {/* Right: Timer */}
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className={`text-xs font-medium uppercase tracking-wider ${isSessionExpiring ? "text-red-600" : "text-gray-600"}`}>
                    Time Remaining
                  </p>
                  <p className={`text-2xl font-bold tabular-nums ${isSessionExpiring ? "text-red-600 animate-pulse" : "text-blue-600"}`}>
                    {formatTime(sessionTime)}
                  </p>
                </div>
                {isSessionExpiring && (
                  <svg className="w-6 h-6 text-red-600 animate-pulse flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-4 mb-6 flex items-start gap-3 shadow-md animate-slideDown">
            <svg className="w-6 h-6 text-red-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="text-sm text-red-800 font-medium">{error}</p>
            </div>
          </div>
        )}

        {/* Session Warning */}
        {isSessionExpiring && (
          <div className="bg-orange-50 border-l-4 border-orange-400 rounded-lg p-4 mb-6 flex items-start gap-3 shadow-md">
            <svg className="w-6 h-6 text-orange-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="text-sm text-orange-800 font-medium">
                Session expires in {formatTime(sessionTime)}. Please complete your vote soon.
              </p>
            </div>
          </div>
        )}

        {/* Portfolios */}
        <div className="space-y-8">
          {portfolios.map((portfolio, idx) => (
            <PortfolioSection
              key={portfolio.id}
              portfolio={portfolio}
              index={idx}
              selectedVotes={selectedVotes}
              onCandidateSelect={handleCandidateSelect}
              portfolioCount={portfolios.length}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="mt-12 text-center text-sm text-gray-500 pb-32">
          <div className="flex items-center justify-center gap-2 mb-3">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <p className="font-bold text-gray-700">Kratos Election System</p>
          </div>
          <p className="text-gray-500">
            All votes are encrypted, confidential, and final upon submission
          </p>
        </div>
      </div>

      {/* Submit Button - Floating */}
      <div className="fixed bottom-8 right-8 z-40">
        <button
          onClick={handleSubmitVotes}
          disabled={submitting || selectedCount === 0}
          className={`group flex items-center gap-3 px-7 py-3 rounded-full font-semibold text-base shadow-2xl transition-all duration-300 ${submitting || selectedCount === 0
            ? "bg-gray-300 text-gray-500 cursor-not-allowed"
            : "bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 hover:shadow-2xl hover:scale-105"
            }`}
          title={selectedCount === 0 ? "Make at least one selection" : "Review and submit your ballot"}
        >
          {submitting ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              <span>Submitting...</span>
            </>
          ) : (
            <>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m7 8a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Submit Ballot</span>
              {selectedCount > 0 && (
                <span className="bg-white text-blue-600 px-2.5 py-0.5 rounded-full text-sm font-bold">
                  {selectedCount}
                </span>
              )}
            </>
          )}
        </button>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-8 animate-slideUp">
            <div className="text-center mb-6">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-blue-200 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m7 8a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-3xl font-bold text-gray-900 mb-3">
                Review Your Ballot
              </h3>
              <p className="text-gray-600 text-lg mb-4">
                You are about to submit{" "}
                <span className="font-bold text-blue-600">
                  {selectedCount} selection{selectedCount > 1 ? "s" : ""}
                </span>
              </p>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-700 font-semibold text-sm">
                  ⚠️ This action cannot be undone.
                </p>
              </div>
            </div>

            {/* Vote Summary */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6 max-h-64 overflow-y-auto">
              <h4 className="font-semibold text-gray-900 mb-3">Selections Summary:</h4>
              <div className="space-y-2">
                {portfolios.map((portfolio) =>
                  selectedVotes[portfolio.id] ? (
                    <div key={portfolio.id} className="flex items-center gap-2 text-sm">
                      <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-gray-700">{portfolio.name}:</span>
                      <span className="font-semibold text-gray-900">
                        {portfolio.candidates.find(c => c.id === selectedVotes[portfolio.id])?.name}
                      </span>
                    </div>
                  ) : null
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 px-6 py-3 rounded-xl font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                Review Again
              </button>
              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  setShowSecurityPin(true);
                }}
                className="flex-1 px-6 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg hover:shadow-xl transition-all"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Security PIN Modal */}
      {showSecurityPin && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-8 animate-slideUp">
            <div className="text-center mb-6">
              <div className="w-20 h-20 bg-gradient-to-br from-yellow-100 to-orange-100 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                <svg className="w-10 h-10 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" />
                </svg>
              </div>
              <h3 className="text-3xl font-bold text-gray-900 mb-2">
                Security Verification
              </h3>
              <p className="text-gray-600 text-sm mb-4">
                Enter your voting PIN to confirm and submit your ballot
              </p>
            </div>

            {pinError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-red-700 text-sm font-medium">{pinError}</p>
              </div>
            )}

            <input
              type="password"
              value={securityPin}
              onChange={(e) => {
                setSecurityPin(e.target.value);
                setPinError("");
              }}
              onKeyPress={(e) => e.key === "Enter" && handleSecurityPinSubmit()}
              placeholder="Enter your PIN"
              className="w-full px-4 py-3 rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:outline-none transition-colors text-center text-2xl tracking-widest mb-6"
              autoFocus
            />

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowSecurityPin(false);
                  setSecurityPin("");
                  setPinError("");
                }}
                className="flex-1 px-6 py-3 rounded-xl font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSecurityPinSubmit}
                className="flex-1 px-6 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg hover:shadow-xl transition-all"
              >
                Verify & Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VotingBallot;