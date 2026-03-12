import { Trophy, Printer, Award, Users, CheckCircle, XCircle, MinusCircle, TrendingUp, BarChart2, Star, Handshake } from 'lucide-react';
import { useMemo, useState, useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const getImageUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return url.startsWith('/') ? url : `/${url}`;
};

const isSingleCandidate = (result) => result.candidates.length === 1;

/**
 * resolveWinner:
 *   - Returns the winner object if the backend sent one (non-null, has votes).
 *   - Returns the string "tie" if multiple candidates share the top endorsed count.
 *   - Returns null if no votes yet or genuinely no winner.
 */
const resolveWinner = (result) => {
  if (result.total_votes === 0) return null;

  // Backend already resolves ties — winner is null on a tie
  if (result.winner && (result.winner.vote_count || 0) > 0) {
    return result.winner;
  }

  // Detect tie: two or more candidates sharing the highest endorsed count
  if (!result.winner && result.candidates.length > 1) {
    const maxVotes = Math.max(...result.candidates.map(c => c.vote_count || 0));
    if (maxVotes > 0) {
      const tied = result.candidates.filter(c => (c.vote_count || 0) === maxVotes);
      if (tied.length > 1) return "tie";
    }
  }

  return null;
};

// ---------------------------------------------------------------------------
// Animated number
// ---------------------------------------------------------------------------
const AnimatedNumber = ({ value, duration = 1200 }) => {
  const [display, setDisplay] = useState(0);
  const start = useRef(null);
  const raf = useRef(null);

  useEffect(() => {
    const target = Number(value) || 0;
    start.current = null;
    const animate = (ts) => {
      if (!start.current) start.current = ts;
      const progress = Math.min((ts - start.current) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * target));
      if (progress < 1) raf.current = requestAnimationFrame(animate);
    };
    raf.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration]);

  return <span>{display.toLocaleString()}</span>;
};

// ---------------------------------------------------------------------------
// Radial progress ring
// ---------------------------------------------------------------------------
const RadialRing = ({ pct, size = 56, stroke = 5, color = '#2563eb' }) => {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 1s cubic-bezier(.4,0,.2,1)' }}
      />
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Single-candidate card
// ---------------------------------------------------------------------------
const SingleCandidateResult = ({ result, rank }) => {
  const candidate = result.candidates[0];
  const endorsed = candidate.vote_count || 0;
  const rejected = candidate.rejected_count || 0;
  const abstained = candidate.abstain_count || 0;

  // Percentages are out of ALL votes cast for this portfolio (incl. abstained)
  const total = result.total_votes || 1;
  const endorsedPct = +((endorsed / total) * 100).toFixed(1);
  const rejectedPct = +((rejected / total) * 100).toFixed(1);
  const abstainedPct = +((abstained / total) * 100).toFixed(1);

  const passed = endorsed > rejected && result.total_votes > 0;
  const hasVotes = result.total_votes > 0;
  const imgUrl = getImageUrl(candidate.picture_url);

  return (
    <div className="ev-card ev-single" style={{ '--delay': `${rank * 80}ms` }}>
      <div className="ev-card-rank">#{rank + 1}</div>

      {/* Portrait */}
      <div className="ev-portrait-wrap">
        {imgUrl
          ? <img src={imgUrl} alt={candidate.name} className="ev-portrait" onError={e => e.target.style.display = 'none'} />
          : <div className="ev-portrait-fallback"><Users size={28} /></div>
        }
        {hasVotes && (
          <div className={`ev-verdict ${passed ? 'ev-verdict--pass' : 'ev-verdict--fail'}`}>
            {passed ? <CheckCircle size={14} /> : <XCircle size={14} />}
            {passed ? 'Endorsed' : 'Rejected'}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="ev-info">
        <p className="ev-portfolio-label">{result.portfolio_name}</p>
        <h3 className="ev-name">{candidate.name}</h3>

        {hasVotes ? (
          <div className="ev-endorse-row">
            <div className="ev-endorse-stat ev-endorse-stat--yes">
              <CheckCircle size={13} />
              <span className="ev-stat-num">{endorsed}</span>
              <span className="ev-stat-pct">{endorsedPct}%</span>
            </div>
            <div className="ev-endorse-divider" />
            <div className="ev-endorse-stat ev-endorse-stat--no">
              <XCircle size={13} />
              <span className="ev-stat-num">{rejected}</span>
              <span className="ev-stat-pct">{rejectedPct}%</span>
            </div>
            <div className="ev-endorse-divider" />
            <div className="ev-endorse-stat ev-endorse-stat--abs">
              <MinusCircle size={13} />
              <span className="ev-stat-num">{abstained}</span>
              <span className="ev-stat-pct">{abstainedPct}%</span>
            </div>
          </div>
        ) : (
          <p className="ev-novotes">No votes recorded yet</p>
        )}

        {/* Stacked progress bar: endorsed | abstained | rejected */}
        {hasVotes && (
          <>
            <div className="ev-bar-track">
              <div className="ev-bar-fill ev-bar-fill--yes" style={{ width: `${endorsedPct}%` }} />
              <div className="ev-bar-fill ev-bar-fill--abs" style={{ width: `${abstainedPct}%` }} />
              <div className="ev-bar-fill ev-bar-fill--no" style={{ width: `${rejectedPct}%` }} />
            </div>
            <div className="ev-bar-legend">
              <span className="ev-bar-legend--yes">✓ Endorsed {endorsedPct}%</span>
              <span className="ev-bar-legend--abs">– Abstained {abstainedPct}%</span>
              <span className="ev-bar-legend--no">✗ Rejected {rejectedPct}%</span>
            </div>
          </>
        )}

        {hasVotes && (
          <div className="ev-total-footer">
            {result.total_votes} total vote{result.total_votes !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Multi-candidate card
// ---------------------------------------------------------------------------
const MultiCandidateResult = ({ result, rank }) => {
  const winnerData = resolveWinner(result);
  const isTie = winnerData === "tie";
  const winner = isTie ? null : winnerData;
  const hasVotes = result.total_votes > 0;
  const maxVotes = Math.max(...result.candidates.map(c => c.vote_count || 0), 1);

  const topVotes = isTie ? Math.max(...result.candidates.map(c => c.vote_count || 0)) : 0;
  const tiedNames = isTie
    ? result.candidates.filter(c => (c.vote_count || 0) === topVotes).map(c => c.name)
    : [];

  return (
    <div className="ev-card ev-multi" style={{ '--delay': `${rank * 80}ms` }}>
      <div className="ev-card-rank">#{rank + 1}</div>

      <div className="ev-multi-header">
        <p className="ev-portfolio-label">{result.portfolio_name}</p>
        <span className="ev-multi-badge">{result.candidates.length} Candidates</span>
      </div>

      {/* Winner banner */}
      {winner && (
        <div className="ev-winner-banner">
          <Trophy size={14} />
          <span>WINNER</span>
          {getImageUrl(winner.picture_url) && (
            <img src={getImageUrl(winner.picture_url)} alt={winner.name} className="ev-winner-thumb"
              onError={e => e.target.style.display = 'none'} />
          )}
          <strong>{winner.name}</strong>
          <span className="ev-winner-votes">
            {winner.vote_count} votes · {((winner.vote_count / result.total_votes) * 100).toFixed(1)}%
          </span>
        </div>
      )}

      {/* Tie banner */}
      {isTie && (
        <div className="ev-tie-banner">
          <Handshake size={14} />
          <span>TIE</span>
          <strong>{tiedNames.join(' & ')}</strong>
          <span className="ev-winner-votes">{topVotes} votes each</span>
        </div>
      )}

      <div className="ev-candidates-list">
        {(() => {
          // Abstained votes are portfolio-level, not per-candidate in multi-candidate races.
          // Compute votes-only total so percentages don't absorb abstentions.
          const totalAbstainedForPortfolio =
            result.total_abstained != null
              ? result.total_abstained
              : result.candidates.reduce((s, c) => s + (c.abstain_count || 0), 0);

          const votesOnlyTotal = (result.total_votes || 0) - totalAbstainedForPortfolio;

          return result.candidates.map((c, i) => {
            const votes = c.vote_count || 0;
            // Use votes-only total as denominator so abstentions don't inflate candidate %
            const pct = votesOnlyTotal > 0 ? +((votes / votesOnlyTotal) * 100).toFixed(1) : 0;
            const barW = (votes / maxVotes) * 100;
            const isWinner = winner && (c.id || c.candidate_id) === (winner.id || winner.candidate_id);
            const isTied = isTie && votes === topVotes;

            return (
              <div key={c.id || i} className={`ev-cand-row ${isWinner ? 'ev-cand-row--winner' : ''} ${isTied ? 'ev-cand-row--tied' : ''}`}>
                <span className="ev-cand-rank">{i + 1}</span>
                {getImageUrl(c.picture_url)
                  ? <img src={getImageUrl(c.picture_url)} alt={c.name} className="ev-cand-thumb"
                    onError={e => e.target.style.display = 'none'} />
                  : <div className="ev-cand-thumb ev-cand-thumb--empty"><Users size={12} /></div>
                }
                <div className="ev-cand-info">
                  <div className="ev-cand-meta">
                    <span className="ev-cand-name">{c.name}</span>
                    <span className={`ev-cand-votes ${isWinner ? 'ev-cand-votes--winner' : ''} ${isTied ? 'ev-cand-votes--tied' : ''}`}>
                      {votes}{votesOnlyTotal > 0 && <span className="ev-cand-pct"> ({pct}%)</span>}
                    </span>
                  </div>
                  <div className="ev-cand-bar-track">
                    <div
                      className={`ev-cand-bar ${isWinner ? 'ev-cand-bar--winner' : ''} ${isTied ? 'ev-cand-bar--tied' : ''}`}
                      style={{ width: `${barW}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          });
        })()}
      </div>

      {/* Abstained row — always shown when there are abstentions */}
      {hasVotes && (() => {
        const totalAbstainedForPortfolio =
          result.total_abstained != null
            ? result.total_abstained
            : result.candidates.reduce((s, c) => s + (c.abstain_count || 0), 0);
        if (totalAbstainedForPortfolio <= 0) return null;
        const abstainPct = result.total_votes > 0
          ? +((totalAbstainedForPortfolio / result.total_votes) * 100).toFixed(1)
          : 0;
        return (
          <div className="ev-cand-row ev-cand-row--abstain">
            <span className="ev-cand-rank">–</span>
            <div className="ev-cand-thumb ev-cand-thumb--empty ev-cand-thumb--abstain">
              <MinusCircle size={14} />
            </div>
            <div className="ev-cand-info">
              <div className="ev-cand-meta">
                <span className="ev-cand-name ev-cand-name--abstain">Abstained</span>
                <span className="ev-cand-votes ev-cand-votes--abstain">
                  {totalAbstainedForPortfolio}
                  <span className="ev-cand-pct"> ({abstainPct}%)</span>
                </span>
              </div>
              <div className="ev-cand-bar-track">
                <div className="ev-cand-bar ev-cand-bar--abstain"
                  style={{ width: `${abstainPct}%` }} />
              </div>
            </div>
          </div>
        );
      })()}

      {!hasVotes && <p className="ev-novotes ev-novotes--center">Awaiting votes…</p>}

      {hasVotes && (
        <div className="ev-multi-footer">
          <span>{result.total_votes} total votes</span>
          {(() => {
            const totalAbstainedForPortfolio =
              result.total_abstained != null
                ? result.total_abstained
                : result.candidates.reduce((s, c) => s + (c.abstain_count || 0), 0);
            const votesOnlyTotal = result.total_votes - totalAbstainedForPortfolio;
            return (
              <>
                <span>{votesOnlyTotal} candidate votes</span>
                {totalAbstainedForPortfolio > 0 && (
                  <span className="ev-multi-footer-abs">
                    <MinusCircle size={10} /> {totalAbstainedForPortfolio} abstained
                  </span>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main ResultsView
// ---------------------------------------------------------------------------
export const ResultsView = ({ results }) => {
  const stats = useMemo(() => {
    const totalVotes = results.reduce((s, r) => s + (r.total_votes || 0), 0);
    const totalAbstained = results.reduce((s, r) => s + (r.total_abstained || 0), 0);
    const winners = results.filter(r => {
      const w = resolveWinner(r);
      return w !== null && w !== "tie";
    }).length;
    const ties = results.filter(r => resolveWinner(r) === "tie").length;
    return { totalVotes, totalAbstained, totalPortfolios: results.length, winners, ties };
  }, [results]);

  const handlePrint = () => {
    const w = window.open('', '', 'height=700,width=1000');
    if (!w) return;
    w.document.write(`<html><head><title>Election Results</title>
    <style>
      body{font-family:Arial,sans-serif;margin:24px;color:#111}
      h1{text-align:center;font-size:28px;margin-bottom:8px}
      .sub{text-align:center;color:#666;margin-bottom:24px}
      .card{border:1px solid #ddd;border-radius:8px;padding:16px;margin-bottom:20px;page-break-inside:avoid}
      .ptitle{font-size:16px;font-weight:700;margin-bottom:8px}
      .winner{background:#fffbeb;border:2px solid #fbbf24;border-radius:6px;padding:8px 12px;margin-bottom:12px;font-weight:600}
      .tie{background:#eff6ff;border:2px solid #93c5fd;border-radius:6px;padding:8px 12px;margin-bottom:12px;font-weight:600;color:#1d4ed8}
      table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #eee;text-align:left}
      th{background:#1e3a8a;color:#fff}
    </style></head><body>
    <h1>Official Election Results</h1>
    <p class="sub">Generated: ${new Date().toLocaleString()} · Total Votes: ${stats.totalVotes} · Portfolios: ${stats.totalPortfolios}</p>
    ${results.map((r, i) => {
      const wData = resolveWinner(r);
      const isTie = wData === "tie";
      const winner = isTie ? null : wData;
      const single = isSingleCandidate(r);
      const topV = isTie ? Math.max(...r.candidates.map(c => c.vote_count || 0)) : 0;
      const tiedStr = isTie
        ? r.candidates.filter(c => (c.vote_count || 0) === topV).map(c => c.name).join(' & ')
        : '';
      return `<div class="card">
        <div class="ptitle">${i + 1}. ${r.portfolio_name} — ${r.total_votes} votes (${r.total_abstained || 0} abstained)</div>
        ${winner ? `<div class="winner">🏆 Winner: ${winner.name} (${winner.vote_count} endorsed votes)</div>` : ''}
        ${isTie ? `<div class="tie">⚖️ Tie: ${tiedStr} — ${topV} votes each</div>` : ''}
        <table><thead><tr><th>Candidate</th>
          ${single
          ? '<th>Endorsed</th><th>Rejected</th><th>Abstained</th>'
          : '<th>Endorsed</th><th>Abstained</th><th>% of Total</th>'}
        </tr></thead>
        <tbody>${r.candidates.map(c => `<tr>
          <td>${c.name}</td>
          ${single
              ? `<td>${c.vote_count || 0}</td><td>${c.rejected_count || 0}</td><td>${c.abstain_count || 0}</td>`
              : `<td>${c.vote_count || 0}</td><td>${c.abstain_count || 0}</td><td>${r.total_votes > 0 ? ((c.vote_count / r.total_votes) * 100).toFixed(1) : 0}%</td>`
            }
        </tr>`).join('')}</tbody></table>
      </div>`;
    }).join('')}
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&family=JetBrains+Mono:wght@500;700&display=swap');

        .ev-root { font-family: 'DM Sans', sans-serif; background: #f0f2f8; min-height: 100%; padding: 32px 24px; }

        .ev-header { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 36px; flex-wrap: wrap; gap: 16px; }
        .ev-eyebrow { display: flex; align-items: center; gap: 8px; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; color: #2563eb; letter-spacing: .12em; text-transform: uppercase; margin-bottom: 8px; }
        .ev-eyebrow-dot { width: 6px; height: 6px; background: #2563eb; border-radius: 50%; animation: ev-blink 1.6s ease-in-out infinite; }
        @keyframes ev-blink { 0%,100%{opacity:1} 50%{opacity:.2} }
        .ev-title { font-family: 'Syne', sans-serif; font-size: clamp(28px, 4vw, 44px); font-weight: 800; color: #0f172a; line-height: 1.1; letter-spacing: -.02em; }
        .ev-subtitle { margin-top: 6px; font-size: 14px; color: #64748b; }
        .ev-print-btn { display: flex; align-items: center; gap: 8px; padding: 10px 20px; background: #fff; border: 2px solid #e2e8f0; border-radius: 12px; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 600; color: #334155; cursor: pointer; transition: all .2s; white-space: nowrap; }
        .ev-print-btn:hover { background: #0f172a; color: #fff; border-color: #0f172a; }

        .ev-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 40px; }
        .ev-stat { background: #fff; border-radius: 16px; padding: 20px 22px; border: 1.5px solid #e2e8f0; display: flex; align-items: center; gap: 16px; transition: transform .2s, box-shadow .2s; }
        .ev-stat:hover { transform: translateY(-3px); box-shadow: 0 12px 32px -6px rgba(0,0,0,.1); }
        .ev-stat-icon { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .ev-stat-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #94a3b8; margin-bottom: 2px; }
        .ev-stat-value { font-family: 'JetBrains Mono', monospace; font-size: 28px; font-weight: 700; color: #0f172a; line-height: 1; }

        .ev-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px; }

        .ev-card { background: #fff; border-radius: 20px; border: 1.5px solid #e2e8f0; padding: 24px; position: relative; overflow: hidden; animation: ev-slideUp .5s ease-out both; animation-delay: var(--delay, 0ms); transition: transform .25s, box-shadow .25s; }
        .ev-card:hover { transform: translateY(-4px); box-shadow: 0 20px 48px -10px rgba(15,23,42,.12); }
        @keyframes ev-slideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        .ev-card-rank { position: absolute; top: 16px; right: 18px; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; color: #cbd5e1; letter-spacing: .05em; }

        /* Single candidate */
        .ev-single { display: flex; flex-direction: column; gap: 16px; }
        .ev-portrait-wrap { position: relative; width: 80px; height: 80px; }
        .ev-portrait { width: 80px; height: 80px; border-radius: 16px; object-fit: cover; object-position: top; border: 2px solid #e2e8f0; }
        .ev-portrait-fallback { width: 80px; height: 80px; border-radius: 16px; background: #f1f5f9; display: flex; align-items: center; justify-content: center; color: #94a3b8; border: 2px solid #e2e8f0; }
        .ev-verdict { position: absolute; bottom: -8px; left: 50%; transform: translateX(-50%); white-space: nowrap; display: flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; border: 1.5px solid; }
        .ev-verdict--pass { background: #f0fdf4; color: #16a34a; border-color: #bbf7d0; }
        .ev-verdict--fail { background: #fef2f2; color: #dc2626; border-color: #fecaca; }
        .ev-portfolio-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: #94a3b8; margin-bottom: 2px; }
        .ev-name { font-family: 'Syne', sans-serif; font-size: 20px; font-weight: 700; color: #0f172a; line-height: 1.2; margin: 0 0 12px; }
        .ev-endorse-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
        .ev-endorse-stat { display: flex; align-items: center; gap: 5px; font-size: 13px; }
        .ev-endorse-stat--yes { color: #16a34a; }
        .ev-endorse-stat--no  { color: #dc2626; }
        .ev-endorse-stat--abs { color: #94a3b8; }
        .ev-stat-num { font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 15px; }
        .ev-stat-pct { font-size: 11px; opacity: .7; }
        .ev-endorse-divider { width: 1px; height: 18px; background: #e2e8f0; }

        /* Stacked bar */
        .ev-bar-track { height: 8px; background: #f1f5f9; border-radius: 99px; display: flex; overflow: hidden; }
        .ev-bar-fill { height: 100%; transition: width 1s cubic-bezier(.4,0,.2,1); }
        .ev-bar-fill--yes { background: linear-gradient(90deg, #22c55e, #16a34a); }
        .ev-bar-fill--abs { background: #cbd5e1; }
        .ev-bar-fill--no  { background: linear-gradient(90deg, #f87171, #dc2626); }
        .ev-bar-legend { display: flex; gap: 10px; margin-top: 5px; flex-wrap: wrap; }
        .ev-bar-legend span { font-size: 10px; font-weight: 600; }
        .ev-bar-legend--yes { color: #16a34a; }
        .ev-bar-legend--abs { color: #94a3b8; }
        .ev-bar-legend--no  { color: #dc2626; }
        .ev-total-footer { font-size: 11px; color: #94a3b8; margin-top: 8px; text-align: right; border-top: 1px solid #f1f5f9; padding-top: 6px; }

        /* Multi candidate */
        .ev-multi { display: flex; flex-direction: column; gap: 12px; }
        .ev-multi-header { display: flex; align-items: center; justify-content: space-between; }
        .ev-multi-badge { font-size: 10px; font-weight: 700; padding: 3px 8px; background: #eff6ff; color: #2563eb; border-radius: 20px; border: 1px solid #bfdbfe; white-space: nowrap; }
        .ev-winner-banner { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: linear-gradient(135deg, #fffbeb, #fef3c7); border: 1.5px solid #fcd34d; border-radius: 12px; font-size: 12px; color: #92400e; flex-wrap: wrap; }
        .ev-winner-banner strong { font-family: 'Syne', sans-serif; font-size: 13px; color: #0f172a; }
        .ev-winner-thumb { width: 24px; height: 24px; border-radius: 6px; object-fit: cover; object-position: top; border: 1.5px solid #fcd34d; }
        .ev-winner-votes { margin-left: auto; font-family: 'JetBrains Mono', monospace; font-size: 11px; }
        .ev-tie-banner { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: linear-gradient(135deg, #eff6ff, #dbeafe); border: 1.5px solid #93c5fd; border-radius: 12px; font-size: 12px; color: #1d4ed8; flex-wrap: wrap; }
        .ev-tie-banner strong { font-family: 'Syne', sans-serif; font-size: 13px; color: #0f172a; }

        .ev-candidates-list { display: flex; flex-direction: column; gap: 8px; }
        .ev-cand-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; border: 1.5px solid transparent; transition: background .2s; }
        .ev-cand-row:hover { background: #f8fafc; }
        .ev-cand-row--winner { background: #fffbeb; border-color: #fde68a; }
        .ev-cand-row--tied   { background: #eff6ff; border-color: #bfdbfe; }
        .ev-cand-rank { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; color: #94a3b8; width: 18px; flex-shrink: 0; }
        .ev-cand-thumb { width: 36px; height: 36px; border-radius: 8px; object-fit: cover; object-position: top; border: 1.5px solid #e2e8f0; flex-shrink: 0; }
        .ev-cand-thumb--empty { display: flex; align-items: center; justify-content: center; background: #f1f5f9; color: #94a3b8; }
        .ev-cand-info { flex: 1; min-width: 0; }
        .ev-cand-meta { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
        .ev-cand-name { font-size: 13px; font-weight: 600; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ev-cand-vote-group { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
        .ev-cand-votes { font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 700; color: #475569; }
        .ev-cand-votes--winner { color: #b45309; }
        .ev-cand-votes--tied   { color: #1d4ed8; }
        .ev-cand-pct { font-size: 10px; font-weight: 500; opacity: .7; }
        .ev-cand-abstain { display: flex; align-items: center; gap: 2px; font-size: 10px; color: #94a3b8; font-family: 'JetBrains Mono', monospace; }
        .ev-cand-row--abstain { background: #f8fafc; border-color: #e2e8f0; border-style: dashed; }
        .ev-cand-thumb--abstain { color: #94a3b8; background: #f1f5f9; }
        .ev-cand-name--abstain { color: #94a3b8; font-style: italic; }
        .ev-cand-votes--abstain { color: #94a3b8; }
        .ev-cand-bar--abstain { background: #cbd5e1; }
        .ev-cand-bar-track { height: 4px; background: #f1f5f9; border-radius: 99px; overflow: hidden; }
        .ev-cand-bar { height: 100%; border-radius: 99px; background: #94a3b8; transition: width 1s cubic-bezier(.4,0,.2,1); }
        .ev-cand-bar--winner { background: linear-gradient(90deg, #f59e0b, #d97706); }
        .ev-cand-bar--tied   { background: linear-gradient(90deg, #60a5fa, #2563eb); }
        .ev-multi-footer { display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 8px; margin-top: 4px; }
        .ev-multi-footer-abs { display: flex; align-items: center; gap: 4px; }

        .ev-novotes { font-size: 12px; color: #94a3b8; font-style: italic; }
        .ev-novotes--center { text-align: center; padding: 12px; background: #f8fafc; border-radius: 8px; }

        .ev-empty { text-align: center; padding: 80px 24px; color: #94a3b8; }
        .ev-empty-icon { width: 72px; height: 72px; background: #f1f5f9; border-radius: 20px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px; }

        @media (max-width: 768px) {
          .ev-stats { grid-template-columns: repeat(2, 1fr); }
          .ev-grid  { grid-template-columns: 1fr; }
        }
        @media (max-width: 480px) {
          .ev-stats { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="ev-root">
        {/* Header */}
        <div className="ev-header">
          <div className="ev-header-left">
            <div className="ev-eyebrow">
              <div className="ev-eyebrow-dot" />
              Live Election Results
            </div>
            <h1 className="ev-title">Official Ballot<br />Results</h1>
            <p className="ev-subtitle">
              {stats.totalVotes.toLocaleString()} total votes across {stats.totalPortfolios} portfolios
              {stats.totalAbstained > 0 && ` · ${stats.totalAbstained.toLocaleString()} abstained`}
            </p>
          </div>
          <button className="ev-print-btn" onClick={handlePrint}>
            <Printer size={15} /> Print Report
          </button>
        </div>

        {/* Stats */}
        <div className="ev-stats">
          {[
            { label: 'Total Votes', value: stats.totalVotes, icon: <BarChart2 size={20} />, bg: '#eff6ff', color: '#2563eb' },
            { label: 'Portfolios', value: stats.totalPortfolios, icon: <Award size={20} />, bg: '#fdf4ff', color: '#9333ea' },
            { label: 'Winners Declared', value: stats.winners, icon: <Trophy size={20} />, bg: '#fffbeb', color: '#d97706' },
            { label: 'Tied Races', value: stats.ties, icon: <Handshake size={20} />, bg: '#eff6ff', color: '#2563eb' },
          ].map(({ label, value, icon, bg, color }) => (
            <div key={label} className="ev-stat">
              <div className="ev-stat-icon" style={{ background: bg, color }}>{icon}</div>
              <div className="ev-stat-body">
                <p className="ev-stat-label">{label}</p>
                <p className="ev-stat-value"><AnimatedNumber value={value} /></p>
              </div>
            </div>
          ))}
        </div>

        {/* Cards grid */}
        {results.length > 0 ? (
          <div className="ev-grid">
            {results.map((result, i) =>
              isSingleCandidate(result)
                ? <SingleCandidateResult key={result.portfolio_id} result={result} rank={i} />
                : <MultiCandidateResult key={result.portfolio_id} result={result} rank={i} />
            )}
          </div>
        ) : (
          <div className="ev-empty">
            <div className="ev-empty-icon"><Trophy size={32} color="#cbd5e1" /></div>
            <p style={{ fontSize: 18, fontWeight: 600, color: '#475569', marginBottom: 6 }}>No results yet</p>
            <p style={{ fontSize: 13 }}>Results will appear here once voting begins</p>
          </div>
        )}
      </div>
    </>
  );
};

export default ResultsView;