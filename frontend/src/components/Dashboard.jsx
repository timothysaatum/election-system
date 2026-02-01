import { useState } from "react";
import { Users, BarChart3, FileText, UserCheck, Eye, TrendingUp, RefreshCw, ChevronRight } from "lucide-react";
import { TokensModal } from "./TokensModal";

export const Dashboard = ({ stats, electorates = [], onRefresh }) => {
  const [showTokensModal, setShowTokensModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const total = stats?.voting?.total_electorates || electorates.length || 0;
  const voted = stats?.voting?.voted_electorates || 0;
  const votes = stats?.voting?.total_votes || 0;
  const validVotes = stats?.voting?.valid_votes ?? votes;
  const votingPercentage = Number(stats?.voting?.voting_percentage) || (total ? (voted / total) * 100 : 0);
  const electoratesWithTokens = electorates.filter((e) => e.voting_token);
  const activeTokens = stats?.tokens?.active_tokens ?? electoratesWithTokens.length;
  const tokenPercentage = total ? Math.round((activeTokens / total) * 100) : 0;
  const nonVoters = Math.max(total - voted, 0);

  const pct = (n) => `${Math.min(Math.max(Math.round(n), 0), 100)}%`;

  const handleRefresh = async () => {
    if (onRefresh) {
      setRefreshing(true);
      await onRefresh();
      setTimeout(() => setRefreshing(false), 500);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap');
        
        * {
          font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        
        .metric-number {
          font-family: 'JetBrains Mono', monospace;
        }
        
        @keyframes slideInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes pulse-ring {
          0%, 100% {
            opacity: 0.3;
            transform: scale(1);
          }
          50% {
            opacity: 0.1;
            transform: scale(1.1);
          }
        }
        
        @keyframes shimmer {
          0% {
            background-position: -1000px 0;
          }
          100% {
            background-position: 1000px 0;
          }
        }
        
        .animate-slide-in {
          animation: slideInUp 0.6s ease-out forwards;
        }
        
        .stat-card {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
        }
        
        .stat-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
          transition: left 0.5s;
        }
        
        .stat-card:hover::before {
          left: 100%;
        }
        
        .stat-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 20px 40px -10px rgba(0,0,0,0.15);
        }
        
        .progress-bar {
          transition: width 1s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
        }
        
        .progress-bar::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
          animation: shimmer 2s infinite;
        }
        
        .icon-wrapper {
          position: relative;
        }
        
        .icon-wrapper::before {
          content: '';
          position: absolute;
          inset: -8px;
          border-radius: 50%;
          background: currentColor;
          opacity: 0.1;
          animation: pulse-ring 3s ease-in-out infinite;
        }
        
        .glass-card {
          background: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.3);
        }
        
        .refresh-btn {
          transition: all 0.3s ease;
        }
        
        .refresh-btn:active {
          transform: scale(0.95);
        }
        
        .refresh-btn.refreshing {
          animation: spin 1s linear;
        }
        
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-2">Election Dashboard</h1>
            <p className="text-slate-600 text-lg">Real-time monitoring and analytics</p>
          </div>
          <button
            onClick={handleRefresh}
            className={`refresh-btn flex items-center gap-2 px-4 py-2 bg-white rounded-xl shadow-sm hover:shadow-md border border-slate-200 text-slate-700 font-medium ${refreshing ? 'refreshing' : ''}`}
            disabled={refreshing}
          >
            <RefreshCw className="h-4 w-4" />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="stat-card glass-card rounded-2xl shadow-lg p-6 animate-slide-in" style={{ animationDelay: '0.1s' }}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-slate-600 mb-1">Total Voters</p>
                <p className="text-4xl font-bold text-slate-900 metric-number">{total.toLocaleString()}</p>
              </div>
              <div className="icon-wrapper">
                <Users className="h-10 w-10 text-blue-600" />
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-700">Turnout Progress</span>
                <span className="text-xs font-bold text-blue-600">{pct(votingPercentage)}</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                <div
                  className="progress-bar bg-gradient-to-r from-blue-500 to-blue-600 h-2.5 rounded-full"
                  style={{ width: pct(votingPercentage) }}
                />
              </div>
              <div className="flex items-center justify-between mt-3 text-xs">
                <span className="text-slate-600">
                  <span className="font-semibold text-green-600">{voted.toLocaleString()}</span> voted
                </span>
                <span className="text-slate-600">
                  <span className="font-semibold text-slate-700">{nonVoters.toLocaleString()}</span> pending
                </span>
              </div>
            </div>
          </div>

          <div className="stat-card glass-card rounded-2xl shadow-lg p-6 animate-slide-in" style={{ animationDelay: '0.2s' }}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-slate-600 mb-1">Total Votes</p>
                <p className="text-4xl font-bold text-slate-900 metric-number">{votes.toLocaleString()}</p>
              </div>
              <div className="icon-wrapper">
                <BarChart3 className="h-10 w-10 text-green-600" />
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between p-2 bg-green-50 rounded-lg">
                <span className="text-xs font-medium text-green-700">Valid Votes</span>
                <span className="text-sm font-bold text-green-900 metric-number">{validVotes.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                <span className="text-xs font-medium text-slate-700">Participation</span>
                <span className="text-sm font-bold text-slate-900">{pct(votingPercentage)}</span>
              </div>
            </div>
          </div>

          <div className="stat-card glass-card rounded-2xl shadow-lg p-6 animate-slide-in" style={{ animationDelay: '0.3s' }}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-slate-600 mb-1">Active Tokens</p>
                <p className="text-4xl font-bold text-slate-900 metric-number">{activeTokens.toLocaleString()}</p>
              </div>
              <div className="icon-wrapper">
                <FileText className="h-10 w-10 text-purple-600" />
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-700">Token Coverage</span>
                <span className="text-xs font-bold text-purple-600">{pct(tokenPercentage)}</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                <div
                  className="progress-bar bg-gradient-to-r from-purple-500 to-purple-600 h-2.5 rounded-full"
                  style={{ width: pct(tokenPercentage) }}
                />
              </div>
              <p className="text-xs text-slate-600 mt-3">
                <span className="font-semibold text-purple-700">{electoratesWithTokens.length.toLocaleString()}</span> tokens generated
              </p>
            </div>
          </div>

          <div className="stat-card glass-card rounded-2xl shadow-lg p-6 animate-slide-in" style={{ animationDelay: '0.4s' }}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-slate-600 mb-1">Candidates</p>
                <p className="text-4xl font-bold text-slate-900 metric-number">{stats?.candidates?.active_candidates || 0}</p>
              </div>
              <div className="icon-wrapper">
                <UserCheck className="h-10 w-10 text-orange-600" />
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-center gap-2 p-3 bg-orange-50 rounded-lg">
                <TrendingUp className="h-4 w-4 text-orange-600" />
                <div className="flex-1">
                  <p className="text-xs font-medium text-orange-700">Active Candidates</p>
                  <p className="text-lg font-bold text-orange-900 metric-number">{stats?.candidates?.active_candidates || 0}</p>
                </div>
              </div>
              <p className="text-xs text-slate-600 mt-3">
                Total: <span className="font-semibold">{stats?.candidates?.total_candidates || 0}</span> candidates
              </p>
            </div>
          </div>
        </div>

        {/* Detailed Analytics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Voting Analytics */}
          <div className="glass-card rounded-2xl shadow-lg p-6 animate-slide-in" style={{ animationDelay: '0.5s' }}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-900">Voting Analytics</h2>
              <div className="h-1 flex-1 mx-4 bg-gradient-to-r from-slate-200 via-blue-200 to-slate-200 rounded-full"></div>
            </div>
            <div className="space-y-4">
              <div className="group p-5 bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl hover:shadow-md transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                    <p className="text-sm font-semibold text-blue-900">Voter Turnout</p>
                  </div>
                  <p className="text-3xl font-bold text-blue-900 metric-number">{pct(votingPercentage)}</p>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-blue-700">{voted.toLocaleString()} of {total.toLocaleString()} voted</span>
                  <ChevronRight className="h-4 w-4 text-blue-600 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>

              <div className="group p-5 bg-gradient-to-br from-green-50 to-green-100/50 rounded-xl hover:shadow-md transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-green-600 rounded-full"></div>
                    <p className="text-sm font-semibold text-green-900">Valid Votes Cast</p>
                  </div>
                  <p className="text-3xl font-bold text-green-900 metric-number">{validVotes.toLocaleString()}</p>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-green-700">Verified and counted</span>
                  <ChevronRight className="h-4 w-4 text-green-600 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>

              <div className="group p-5 bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-xl hover:shadow-md transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-slate-600 rounded-full"></div>
                    <p className="text-sm font-semibold text-slate-900">Pending Voters</p>
                  </div>
                  <p className="text-3xl font-bold text-slate-900 metric-number">{nonVoters.toLocaleString()}</p>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-700">Yet to cast their vote</span>
                  <ChevronRight className="h-4 w-4 text-slate-600 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          </div>

          {/* Token Management */}
          <div className="glass-card rounded-2xl shadow-lg p-6 animate-slide-in" style={{ animationDelay: '0.6s' }}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-900">Token Management</h2>
              <div className="h-1 flex-1 mx-4 bg-gradient-to-r from-slate-200 via-purple-200 to-slate-200 rounded-full"></div>
            </div>
            <div className="space-y-4">
              <div className="p-6 bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl border border-purple-100">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-medium text-purple-700 mb-1">Generated Tokens</p>
                    <p className="text-4xl font-bold text-purple-900 metric-number">{electoratesWithTokens.length.toLocaleString()}</p>
                  </div>
                  <div className="icon-wrapper">
                    <FileText className="h-12 w-12 text-purple-600" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div className="bg-white/70 backdrop-blur p-3 rounded-lg">
                    <p className="text-xs text-purple-700 font-medium mb-1">Active</p>
                    <p className="text-xl font-bold text-purple-900 metric-number">{activeTokens.toLocaleString()}</p>
                  </div>
                  <div className="bg-white/70 backdrop-blur p-3 rounded-lg">
                    <p className="text-xs text-purple-700 font-medium mb-1">Coverage</p>
                    <p className="text-xl font-bold text-purple-900">{pct(tokenPercentage)}</p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowTokensModal(true)}
                className="group w-full flex items-center justify-between gap-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-4 rounded-xl hover:from-indigo-700 hover:to-purple-700 font-semibold transition-all shadow-lg hover:shadow-xl"
              >
                <div className="flex items-center gap-3">
                  <Eye className="h-5 w-5" />
                  <span>View All Generated Tokens</span>
                </div>
                <ChevronRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </button>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <p className="text-xs text-slate-600 text-center">
                  Tokens are securely generated and managed for each registered voter
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showTokensModal && (
        <TokensModal electorates={electoratesWithTokens} onClose={() => setShowTokensModal(false)} />
      )}
    </div>
  );
};