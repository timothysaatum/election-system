import { useState, useEffect, useMemo, memo, useCallback } from "react";
import { votingApi } from "../services/votingApi";
import LoadingSpinner from "./shared/LoadingSpinner";

const API_BASE_URL = process.env.REACT_APP_API_URL || "/api";

/**
 * Enhanced Candidate Card for Multi-candidate Portfolios
 * Designed with a large image area to ensure faces are clearly visible.
 */
const CandidateCard = memo(({ candidate, isSelected, portfolio, onSelect }) => {
  return (
    <button
      onClick={() => onSelect(portfolio.id, candidate.id)}
      className={`relative group flex flex-col items-center p-6 rounded-[2.5rem] border-4 transition-all duration-300 transform ${isSelected
          ? "border-blue-600 bg-blue-50 shadow-2xl scale-105"
          : "border-gray-200 hover:border-blue-300 hover:bg-white hover:shadow-xl"
        }`}
    >
      {/* Selection Checkmark */}
      {isSelected && (
        <div className="absolute -top-4 -right-4 w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center shadow-lg z-20 animate-in zoom-in">
          <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}

      {/* Large Image Container */}
      <div className={`w-64 h-64 md:w-72 md:h-72 rounded-[2rem] overflow-hidden shadow-xl mb-6 bg-gray-100 border-4 transition-colors ${isSelected ? 'border-blue-400' : 'border-white'}`}>
        <img
          src={candidate.picture_url ? `${API_BASE_URL.replace("/api", "")}${candidate.picture_url}` : "https://via.placeholder.com/400x400?text=No+Photo"}
          alt={candidate.name}
          className="w-full h-full object-cover"
          loading="eager"
        />
      </div>

      <div className="text-center">
        <h3 className="text-2xl font-black text-gray-900 mb-1 leading-tight">{candidate.name}</h3>
        {candidate.party && (
          <span className="px-4 py-1 bg-indigo-100 text-indigo-700 text-[10px] font-black rounded-full uppercase tracking-widest">
            {candidate.party}
          </span>
        )}
      </div>
    </button>
  );
});

const VotingBallot = ({ voterData, onVoteComplete, sessionTime }) => {
  const [candidates, setCandidates] = useState([]);
  const [selectedVotes, setSelectedVotes] = useState({});
  const [currentStep, setCurrentStep] = useState(0); // Carousel navigation state
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSecurityPin, setShowSecurityPin] = useState(false);
  const [securityPin, setSecurityPin] = useState("");
  const [pinError, setPinError] = useState("");

  // Load Ballot Data
  useEffect(() => {
    const loadBallot = async () => {
      try {
        setLoading(true);
        const data = await votingApi.getBallot();
        setCandidates(data);
      } catch (err) {
        setError(err.message || "Failed to load ballot");
      } finally {
        setLoading(false);
      }
    };
    loadBallot();
  }, []);

  // Organize candidates by Portfolio
  const portfolios = useMemo(() => {
    const map = new Map();
    candidates.forEach((cand) => {
      if (!cand.portfolio) return;
      const key = cand.portfolio.id;
      if (!map.has(key)) map.set(key, { ...cand.portfolio, candidates: [] });
      map.get(key).candidates.push(cand);
    });

    return Array.from(map.values())
      .sort((a, b) => a.voting_order - b.voting_order)
      .map(p => ({
        ...p,
        candidates: p.candidates.sort((a, b) => a.display_order - b.display_order)
      }));
  }, [candidates]);

  const currentPortfolio = portfolios[currentStep];
  const currentSelection = selectedVotes[currentPortfolio?.id];
  const hasSelected = !!currentSelection;

  const handleSelection = useCallback((portfolioId, value) => {
    setSelectedVotes(prev => ({ ...prev, [portfolioId]: value }));
  }, []);

  const nextStep = () => {
    if (currentStep < portfolios.length - 1) {
      setCurrentStep(prev => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setShowConfirmModal(true);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleFinalSubmit = async () => {
    if (!securityPin) return setPinError("PIN is required");

    // Filter out "reject" votes if your API only expects chosen candidate IDs
    const finalVotes = Object.entries(selectedVotes)
      .filter(([_, value]) => value !== "reject")
      .map(([portfolio_id, candidate_id]) => ({ portfolio_id, candidate_id }));

    setSubmitting(true);
    try {
      const result = await votingApi.castVote(finalVotes);
      onVoteComplete(result);
    } catch (err) {
      setError(err.message || "Failed to cast votes");
      setSubmitting(false);
      setShowSecurityPin(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <LoadingSpinner message="Securing your ballot..." />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col relative overflow-x-hidden">

      {/* Sticky Header with Progress Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b shadow-sm px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white font-black text-xl shadow-lg">
              {currentStep + 1}
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">Office {currentStep + 1} of {portfolios.length}</p>
              <h2 className="text-xl md:text-2xl font-black text-gray-900 leading-none">{currentPortfolio?.name}</h2>
            </div>
          </div>

          <div className="hidden md:block flex-1 max-w-sm px-10">
            <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden border">
              <div
                className="bg-blue-600 h-full transition-all duration-700 ease-in-out"
                style={{ width: `${((currentStep + 1) / portfolios.length) * 100}%` }}
              />
            </div>
          </div>

          <div className="text-right">
            <p className="text-xl font-mono font-black text-blue-600">
              {Math.floor(sessionTime / 60000)}:{(Math.floor((sessionTime % 60000) / 1000)).toString().padStart(2, '0')}
            </p>
          </div>
        </div>
      </header>

      {/* Main Scrollable Area 
          pb-52 ensures that even the tallest cards can be scrolled completely above the fixed footer 
      */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 pt-12 pb-52">
        {currentPortfolio && (
          <div key={currentPortfolio.id} className="animate-in fade-in slide-in-from-bottom-8 duration-500">

            <div className="text-center mb-12">
              <p className="text-gray-500 text-lg max-w-2xl mx-auto font-medium">
                {currentPortfolio.description || "Review the candidate(s) below and make your selection for this office."}
              </p>
            </div>

            {currentPortfolio.candidates.length === 1 ? (
              /* --- Single Candidate Endorse/Reject View --- */
              <div className="flex flex-col items-center">
                <div className="bg-white rounded-[3.5rem] shadow-2xl p-10 md:p-14 border border-gray-100 flex flex-col items-center max-w-2xl w-full">
                  <div className="w-full max-w-[340px] aspect-square rounded-[2.5rem] overflow-hidden shadow-2xl mb-10 ring-8 ring-slate-50 border-4 border-white bg-gray-50">
                    <img
                      src={currentPortfolio.candidates[0].picture_url ? `${API_BASE_URL.replace("/api", "")}${currentPortfolio.candidates[0].picture_url}` : "https://via.placeholder.com/500x500?text=No+Photo"}
                      alt={currentPortfolio.candidates[0].name}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <h3 className="text-4xl md:text-5xl font-black text-gray-900 text-center mb-3 leading-tight">
                    {currentPortfolio.candidates[0].name}
                  </h3>
                  <p className="text-indigo-600 font-bold uppercase tracking-[0.3em] mb-12 text-sm">
                    {currentPortfolio.candidates[0].party || "Independent Candidate"}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full">
                    <button
                      onClick={() => handleSelection(currentPortfolio.id, currentPortfolio.candidates[0].id)}
                      className={`py-7 rounded-2xl font-black text-2xl transition-all border-4 flex flex-col items-center gap-2 ${currentSelection === currentPortfolio.candidates[0].id
                          ? "bg-green-600 border-green-200 text-white shadow-2xl scale-105"
                          : "bg-white border-gray-100 text-green-600 hover:border-green-400"
                        }`}
                    >
                      <span className="text-sm opacity-80">I Approve</span>
                      ENDORSE
                    </button>
                    <button
                      onClick={() => handleSelection(currentPortfolio.id, "reject")}
                      className={`py-7 rounded-2xl font-black text-2xl transition-all border-4 flex flex-col items-center gap-2 ${currentSelection === "reject"
                          ? "bg-red-600 border-red-200 text-white shadow-2xl scale-105"
                          : "bg-white border-gray-100 text-red-600 hover:border-red-400"
                        }`}
                    >
                      <span className="text-sm opacity-80">I Disapprove</span>
                      REJECT
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* --- Multiple Candidates Grid View --- */
              <div className="flex flex-wrap justify-center gap-8 md:gap-14">
                {currentPortfolio.candidates.map(cand => (
                  <CandidateCard
                    key={cand.id}
                    candidate={cand}
                    portfolio={currentPortfolio}
                    isSelected={currentSelection === cand.id}
                    onSelect={handleSelection}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Fixed Bottom Navigation Carousel Bar */}
      <footer className="fixed bottom-0 inset-x-0 bg-white/90 backdrop-blur-xl border-t p-6 z-40 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)]">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-6">
          <button
            onClick={prevStep}
            disabled={currentStep === 0}
            className={`px-10 py-5 font-black rounded-2xl transition-all flex items-center gap-2 ${currentStep === 0 ? "opacity-0 pointer-events-none" : "bg-gray-100 text-gray-500 hover:bg-gray-200 active:scale-95"
              }`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
            BACK
          </button>

          <div className="flex-1 max-w-md flex flex-col items-center">
            {!hasSelected && (
              <span className="text-xs font-bold text-orange-600 mb-2 animate-bounce">Please make a selection</span>
            )}
            <button
              onClick={nextStep}
              disabled={!hasSelected || submitting}
              className={`w-full py-5 rounded-2xl font-black text-xl shadow-2xl transition-all transform flex items-center justify-center gap-3 ${hasSelected
                  ? "bg-blue-600 text-white hover:scale-105 active:scale-95 shadow-blue-200 hover:bg-blue-700"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }`}
            >
              {currentStep === portfolios.length - 1 ? "FINISH & REVIEW" : "NEXT PORTFOLIO"}
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 7l5 5-5 5M6 7l5 5-5 5" /></svg>
            </button>
          </div>
        </div>
      </footer>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 z-[100]">
          <div className="bg-white rounded-[3rem] p-12 max-w-md w-full shadow-2xl text-center animate-in zoom-in duration-300">
            <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-8 text-4xl shadow-inner">✓</div>
            <h3 className="text-3xl font-black mb-4">Ballot Complete</h3>
            <p className="text-gray-500 text-lg mb-10 leading-relaxed">
              You have made selections for all <b>{portfolios.length}</b> offices. Ready to submit?
            </p>
            <div className="space-y-4">
              <button
                onClick={() => { setShowConfirmModal(false); setShowSecurityPin(true); }}
                className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black text-xl hover:bg-blue-700 transition-all"
              >
                PROCEED TO SUBMIT
              </button>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="w-full py-4 text-gray-400 font-bold hover:bg-gray-50 rounded-xl"
              >
                REVIEW CHOICES
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Security PIN Modal */}
      {showSecurityPin && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-lg flex items-center justify-center p-4 z-[110]">
          <div className="bg-white rounded-[3rem] p-12 max-w-md w-full shadow-2xl text-center">
            <h3 className="text-2xl font-black mb-2 text-gray-900">Authorize Vote</h3>
            <p className="text-gray-500 mb-10 font-medium">Enter your secure PIN to finalize submission.</p>

            <input
              type="password"
              value={securityPin}
              onChange={(e) => { setSecurityPin(e.target.value); setPinError(""); }}
              className="w-full text-center text-5xl tracking-[0.5em] font-mono border-b-8 border-blue-600 focus:outline-none mb-4 pb-2 text-blue-900"
              autoFocus
              maxLength={6}
            />

            {pinError && <p className="text-red-500 font-black mb-6 animate-shake">{pinError}</p>}

            <button
              onClick={handleFinalSubmit}
              disabled={submitting}
              className="w-full py-6 bg-green-600 text-white rounded-2xl font-black text-2xl hover:bg-green-700 shadow-xl disabled:bg-gray-400 transition-all mt-6"
            >
              {submitting ? "SUBMITTING..." : "CAST MY VOTE"}
            </button>
          </div>
        </div>
      )}

      {/* Error Overlay */}
      {error && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[150] bg-red-600 text-white px-8 py-4 rounded-2xl shadow-2xl font-bold animate-bounce">
          {error}
        </div>
      )}

    </div>
  );
};

export default VotingBallot;