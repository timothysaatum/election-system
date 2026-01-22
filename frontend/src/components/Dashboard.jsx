import { useState } from "react";
import { Users, BarChart3, FileText, UserCheck, Eye } from "lucide-react";
import { TokensModal } from "./TokensModal";

export const Dashboard = ({ stats, electorates = [], onRefresh }) => {
  const [showTokensModal, setShowTokensModal] = useState(false);

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

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Voters</p>
              <p className="text-3xl font-bold text-gray-900">{total}</p>
            </div>
            <Users className="h-12 w-12 text-blue-500" />
          </div>
          <div className="mt-4">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full"
                style={{ width: pct(votingPercentage) }}
              />
            </div>
            <p className="text-sm text-gray-500 mt-2">
              {voted} voted • {nonVoters} not voted • {pct(votingPercentage)} turnout
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Votes</p>
              <p className="text-3xl font-bold text-gray-900">{votes}</p>
            </div>
            <BarChart3 className="h-12 w-12 text-green-500" />
          </div>
          <div className="mt-4">
            <p className="text-sm text-gray-500">Valid votes: {validVotes}</p>
            <p className="text-sm text-gray-500 mt-1">Turnout: {pct(votingPercentage)}</p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Tokens</p>
              <p className="text-3xl font-bold text-gray-900">{activeTokens}</p>
            </div>
            <FileText className="h-12 w-12 text-purple-500" />
          </div>
          <div className="mt-4">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-purple-500 h-2 rounded-full" style={{ width: pct(tokenPercentage) }} />
            </div>
            <p className="text-sm text-gray-500 mt-2">{electoratesWithTokens.length} generated • {pct(tokenPercentage)} of voters</p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Candidates</p>
              <p className="text-3xl font-bold text-gray-900">{stats?.candidates?.active_candidates || 0}</p>
            </div>
            <UserCheck className="h-12 w-12 text-orange-500" />
          </div>
          <p className="text-sm text-gray-500 mt-2">{stats?.candidates?.total_candidates || 0} total</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Stats</h2>
          <div className="grid grid-cols-1 gap-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-blue-600 font-medium">Voting Turnout</p>
                  <p className="text-2xl font-bold text-blue-900">{pct(votingPercentage)}</p>
                </div>
                <div className="text-sm text-gray-500">{voted}/{total} voted</div>
              </div>
            </div>
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="text-sm text-green-600 font-medium">Total Valid Votes</p>
              <p className="text-2xl font-bold text-green-900">{validVotes}</p>
            </div>
            <div className="p-4 bg-purple-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-purple-600 font-medium">Active Tokens</p>
                  <p className="text-2xl font-bold text-purple-900">{activeTokens}</p>
                </div>
                <div className="text-sm text-gray-500">{pct(tokenPercentage)}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Token Management</h2>
          <div className="space-y-4">
            <div className="p-4 bg-indigo-50 rounded-lg">
              <p className="text-sm text-indigo-600 font-medium">Generated Tokens</p>
              <p className="text-3xl font-bold text-indigo-900">{electoratesWithTokens.length}</p>
              <p className="text-sm text-gray-500 mt-2">{activeTokens} active • {pct(tokenPercentage)} coverage</p>
            </div>
            <button
              onClick={() => setShowTokensModal(true)}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-3 rounded-lg hover:bg-indigo-700 font-medium transition-colors"
            >
              <Eye className="h-5 w-5" />
              View All Generated Tokens
            </button>
          </div>
        </div>
      </div>

      {showTokensModal && (
        <TokensModal electorates={electoratesWithTokens} onClose={() => setShowTokensModal(false)} />
      )}
    </div>
  );
};
