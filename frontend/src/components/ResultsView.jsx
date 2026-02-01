import { Trophy, TrendingUp, Printer, Award, BarChart3, Users } from 'lucide-react';
import { useMemo, useState, useRef } from 'react';

export const ResultsView = ({ results }) => {
  const [selectedPortfolio, setSelectedPortfolio] = useState(null);
  const printRef = useRef();

  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=600,width=900');

    const htmlContent = `
      <html>
        <head>
          <title>Election Results - Print</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { text-align: center; color: #333; margin-bottom: 20px; }
            .summary { margin-bottom: 30px; padding: 15px; background-color: #f5f5f5; border-radius: 5px; }
            .portfolio-section { page-break-inside: avoid; margin-bottom: 30px; border: 1px solid #ddd; padding: 15px; border-radius: 5px; }
            .portfolio-title { font-size: 18px; font-weight: bold; color: #333; margin-bottom: 10px; }
            .winner-section { background-color: #fff8e1; border: 2px solid #ffd600; padding: 15px; border-radius: 5px; margin-bottom: 15px; }
            .winner-badge { color: #f57f17; font-weight: bold; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background-color: #0066cc; color: white; font-weight: bold; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .vote-percentage { font-weight: bold; color: #0066cc; }
            @media print {
              body { margin: 10px; }
              .portfolio-section { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <h1>Election Results Report</h1>
          <div class="summary">
            <p><strong>Total Votes:</strong> ${stats.totalVotes}</p>
            <p><strong>Total Portfolios:</strong> ${stats.totalPortfolios}</p>
            <p><strong>Winners Determined:</strong> ${stats.winners}</p>
            <p><strong>Average Votes per Portfolio:</strong> ${stats.avgVotesPerPortfolio}</p>
            <p><strong>Generated on:</strong> ${new Date().toLocaleString()}</p>
          </div>
          ${results.map((result, idx) => `
            <div class="portfolio-section">
              <div class="portfolio-title">${idx + 1}. ${result.portfolio_name}</div>
              <p><strong>Total Votes:</strong> ${result.total_votes}</p>
              
              ${result.winner ? `
                <div class="winner-section">
                  <div class="winner-badge">🏆 WINNER</div>
                  <p><strong>${result.winner.name}</strong></p>
                  <p>Votes: ${result.winner.vote_count} (${result.total_votes > 0 ? ((result.winner.vote_count / result.total_votes) * 100).toFixed(1) : 0}%)</p>
                </div>
              ` : ''}
              
              <table>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Candidate Name</th>
                    <th>Votes</th>
                    <th>Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  ${result.candidates.map((c, i) => `
                    <tr>
                      <td>#${i + 1}</td>
                      <td>${c.name}</td>
                      <td>${c.vote_count}</td>
                      <td class="vote-percentage">${result.total_votes > 0 ? ((c.vote_count / result.total_votes) * 100).toFixed(1) : 0}%</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `).join('')}
        </body>
      </html>
    `;

    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      setTimeout(() => printWindow.print(), 250);
    }
  };

  const getImageUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    const cleanUrl = url.startsWith('/') ? url : `/${url}`;
    return cleanUrl;
  };

  const stats = useMemo(() => {
    const totalVotes = results.reduce((sum, r) => sum + r.total_votes, 0);
    const totalPortfolios = results.length;
    const winnerData = results.map(r => r.winner).filter(Boolean);
    return {
      totalVotes,
      totalPortfolios,
      winners: winnerData.length,
      avgVotesPerPortfolio: totalPortfolios ? Math.round(totalVotes / totalPortfolios) : 0,
    };
  }, [results]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap');
        
        * {
          font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        
        .metric-number {
          font-family: 'JetBrains Mono', monospace;
        }
        
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes trophy-shine {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 0.4; }
        }
        
        .result-card {
          animation: slideIn 0.4s ease-out;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .result-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 20px 40px -10px rgba(0,0,0,0.15);
        }
        
        .trophy-bg {
          animation: trophy-shine 3s ease-in-out infinite;
        }
        
        .stat-box {
          transition: all 0.2s ease;
        }
        
        .stat-box:hover {
          transform: scale(1.03);
        }
        
        .progress-segment {
          transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
        }
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
            title="Print Results"
          >
            <Printer className="h-4 w-4" />
            Print Report
          </button>
        </div>

        {/* Stats Grid */}
        {results.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="stat-box p-5 bg-gradient-to-br from-amber-50 to-yellow-100/50 rounded-xl border-2 border-amber-200">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-amber-700 uppercase">Total Votes</p>
                <BarChart3 className="h-8 w-8 text-amber-600" />
              </div>
              <p className="text-3xl font-bold text-amber-900 metric-number">{stats.totalVotes.toLocaleString()}</p>
            </div>
            <div className="stat-box p-5 bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl border-2 border-blue-200">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-blue-700 uppercase">Portfolios</p>
                <Award className="h-8 w-8 text-blue-600" />
              </div>
              <p className="text-3xl font-bold text-blue-900 metric-number">{stats.totalPortfolios}</p>
            </div>
            <div className="stat-box p-5 bg-gradient-to-br from-green-50 to-green-100/50 rounded-xl border-2 border-green-200">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-green-700 uppercase">Winners</p>
                <Trophy className="h-8 w-8 text-green-600" />
              </div>
              <p className="text-3xl font-bold text-green-900 metric-number">{stats.winners}</p>
            </div>
            <div className="stat-box p-5 bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-xl border-2 border-purple-200">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-purple-700 uppercase">Avg/Portfolio</p>
                <Users className="h-8 w-8 text-purple-600" />
              </div>
              <p className="text-3xl font-bold text-purple-900 metric-number">{stats.avgVotesPerPortfolio}</p>
            </div>
          </div>
        )}

        {/* Results Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {results.map((result, index) => (
            <div
              key={result.portfolio_id}
              className="result-card border-2 border-slate-200 rounded-2xl p-6 bg-white shadow-sm cursor-pointer"
              style={{ animationDelay: `${index * 0.1}s` }}
              onClick={() => setSelectedPortfolio(selectedPortfolio === result.portfolio_id ? null : result.portfolio_id)}
            >
              {/* Portfolio Header */}
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-2">
                  <Award className="h-5 w-5 text-slate-600" />
                  <h3 className="text-xl font-bold text-slate-900">{result.portfolio_name}</h3>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 px-3 py-2 rounded-lg inline-flex">
                  <TrendingUp className="h-4 w-4" />
                  <span className="font-semibold metric-number">{result.total_votes}</span>
                  <span>Total Votes</span>
                </div>
              </div>

              {/* Winner Section */}
              {result.winner && (
                <div className="bg-gradient-to-br from-amber-50 via-yellow-50 to-amber-50 border-2 border-amber-300 rounded-xl p-5 mb-5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 -mt-4 -mr-4">
                    <Trophy className="h-24 w-24 text-amber-400 trophy-bg" />
                  </div>
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-3">
                      <Trophy className="h-5 w-5 text-amber-600" />
                      <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">Winner</p>
                    </div>
                    <div className="flex items-center gap-4">
                      {result.winner.picture_url ? (
                        <img
                          src={getImageUrl(result.winner.picture_url)}
                          alt={result.winner.name}
                          className="h-16 w-16 rounded-2xl object-cover border-4 border-white shadow-lg flex-shrink-0"
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-200 to-amber-300 flex items-center justify-center border-4 border-white shadow-lg flex-shrink-0">
                          <Trophy className="h-8 w-8 text-amber-700" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-lg text-slate-900 truncate">{result.winner.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-sm font-bold text-amber-700 metric-number">{result.winner.vote_count}</span>
                          <span className="text-sm text-slate-600">votes</span>
                          <span className="text-xs text-slate-500">
                            ({result.total_votes > 0 ? ((result.winner.vote_count / result.total_votes) * 100).toFixed(1) : 0}%)
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* All Candidates */}
              <div className="space-y-2.5">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">All Candidates</p>
                {result.candidates.map((candidate, index) => {
                  const isWinner = result.winner && candidate.id === result.winner.id;
                  const percentage = result.total_votes > 0 ? ((candidate.vote_count / result.total_votes) * 100).toFixed(1) : 0;

                  return (
                    <div
                      key={candidate.id}
                      className={`flex items-center justify-between p-3.5 rounded-xl transition-all ${isWinner
                          ? 'bg-gradient-to-r from-amber-50 to-yellow-50 border-2 border-amber-200'
                          : 'bg-slate-50 hover:bg-slate-100 border-2 border-transparent'
                        }`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span className={`text-sm font-bold flex-shrink-0 w-6 ${isWinner ? 'text-amber-600' : 'text-slate-400'
                          }`}>
                          #{index + 1}
                        </span>
                        {candidate.picture_url ? (
                          <img
                            src={getImageUrl(candidate.picture_url)}
                            alt={candidate.name}
                            className={`h-10 w-10 rounded-xl object-cover flex-shrink-0 border-2 ${isWinner ? 'border-amber-300' : 'border-slate-200'
                              }`}
                            onError={(e) => {
                              e.target.style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isWinner ? 'bg-amber-100 border-2 border-amber-300' : 'bg-slate-200'
                            }`}>
                            <Users className={`h-5 w-5 ${isWinner ? 'text-amber-600' : 'text-slate-400'}`} />
                          </div>
                        )}
                        <span className={`font-semibold truncate text-sm ${isWinner ? 'text-slate-900' : 'text-slate-700'
                          }`}>
                          {candidate.name}
                        </span>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <p className={`text-lg font-bold metric-number ${isWinner ? 'text-amber-700' : 'text-slate-900'
                          }`}>
                          {candidate.vote_count}
                        </p>
                        <p className="text-xs text-slate-500 metric-number">{percentage}%</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Progress Bar */}
              {result.total_votes > 0 && (
                <div className="mt-5 pt-5 border-t-2 border-slate-100">
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-3">Vote Distribution</p>
                  <div className="flex h-3 rounded-full overflow-hidden bg-slate-200 shadow-inner">
                    {result.candidates.map((candidate, index) => {
                      const percentage = (candidate.vote_count / result.total_votes) * 100;
                      const colors = [
                        'bg-gradient-to-r from-blue-500 to-blue-600',
                        'bg-gradient-to-r from-green-500 to-green-600',
                        'bg-gradient-to-r from-purple-500 to-purple-600',
                        'bg-gradient-to-r from-orange-500 to-orange-600',
                        'bg-gradient-to-r from-pink-500 to-pink-600',
                        'bg-gradient-to-r from-indigo-500 to-indigo-600',
                      ];
                      return (
                        <div
                          key={candidate.id}
                          className={`progress-segment ${colors[index % colors.length]}`}
                          style={{ width: `${percentage}%` }}
                          title={`${candidate.name}: ${percentage.toFixed(1)}%`}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Empty State */}
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