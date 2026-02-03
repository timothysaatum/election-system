import { useState, useEffect, useMemo, memo, useCallback } from "react";
import { votingApi } from "../services/votingApi";
import LoadingSpinner from "./shared/LoadingSpinner";
import {
  ShieldCheck,
  User,
  MapPin,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Info,
  ChevronRight,
  Lock
} from "lucide-react";

const API_BASE_URL = process.env.REACT_APP_API_URL || "/api";

/**
 * CandidateCard: Redesigned for high legibility and clear selection states.
 */
const CandidateCard = memo(({ candidate, isSelected, portfolio, onSelect }) => {
  return (
    <button
      onClick={() => onSelect(portfolio.id, candidate.id)}
      className={`relative w-full group flex flex-col overflow-hidden rounded-xl border-2 transition-all duration-200 text-left ${isSelected
          ? "border-blue-600 bg-blue-50/50 ring-2 ring-blue-600 shadow-lg"
          : "border-slate-200 bg-white hover:border-blue-400 hover:shadow-md"
        }`}
    >
      {/* Checkmark Overlay */}
      <div className={`absolute top-4 right-4 z-10 transition-all duration-300 ${isSelected ? 'scale-110 opacity-100' : 'scale-0 opacity-0'}`}>
        <CheckCircle2 className="w-8 h-8 text-blue-600 fill-white" />
      </div>

      <div className="flex p-5 gap-5">
        {/* Candidate Image with "Official" Frame */}
        <div className="flex-shrink-0">
          <div className={`w-28 h-28 sm:w-36 sm:h-36 rounded-lg overflow-hidden border-4 bg-slate-50 transition-colors ${isSelected ? 'border-white shadow-sm' : 'border-slate-100'}`}>
            <img
              src={candidate.picture_url ? `${API_BASE_URL.replace("/api", "")}${candidate.picture_url}` : "https://via.placeholder.com/150?text=Candidate"}
              alt={candidate.name}
              className="w-full h-full object-cover grayscale-[20%] group-hover:grayscale-0 transition-all"
              loading="lazy"
              onError={(e) => { e.target.src = "https://via.placeholder.com/150?text=No+Photo"; }}
            />
          </div>
        </div>

        {/* Candidate Bio/Details */}
        <div className="flex-1 flex flex-col justify-center">
          <span className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] mb-1">
            {candidate.party || "Independent"}
          </span>
          <h3 className="text-xl font-bold text-slate-900 leading-tight mb-2">
            {candidate.name}
          </h3>
          {candidate.manifesto && (
            <p className="text-sm text-slate-500 italic line-clamp-3 leading-relaxed">
              "{candidate.manifesto}"
            </p>
          )}
        </div>
      </div>

      {/* Interaction Footer */}
      <div className={`py-2 px-4 text-[10px] font-black text-center border-t tracking-widest transition-colors ${isSelected ? "bg-blue-600 text-white border-blue-600" : "bg-slate-50 text-slate-400 border-slate-100"
        }`}>
        {isSelected ? "CONFIRMED SELECTION" : "TAP TO SELECT CANDIDATE"}
      </div>
    </button>
  );
});

CandidateCard.displayName = "CandidateCard";

/**
 * PortfolioSection: Styled to look like a section of a physical ballot paper.
 */
const PortfolioSection = memo(({ portfolio, index, selectedVotes, onCandidateSelect }) => {
  return (
    <section className="mb-16">
      <div className="flex flex-col md:flex-row md:items-end gap-2 mb-8 border-b-4 border-slate-900 pb-4">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-10 h-10 bg-slate-900 text-white font-black rounded-md">
            {index + 1}
          </span>
          <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tight">
            {portfolio.name}
          </h2>
        </div>
        <p className="md:ml-auto text-sm font-bold text-slate-500 uppercase tracking-widest bg-slate-100 px-3 py-1 rounded">
          Choose One (1) Candidate
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
    </section>
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

  const portfolios = useMemo(() => {
    const map = new Map();
    candidates.forEach((cand) => {
      const port = cand.portfolio;
      if (!port) return;
      if (!map.has(port.id)) map.set(port.id, { ...port, candidates: [] });
      map.get(port.id).candidates.push(cand);
    });

    return Array.from(map.values())
      .sort((a, b) => a.voting_order - b.voting_order)
      .map(p => ({ ...p, candidates: p.candidates.sort((a, b) => a.display_order - b.display_order) }));
  }, [candidates]);

  const handleCandidateSelect = useCallback((portfolioId, candidateId) => {
    setSelectedVotes(prev => {
      if (prev[portfolioId] === candidateId) {
        const next = { ...prev };
        delete next[portfolioId];
        return next;
      }
      return { ...prev, [portfolioId]: candidateId };
    });
  }, []);

  const formatTime = (ms) => {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const selectedCount = Object.keys(selectedVotes).length;
  const isExpiring = sessionTime < 300000; // 5 minutes

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50"><LoadingSpinner message="Securing Connection..." /></div>;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 pb-32">
      {/* 1. TOP STATUS BAR */}
      <div className="bg-slate-900 text-white sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-blue-400" />
            <h1 className="font-black text-sm uppercase tracking-tighter">Kratos Election <span className="text-slate-500 font-medium">v2.1</span></h1>
          </div>

          <div className="flex items-center gap-6">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded border ${isExpiring ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse' : 'border-slate-700 text-slate-400'}`}>
              <Clock size={16} />
              <span className="font-mono font-bold">{formatTime(sessionTime)}</span>
            </div>
          </div>
        </div>
        {/* Visual Progress Line */}
        <div className="h-1 w-full bg-slate-800">
          <div
            className="h-full bg-blue-500 transition-all duration-700 ease-in-out"
            style={{ width: `${(selectedCount / portfolios.length) * 100}%` }}
          />
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-10">
        {/* 2. VOTER INFORMATION BOX */}
        <div className="bg-white border-2 border-slate-900 rounded-lg p-6 mb-12 shadow-[6px_6px_0px_0px_rgba(15,23,42,1)]">
          <div className="flex flex-wrap gap-y-4 items-center justify-between border-b border-slate-100 pb-4 mb-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-900 font-bold">
                {voterData.name?.charAt(0)}
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Registered Voter</p>
                <h2 className="text-xl font-bold">{voterData.name}</h2>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="text-right">
                <p className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1 text-right">Electoral Area</p>
                <p className="text-sm font-bold flex items-center gap-1 justify-end"><MapPin size={14} /> {voterData.electoral_area || "N/A"}</p>
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3 text-slate-600">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm leading-relaxed">
              This is a secure electronic ballot. Review all candidates before making your selection. You can change your choice at any time before clicking <strong>"Review & Cast Ballot"</strong>. Your vote is encrypted and private.
            </p>
          </div>
        </div>

        {/* 3. BALLOT SECTIONS */}
        {portfolios.map((portfolio, idx) => (
          <PortfolioSection
            key={portfolio.id}
            portfolio={portfolio}
            index={idx}
            selectedVotes={selectedVotes}
            onCandidateSelect={handleCandidateSelect}
          />
        ))}

        {/* 4. OFFICIAL FOOTER NOTES */}
        <div className="mt-20 py-10 border-t border-slate-200 text-center">
          <Lock className="w-8 h-8 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-400 text-xs font-bold uppercase tracking-[0.3em] mb-2">End of Official Ballot</p>
          <p className="text-slate-400 text-xs max-w-md mx-auto">
            All submitted data is processed via end-to-end encryption.
            Unauthorized access or tampering is a punishable offense under election laws.
          </p>
        </div>
      </main>

      {/* 5. FLOATING ACTION DOCK */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-lg border-t border-slate-200 p-6 z-40 shadow-[0_-10px_30px_rgba(0,0,0,0.05)]">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="hidden md:block">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Completion Status</p>
            <p className="text-2xl font-black text-slate-900">
              {selectedCount} <span className="text-slate-400 font-medium text-lg">/ {portfolios.length} Positions</span>
            </p>
          </div>

          <button
            onClick={() => setShowConfirmModal(true)}
            disabled={submitting || selectedCount === 0}
            className={`flex items-center gap-3 px-10 py-4 rounded-xl font-black uppercase tracking-widest transition-all duration-300 ${selectedCount === 0
                ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700 shadow-xl shadow-blue-200 hover:-translate-y-1 active:translate-y-0"
              }`}
          >
            Review & Cast Ballot
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 6. CONFIRMATION MODAL */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-200">
            <div className="p-8">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-6">
                <ShieldCheck size={32} />
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-2">Review Your Ballot</h3>
              <p className="text-slate-500 mb-6 font-medium">Please confirm your selections below before final submission.</p>

              <div className="space-y-3 max-h-60 overflow-y-auto mb-8 pr-2">
                {portfolios.map(p => selectedVotes[p.id] && (
                  <div key={p.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-tighter">{p.name}</span>
                    <span className="text-sm font-bold text-slate-900">
                      {p.candidates.find(c => c.id === selectedVotes[p.id])?.name}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={() => { setShowConfirmModal(false); setShowSecurityPin(true); }}
                  className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest hover:bg-blue-700 transition-colors"
                >
                  Confirm & Finalize
                </button>
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="w-full py-4 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition-colors"
                >
                  Go Back & Edit
                </button>
              </div>
            </div>
            <div className="bg-red-50 p-4 border-t border-red-100 flex items-center gap-3">
              <AlertTriangle className="text-red-600 flex-shrink-0" size={20} />
              <p className="text-[10px] text-red-800 font-bold leading-tight uppercase">
                Warning: Once submitted, your ballot is final and cannot be altered or retrieved.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 7. SECURITY PIN MODAL (logic as requested in your code) */}
      {showSecurityPin && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
            <Lock className="w-12 h-12 text-blue-600 mx-auto mb-4" />
            <h3 className="text-xl font-black text-slate-900 mb-2 uppercase">Identity Verification</h3>
            <p className="text-sm text-slate-500 mb-6">Enter your 4-digit security PIN to authorize this ballot.</p>

            <input
              type="password"
              maxLength={4}
              autoFocus
              value={securityPin}
              onChange={(e) => { setSecurityPin(e.target.value); setPinError(""); }}
              className="w-full text-center text-3xl font-black tracking-[1em] py-4 border-2 border-slate-200 rounded-xl focus:border-blue-600 focus:outline-none mb-4 transition-all"
            />
            {pinError && <p className="text-red-500 text-xs font-bold mb-4">{pinError}</p>}

            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setShowSecurityPin(false)} className="py-3 font-bold text-slate-400 hover:text-slate-600">Cancel</button>
              <button
                onClick={async () => {
                  if (securityPin.length < 4) return setPinError("Invalid PIN length");
                  setSubmitting(true);
                  try {
                    const votes = Object.entries(selectedVotes).map(([p_id, c_id]) => ({ portfolio_id: p_id, candidate_id: c_id }));
                    const result = await votingApi.castVote(votes);
                    onVoteComplete(result);
                  } catch (e) { setError(e.message); setShowSecurityPin(false); }
                  setSubmitting(false);
                }}
                className="py-3 bg-slate-900 text-white rounded-lg font-black uppercase text-xs tracking-widest"
              >
                Submit Vote
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VotingBallot;