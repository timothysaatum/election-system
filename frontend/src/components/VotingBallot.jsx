import { useState, useEffect, useMemo, memo, useCallback } from "react";
import { votingApi } from "../services/votingApi";
import LoadingSpinner from "./shared/LoadingSpinner";
import { Shield, ChevronRight, ChevronLeft, CheckCircle2, Clock, Info, AlertCircle } from "lucide-react";

const API_BASE_URL = process.env.REACT_APP_API_URL || "/api";

/**
 * Official Candidate Card - Optimized for Face Visibility
 */
const CandidateCard = memo(({ candidate, isSelected, portfolio, onSelect }) => {
  return (
    <button
      onClick={() => onSelect(portfolio.id, candidate.id)}
      className={`relative group flex flex-col items-center p-6 rounded-2xl border-2 transition-all duration-200 ${isSelected
        ? "border-blue-700 bg-blue-50/50 ring-1 ring-blue-700 shadow-md"
        : "border-slate-200 bg-white hover:border-blue-400 hover:shadow-sm"
        } w-full max-w-md`}
    >
      {isSelected && (
        <div className="absolute top-4 right-4 z-10 text-blue-700 animate-in zoom-in">
          <CheckCircle2 className="w-10 h-10 fill-blue-700 text-white" />
        </div>
      )}

      {/* Portrait Container - Optimized for head visibility */}
      <div className="w-full aspect-[4/5] rounded-xl overflow-hidden mb-6 border border-slate-200 bg-slate-50 transition-transform duration-300 group-hover:scale-[1.02] flex items-center justify-center shadow-inner">
        <img
          src={candidate.picture_url ? `${API_BASE_URL.replace("/api", "")}${candidate.picture_url}` : "https://via.placeholder.com/800x1000?text=No+Photo"}
          alt={candidate.name}
          /* object-top ensures the head is not cut off in portrait shots */
          className="w-full h-full object-cover object-top"
          loading="eager"
          onError={(e) => {
            e.target.src = "https://via.placeholder.com/800x1000?text=Photo+Unavailable";
          }}
        />
      </div>

      <div className="text-center w-full">
        <h3 className="text-2xl font-black text-slate-900 mb-1 leading-tight">{candidate.name}</h3>
        <p className="text-slate-500 font-bold text-xs uppercase tracking-widest">
          {candidate.party || "Independent Candidate"}
        </p>
      </div>
    </button>
  );
});

/**
 * Already Voted Screen Component
 */
const AlreadyVotedScreen = ({ votedAt, studentId, onSessionEnd }) => {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full bg-white rounded-3xl shadow-2xl p-12 text-center border-2 border-amber-200">
        <div className="w-24 h-24 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-8">
          <AlertCircle className="w-14 h-14" />
        </div>

        <h1 className="text-4xl font-black text-slate-900 mb-4">
          You Have Already Voted
        </h1>

        <p className="text-xl text-slate-600 mb-8 leading-relaxed">
          You have already cast your vote in this election.
        </p>

        <div className="bg-slate-50 rounded-2xl p-6 mb-8">
          <div className="grid grid-cols-2 gap-6 text-left">
            <div>
              <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">
                Student ID
              </p>
              <p className="text-lg font-black text-slate-900">
                {studentId}
              </p>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">
                Voted At
              </p>
              <p className="text-lg font-black text-slate-900">
                {votedAt ? new Date(votedAt).toLocaleString() : "Recently"}
              </p>
            </div>
          </div>
        </div>

        <div className="border-t-2 border-slate-100 pt-6">
          <p className="text-sm text-slate-500 mb-4">
            Your vote has been securely recorded. Thank you.
          </p>
          <button
            onClick={onSessionEnd}
            className="px-8 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all"
          >
            Return to Token Verification
          </button>
        </div>
      </div>
    </div>
  );
};

const VotingBallot = ({ voterData, onVoteComplete, sessionTime, onSessionEnd }) => {
  const [candidates, setCandidates] = useState([]);
  const [selectedVotes, setSelectedVotes] = useState({});
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [alreadyVoted, setAlreadyVoted] = useState(false);
  const [votedInfo, setVotedInfo] = useState(null);

  useEffect(() => {
    const loadBallot = async () => {
      try {
        setLoading(true);
        const data = await votingApi.getBallot();
        setCandidates(data);
      } catch (err) {
        if (err.message && err.message.includes("already voted")) {
          setAlreadyVoted(true);
          try {
            const errorData = JSON.parse(err.message);
            setVotedInfo(errorData);
          } catch {
            setVotedInfo({ message: err.message });
          }
        } else {
          setError(err.message || "Failed to load ballot");
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
    const finalVotes = Object.entries(selectedVotes)
      .filter(([_, value]) => value !== "reject")
      .map(([portfolio_id, candidate_id]) => ({ portfolio_id, candidate_id }));

    setSubmitting(true);
    try {
      const result = await votingApi.castVote(finalVotes);
      // Call the callback to handle successful vote
      onVoteComplete(result);
    } catch (err) {
      if (err.message && err.message.includes("already voted")) {
        setAlreadyVoted(true);
        setShowConfirmModal(false);
        try {
          const errorData = JSON.parse(err.message);
          setVotedInfo(errorData);
        } catch {
          setVotedInfo({ message: err.message });
        }
      } else {
        setError(err.message || "Failed to cast votes");
      }
      setSubmitting(false);
    }
  };

  if (alreadyVoted) {
    return (
      <AlreadyVotedScreen
        votedAt={votedInfo?.voted_at}
        studentId={votedInfo?.student_id || voterData?.student_id}
        onSessionEnd={onSessionEnd}
      />
    );
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <LoadingSpinner message="Establishing Secure Connection..." />
    </div>
  );

  if (error && !alreadyVoted) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Error Loading Ballot</h2>
        <p className="text-slate-600 mb-6">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
        >
          Try Again
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col font-sans text-slate-900">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 px-6 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-slate-900 p-2.5 rounded-lg shadow-lg">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tighter text-slate-900 uppercase">Official Ballot</h1>
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">
                <span className="text-blue-600">Secure Session</span>
                <span>•</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {Math.floor(sessionTime / 60000)}:{(Math.floor((sessionTime % 60000) / 1000)).toString().padStart(2, '0')}</span>
              </div>
            </div>
          </div>

          <div className="hidden md:flex flex-col items-end">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Ballot Progress</span>
            <div className="flex gap-1.5">
              {portfolios.map((_, idx) => (
                <div key={idx} className={`h-2 w-8 rounded-full transition-all duration-500 ${idx <= currentStep ? "bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.4)]" : "bg-slate-200"}`} />
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-12">
        <div className="mb-12 pb-8 border-b-2 border-slate-200/60">
          <div className="flex items-center gap-4 mb-3">
            <span className="bg-blue-600 text-white px-4 py-1 rounded-md font-black text-sm uppercase">Section {currentStep + 1}</span>
          </div>
          <h2 className="text-5xl font-black tracking-tight text-slate-900 mb-4">{currentPortfolio?.name}</h2>
          <p className="text-slate-500 text-xl max-w-3xl font-medium leading-relaxed">
            {currentPortfolio?.description || "Select candidate for this office to cast vote"}
          </p>
        </div>

        {currentPortfolio && (
          <div className="animate-in fade-in slide-in-from-bottom-6 duration-700">
            {currentPortfolio.candidates.length === 1 ? (
              <div className="flex justify-center">
                <div className="bg-white border border-slate-200 rounded-[3rem] p-12 md:p-16 max-w-4xl w-full shadow-xl flex flex-col items-center">
                  {/* Portrait aspect for single candidates */}
                  <div className="w-full max-w-sm aspect-[4/5] rounded-[2rem] overflow-hidden border-4 border-slate-50 shadow-2xl mb-10 ring-1 ring-slate-200 bg-slate-100">
                    <img
                      src={currentPortfolio.candidates[0].picture_url ? `${API_BASE_URL.replace("/api", "")}${currentPortfolio.candidates[0].picture_url}` : "https://via.placeholder.com/800x1000"}
                      alt={currentPortfolio.candidates[0].name}
                      className="w-full h-full object-cover object-top"
                      onError={(e) => {
                        e.target.src = "https://via.placeholder.com/800x1000?text=Photo+Unavailable";
                      }}
                    />
                  </div>
                  <div className="text-center">
                    <h3 className="text-5xl font-black mb-2 text-slate-900">{currentPortfolio.candidates[0].name}</h3>
                    <p className="text-blue-600 font-bold mb-10 tracking-[0.3em] uppercase text-lg">{currentPortfolio.candidates[0].party || "Independent"}</p>
                    <div className="flex flex-wrap justify-center gap-6">
                      <button
                        onClick={() => handleSelection(currentPortfolio.id, currentPortfolio.candidates[0].id)}
                        className={`px-12 py-5 rounded-2xl font-black text-2xl transition-all shadow-lg ${currentSelection === currentPortfolio.candidates[0].id ? "bg-blue-700 text-white scale-105" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                      >ENDORSE</button>
                      <button
                        onClick={() => handleSelection(currentPortfolio.id, "reject")}
                        className={`px-12 py-5 rounded-2xl font-black text-2xl transition-all shadow-lg ${currentSelection === "reject" ? "bg-red-700 text-white scale-105" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                      >REJECT</button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 justify-items-center">
                {currentPortfolio.candidates.map(cand => (
                  <CandidateCard key={cand.id} candidate={cand} portfolio={currentPortfolio} isSelected={currentSelection === cand.id} onSelect={handleSelection} />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 p-8 sticky bottom-0 z-50 backdrop-blur-md bg-white/90">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <button
            onClick={prevStep}
            disabled={currentStep === 0}
            className={`flex items-center gap-3 px-8 py-4 rounded-xl font-black text-sm uppercase tracking-widest transition-all ${currentStep === 0 ? "opacity-0 pointer-events-none" : "text-slate-500 hover:bg-slate-100 active:scale-95"}`}
          >
            <ChevronLeft className="w-5 h-5" /> PREVIOUS
          </button>

          <div className="flex items-center gap-8">
            {!hasSelected && (
              <div className="hidden lg:flex items-center gap-2 text-amber-600 font-black text-xs uppercase tracking-tighter animate-pulse">
                <Info className="w-4 h-4" /> Selection Required
              </div>
            )}
            <button
              onClick={nextStep}
              disabled={!hasSelected || submitting}
              className={`flex items-center gap-3 px-12 py-4 rounded-xl font-black text-lg uppercase tracking-widest transition-all shadow-xl ${hasSelected
                ? "bg-slate-900 text-white hover:bg-blue-800 hover:translate-y-[-2px] active:translate-y-0"
                : "bg-slate-200 text-slate-400 cursor-not-allowed"
                }`}
            >
              {currentStep === portfolios.length - 1 ? "FINALIZE BALLOT" : "NEXT OFFICE"}
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>
        </div>
      </footer>

      {showConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md flex items-center justify-center p-4 z-[100] animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl p-10 max-w-lg w-full shadow-2xl border border-slate-100">
            <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-12 h-12" />
            </div>
            <h3 className="text-3xl font-black text-slate-900 mb-3 text-center">Confirm Your Vote</h3>
            <p className="text-slate-500 mb-8 font-medium text-center">
              You are about to submit your ballot. Please review your selections carefully before confirming.
            </p>

            <div className="bg-slate-50 rounded-2xl p-6 mb-8 max-h-64 overflow-y-auto">
              <h4 className="font-bold text-slate-700 mb-4 text-sm uppercase tracking-wider">Your Selections:</h4>
              <div className="space-y-3">
                {portfolios.map(portfolio => (
                  <div key={portfolio.id} className="flex justify-between items-center text-sm">
                    <span className="font-semibold text-slate-600">{portfolio.name}:</span>
                    <span className="font-bold text-slate-900">
                      {selectedVotes[portfolio.id] === "reject"
                        ? "REJECTED"
                        : portfolio.candidates.find(c => c.id === selectedVotes[portfolio.id])?.name || "Not selected"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <button
                onClick={handleFinalSubmit}
                disabled={submitting}
                className="w-full py-5 bg-blue-700 text-white rounded-2xl font-black text-xl hover:bg-blue-800 transition-all shadow-lg shadow-blue-200 disabled:bg-slate-400 disabled:cursor-not-allowed"
              >
                {submitting ? "SUBMITTING..." : "CONFIRM & SUBMIT BALLOT"}
              </button>
              <button
                onClick={() => setShowConfirmModal(false)}
                disabled={submitting}
                className="w-full py-4 text-slate-400 font-bold hover:text-slate-600 transition-colors disabled:opacity-50"
              >
                GO BACK & REVIEW
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VotingBallot;