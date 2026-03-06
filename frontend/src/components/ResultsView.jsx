import { Trophy, TrendingUp, Printer, Award, BarChart3, Users, CheckCircle, XCircle, MinusCircle } from 'lucide-react';
import { useMemo, useState } from 'react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getImageUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return url.startsWith('/') ? url : `/${url}`;
};

/**
 * A portfolio is a "single candidate" (endorsement-style) vote when it has
 * exactly one active candidate.  Display changes to Endorse / Reject counts.
 */
const isSingleCandidate = (result) => result.candidates.length === 1;

/**
 * A winner is only valid if at least one vote has been cast.
 * This prevents the first-added candidate being shown as winner at 0 votes.
 */
const resolveWinner = (result) => {
  if (!result.winner) return null;
  if (result.total_votes === 0) return null;
  // Guard: winner must have actually received more than 0 endorsed votes
  if ((result.winner.vote_count || 0) === 0) return null;
  return result.winner;
};

// ---------------------------------------------------------------------------
// Single-candidate card (endorsement vote)
// ---------------------------------------------------------------------------

const SingleCandidateResult = ({ result }) => {
  const candidate = result.candidates[0];
  const endorsed = candidate.vote_count || 0;
  const rejected = candidate.rejected_count || 0;
  const abstained = candidate.abstain_count || 0;
  const total = endorsed + rejected + abstained || 1; // avoid /0
  const endorsedPct = ((endorsed / total) * 100).toFixed(1);
  const rejectedPct = ((rejected / total) * 100).toFixed(1);
  const passed = endorsed > rejected && result.total_votes > 0;
  const hasVotes = result.total_votes > 0;

  return (
    <div className="mt-4">
      {/* Candidate identity */}
      <div className="flex items-center gap-4 mb-5 p-4 bg-slate-50 rounded-xl border border-slate-200">
        {candidate.picture_url ? (
          <img
            src={getImageUrl(candidate.picture_url)}
            alt={candidate.name}
            className="h-16 w-16 rounded-2xl object-cover border-2 border-slate-200 flex-shrink-0"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div className="h-16 w-16 rounded-2xl bg-slate-200 flex items-center justify-center flex-shrink-0">
            <Users className="h-8 w-8 text-slate-400" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-lg text-slate-900 truncate">{candidate.name}</p>
          {hasVotes && (
            <span className={`inline-flex items-center gap-1.5 mt-1 px-2.5 py-1 rounded-full text-xs font-bold ${passed
                ? 'bg-green-100 text-green-700 border border-green-200'
                : 'bg-red-100 text-red-700 border border-red-200'
              }`}>
              {passed ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
              {passed ? 'Endorsed' : 'Not Endorsed'}
            </span>
          )}
          {!hasVotes && (
            <span className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200">
              No votes yet
            </span>
          )}
        </div>
      </div>

      {/* Endorse / Reject / Abstain counts */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 bg-green-50 border-2 border-green-200 rounded-xl text-center">
          <CheckCircle className="h-6 w-6 text-green-600 mx-auto mb-1" />
          <p className="text-2xl font-bold text-green-700 metric-number">{endorsed}</p>
          <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mt-0.5">Endorsed</p>
          {hasVotes && <p className="text-xs text-green-500 metric-number mt-0.5">{endorsedPct}%</p>}
        </div>
        <div className="p-4 bg-red-50 border-2 border-red-200 rounded-xl text-center">
          <XCircle className="h-6 w-6 text-red-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-red-600 metric-number">{rejected}</p>
          <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mt-0.5">Rejected</p>
          {hasVotes && <p className="text-xs text-red-400 metric-number mt-0.5">{rejectedPct}%</p>}
        </div>
        <div className="p-4 bg-slate-50 border-2 border-slate-200 rounded-xl text-center">
          <MinusCircle className="h-6 w-6 text-slate-400 mx-auto mb-1" />
          <p className="text-2xl font-bold text-slate-500 metric-number">{abstained}</p>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-0.5">Abstained</p>
        </div>
      </div>

      {/* Progress bar */}
      {hasVotes && (
        <div className="mt-4">
          <div className="flex h-3 rounded-full overflow-hidden bg-slate-200 shadow-inner">
            <div
              className="bg-gradient-to-r from-green-500 to-green-600 transition-all duration-700"
              style={{ width: `${endorsedPct}%` }}
              title={`Endorsed: ${endorsedPct}%`}
            />
            <div
              className="bg-gradient-to-r from-red-400 to-red-500 transition-all duration-700"
              style={{ width: `${rejectedPct}%` }}
              title={`Rejected: ${rejectedPct}%`}
            />
          </div>
          <div className="flex justify-between mt-1 text-xs text-slate-400">
            <span className="text-green-600 font-medium">{endorsedPct}% endorse</span>
            <span className="text-red-500 font-medium">{rejectedPct}% reject</span>
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Multi-candidate card (competitive vote)
// ---------------------------------------------------------------------------

const MultiCandidateResult = ({ result }) => {
  const winner = resolveWinner(result);
  const hasVotes = result.total_votes > 0;

  return (
    <div className="mt-4">
      {/* Winner banner — only shown when votes exist and there's a real winner */}
      {winner && (
        <div className="bg-gradient-to-br from-amber-50 via-yellow-50 to-amber-50 border-2 border-amber-300 rounded-xl p-4 mb-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 opacity-20">
            <Trophy className="h-24 w-24 text-amber-400" />
          </div>
          <div className="relative z-10 flex items-center gap-3">
            <Trophy className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <p className="text-xs font-bold text-amber-800 uppercase tracking-wider flex-shrink-0">Winner</p>
            {winner.picture_url ? (
              <img
                src={getImageUrl(winner.picture_url)}
                alt={winner.name}
                className="h-10 w-10 rounded-xl object-cover border-2 border-white shadow flex-shrink-0"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            ) : (
              <div className="h-10 w-10 rounded-xl bg-amber-200 flex items-center justify-center flex-shrink-0">
                <Trophy className="h-5 w-5 text-amber-700" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-900 truncate">{winner.name}</p>
              <p className="text-xs text-amber-700 metric-number">
                {winner.vote_count} votes · {((winner.vote_count / result.total_votes) * 100).toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Candidate list */}
      <div className="space-y-2">
        {result.candidates.map((candidate, idx) => {
          // Safe winner check — backend may use .id or candidate_id
          const winnerId = winner?.id || winner?.candidate_id;
          const candidateId = candidate.id || candidate.candidate_id;
          const isLeader = winnerId && candidateId === winnerId;
          const votes = candidate.vote_count || 0;
          const pct = hasVotes ? ((votes / result.total_votes) * 100).toFixed(1) : 0;

          return (
            <div
              key={candidate.id || idx}
              className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${isLeader
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-slate-50 border-transparent'
                }`}
            >
              {/* Rank */}
              <span className={`text-sm font-bold w-6 flex-shrink-0 ${isLeader ? 'text-amber-600' : 'text-slate-400'}`}>
                #{idx + 1}
              </span>

              {/* Photo */}
              {candidate.picture_url ? (
                <img
                  src={getImageUrl(candidate.picture_url)}
                  alt={candidate.name}
                  className={`h-10 w-10 rounded-xl object-cover flex-shrink-0 border-2 ${isLeader ? 'border-amber-300' : 'border-slate-200'}`}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              ) : (
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isLeader ? 'bg-amber-100 border-2 border-amber-300' : 'bg-slate-200'}`}>
                  <Users className={`h-5 w-5 ${isLeader ? 'text-amber-600' : 'text-slate-400'}`} />
                </div>
              )}

              {/* Name + bar */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className={`font-semibold text-sm truncate ${isLeader ? 'text-slate-900' : 'text-slate-700'}`}>
                    {candidate.name}
                  </span>
                  <span className={`text-sm font-bold metric-number flex-shrink-0 ${isLeader ? 'text-amber-700' : 'text-slate-600'}`}>
                    {votes} {hasVotes && <span className="text-xs font-normal text-slate-400">({pct}%)</span>}
                  </span>
                </div>
                {/* Inline bar */}
                <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${isLeader ? 'bg-amber-500' : 'bg-slate-400'}`}
                    style={{ width: hasVotes ? `${pct}%` : '0%' }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* No votes yet state */}
      {!hasVotes && (
        <p className="text-center text-xs text-slate-400 mt-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
          No votes cast yet — results will appear here during voting
        </p>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main ResultsView
// ---------------------------------------------------------------------------

export const ResultsView = ({ results }) => {
  const stats = useMemo(() => {
    const totalVotes = results.reduce((sum, r) => sum + (r.total_votes || 0), 0);
    const totalPortfolios = results.length;
    // Only count genuine winners (votes > 0)
    const winners = results.filter(r => resolveWinner(r) !== null).length;
    return {
      totalVotes,
      totalPortfolios,
      winners,
      avgVotesPerPortfolio: totalPortfolios ? Math.round(totalVotes / totalPortfolios) : 0,
    };
  }, [results]);

  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=600,width=900');
    if (!printWindow) return;

    const htmlContent = `
      <html>
        <head>
          <title>Election Results</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
            h1 { text-align: center; margin-bottom: 20px; }
            .summary { margin-bottom: 30px; padding: 15px; background: #f5f5f5; border-radius: 5px; }
            .portfolio { page-break-inside: avoid; margin-bottom: 30px; border: 1px solid #ddd; padding: 15px; border-radius: 5px; }
            .portfolio-title { font-size: 18px; font-weight: bold; margin-bottom: 10px; }
            .winner { background: #fff8e1; border: 2px solid #ffd600; padding: 10px; border-radius: 5px; margin-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background: #0066cc; color: white; }
            .no-votes { color: #999; font-style: italic; }
          </style>
        </head>
        <body>
          <h1>Election Results Report</h1>
          <div class="summary">
            <p><strong>Total Votes:</strong> ${stats.totalVotes}</p>
            <p><strong>Portfolios:</strong> ${stats.totalPortfolios}</p>
            <p><strong>Winners Determined:</strong> ${stats.winners}</p>
            <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
          </div>
          ${results.map((result, idx) => {
      const winner = resolveWinner(result);
      const single = isSingleCandidate(result);
      return `
              <div class="portfolio">
                <div class="portfolio-title">${idx + 1}. ${result.portfolio_name}</div>
                ${result.total_votes === 0
          ? '<p class="no-votes">No votes cast yet</p>'
          : `<p><strong>Total Votes:</strong> ${result.total_votes}</p>`
        }
                ${winner ? `<div class="winner">🏆 <strong>Winner: ${winner.name}</strong> — ${winner.vote_count} votes</div>` : ''}
                <table>
                  <thead>
                    <tr>
                      <th>Candidate</th>
                      ${single ? '<th>Endorsed</th><th>Rejected</th>' : '<th>Votes</th><th>%</th>'}
                    </tr>
                  </thead>
                  <tbody>
                    ${result.candidates.map(c => `
                      <tr>
                        <td>${c.name}</td>
                        ${single
            ? `<td>${c.vote_count || 0}</td><td>${c.rejected_count || 0}</td>`
            : `<td>${c.vote_count || 0}</td><td>${result.total_votes > 0 ? ((c.vote_count / result.total_votes) * 100).toFixed(1) : 0}%</td>`
          }
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `;
    }).join('')}
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 250);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap');
        * { font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif; }
        .metric-number { font-family: 'JetBrains Mono', monospace; }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .result-card { animation: slideIn 0.4s ease-out; transition: all 0.3s cubic-bezier(0.4,0,0.2,1); }
        .result-card:hover { transform: translateY(-4px); box-shadow: 0 20px 40px -10px rgba(0,0,0,0.15); }
        .stat-box { transition: all 0.2s ease; }
        .stat-box:hover { transform: scale(1.03); }
      `}</style>

      <div className="bg-gradient-to-br from-white via-amber-50/30 to-white rounded-2xl shadow-xl p-6 border border-slate-200">

        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-gradient-to-br from-amber-500 to-yellow-600 rounded-lg">
                <Trophy className="h-6 w-6 text-white" />
              </div>
              <h2 className="text-3xl font-bold text-slate-900">Election Results</h2>
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-600">
              <span className="font-semibold metric-number">{stats.totalVotes.toLocaleString()}</span>
              <span>votes</span>
              <span className="text-slate-300">•</span>
              <span className="font-semibold metric-number">{stats.totalPortfolios}</span>
              <span>portfolios</span>
              <span className="text-slate-300">•</span>
              <span className="font-semibold text-amber-600 metric-number">{stats.winners}</span>
              <span>winners</span>
            </div>
          </div>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-5 py-2 bg-white border-2 border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 hover:border-slate-400 transition-all font-semibold shadow-sm"
          >
            <Printer className="h-4 w-4" />
            Print Report
          </button>
        </div>

        {/* Stats */}
        {results.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Total Votes', value: stats.totalVotes.toLocaleString(), icon: BarChart3, color: 'amber' },
              { label: 'Portfolios', value: stats.totalPortfolios, icon: Award, color: 'blue' },
              { label: 'Winners', value: stats.winners, icon: Trophy, color: 'green' },
              { label: 'Avg/Portfolio', value: stats.avgVotesPerPortfolio, icon: Users, color: 'purple' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className={`stat-box p-5 bg-gradient-to-br from-${color}-50 to-${color}-100/50 rounded-xl border-2 border-${color}-200`}>
                <div className="flex items-center justify-between mb-2">
                  <p className={`text-xs font-semibold text-${color}-700 uppercase`}>{label}</p>
                  <Icon className={`h-8 w-8 text-${color}-600`} />
                </div>
                <p className={`text-3xl font-bold text-${color}-900 metric-number`}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {results.map((result, index) => (
            <div
              key={result.portfolio_id}
              className="result-card border-2 border-slate-200 rounded-2xl p-6 bg-white shadow-sm"
              style={{ animationDelay: `${index * 0.08}s` }}
            >
              {/* Portfolio header */}
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-slate-500 flex-shrink-0" />
                  <h3 className="text-lg font-bold text-slate-900 leading-tight">{result.portfolio_name}</h3>
                </div>
                {isSingleCandidate(result) && (
                  <span className="flex-shrink-0 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full border border-blue-200">
                    Endorsement
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
                <TrendingUp className="h-3.5 w-3.5" />
                <span className="font-semibold metric-number">{result.total_votes}</span>
                <span>votes cast</span>
              </div>

              {/* Body — differs by single vs multi */}
              {isSingleCandidate(result)
                ? <SingleCandidateResult result={result} />
                : <MultiCandidateResult result={result} />
              }
            </div>
          ))}
        </div>

        {/* Empty state */}
        {results.length === 0 && (
          <div className="text-center py-20">
            <div className="inline-flex p-5 bg-gradient-to-br from-slate-100 to-slate-200 rounded-2xl mb-5">
              <Trophy className="h-20 w-20 text-slate-400" />
            </div>
            <p className="text-slate-600 text-xl font-semibold mb-2">No results available yet</p>
            <p className="text-slate-500 text-sm">Results will appear here once voting has started</p>
          </div>
        )}
      </div>
    </>
  );
};