import { useState } from "react";
import { Copy, CheckCircle } from "lucide-react";

export const TokenDisplay = ({ token, electorate, onNewGeneration }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Voter Information
        </h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Student ID:</span>
            <span className="ml-2 font-medium">{electorate.student_id}</span>
          </div>
          <div>
            <span className="text-gray-600">Program:</span>
            <span className="ml-2 font-medium">
              {electorate.program || "N/A"}
            </span>
          </div>
          <div>
            <span className="text-gray-600">Phone:</span>
            <span className="ml-2 font-medium">
              {electorate.phone_number || "N/A"}
            </span>
          </div>
          <div>
            <span className="text-gray-600">Email:</span>
            <span className="ml-2 font-medium">
              {electorate.email || "N/A"}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-6 rounded-lg text-white">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium opacity-90">
            Generated Token
          </span>
          {copied && (
            <span className="flex items-center gap-1 text-sm bg-white/20 px-2 py-1 rounded">
              <CheckCircle className="h-4 w-4" />
              Copied!
            </span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <div className="font-mono text-4xl font-bold tracking-wider">
            {token}
          </div>
          <button
            onClick={handleCopy}
            className="ml-4 p-3 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
            title="Copy Token"
          >
            <Copy className="h-6 w-6" />
          </button>
        </div>
        <p className="text-sm opacity-90 mt-4">
          Write this token clearly for the voter
        </p>
      </div>

      <div className="mt-6 flex gap-4">
        <button
          onClick={onNewGeneration}
          className="flex-1 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 font-medium transition-colors"
        >
          Generate Another Token
        </button>
      </div>
    </div>
  );
};
