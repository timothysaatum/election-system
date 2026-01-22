import { BarChart3, Users, TrendingUp } from "lucide-react";

export const StatisticsCards = ({ stats }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600">Total Votes</p>
            <p className="text-3xl font-bold text-gray-900">
              {stats?.voting?.total_votes || 0}
            </p>
          </div>
          <BarChart3 className="h-12 w-12 text-green-500" />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600">Total Voters</p>
            <p className="text-3xl font-bold text-gray-900">
              {stats?.voting?.total_electorates || 0}
            </p>
          </div>
          <Users className="h-12 w-12 text-blue-500" />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600">Voted</p>
            <p className="text-3xl font-bold text-gray-900">
              {stats?.voting?.voted_electorates || 0}
            </p>
          </div>
          <TrendingUp className="h-12 w-12 text-purple-500" />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600">Turnout</p>
            <p className="text-3xl font-bold text-gray-900">
              {stats?.voting?.voting_percentage?.toFixed(1) || 0}%
            </p>
          </div>
          <BarChart3 className="h-12 w-12 text-orange-500" />
        </div>
      </div>
    </div>
  );
};
