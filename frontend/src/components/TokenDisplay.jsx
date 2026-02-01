import { useState } from "react";
import { Copy, CheckCircle, User, Mail, Phone, GraduationCap, Key } from "lucide-react";

export const TokenDisplay = ({ token, electorate, onNewGeneration }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@700&display=swap');
        
        * {
          font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        
        .token-display {
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
        
        @keyframes shimmer {
          0% {
            background-position: -1000px 0;
          }
          100% {
            background-position: 1000px 0;
          }
        }
        
        @keyframes pulse-glow {
          0%, 100% {
            box-shadow: 0 0 20px rgba(99, 102, 241, 0.3);
          }
          50% {
            box-shadow: 0 0 30px rgba(99, 102, 241, 0.5);
          }
        }
        
        .token-card {
          animation: slideInUp 0.5s ease-out;
        }
        
        .token-gradient {
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          position: relative;
          overflow: hidden;
        }
        
        .token-gradient::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
          animation: shimmer 3s infinite;
        }
        
        .token-glow {
          animation: pulse-glow 3s ease-in-out infinite;
        }
        
        .copy-success {
          animation: slideInUp 0.3s ease-out;
        }
      `}</style>

      <div className="token-card bg-gradient-to-br from-white via-indigo-50/30 to-white rounded-2xl shadow-2xl p-8 mb-6 border-2 border-slate-200">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl">
            <Key className="h-8 w-8 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Voter Token Generated</h2>
            <p className="text-sm text-slate-600">Provide this token to the voter</p>
          </div>
        </div>

        {/* Voter Information */}
        <div className="bg-gradient-to-br from-slate-50 to-indigo-50/30 rounded-xl p-6 mb-6 border-2 border-slate-200">
          <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <User className="h-5 w-5 text-indigo-600" />
            Voter Information
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-3 bg-white rounded-lg">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <GraduationCap className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-xs text-slate-600 font-medium">Student ID</p>
                <p className="text-sm font-bold text-slate-900">{electorate.student_id}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-white rounded-lg">
              <div className="p-2 bg-purple-100 rounded-lg">
                <User className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-slate-600 font-medium">Program</p>
                <p className="text-sm font-bold text-slate-900">{electorate.program || "N/A"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-white rounded-lg">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Phone className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-slate-600 font-medium">Phone</p>
                <p className="text-sm font-bold text-slate-900">{electorate.phone_number || "N/A"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-white rounded-lg">
              <div className="p-2 bg-green-100 rounded-lg">
                <Mail className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-slate-600 font-medium">Email</p>
                <p className="text-sm font-bold text-slate-900 truncate">{electorate.email || "N/A"}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Token Display */}
        <div className="token-gradient token-glow p-8 rounded-2xl text-white relative">
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                <span className="text-sm font-semibold uppercase tracking-wider opacity-90">
                  Voting Token
                </span>
              </div>
              {copied && (
                <span className="copy-success flex items-center gap-1.5 text-sm bg-white/20 px-3 py-1.5 rounded-lg backdrop-blur">
                  <CheckCircle className="h-4 w-4" />
                  Copied!
                </span>
              )}
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="token-display text-5xl md:text-6xl font-bold tracking-widest flex-1">
                {token}
              </div>
              <button
                onClick={handleCopy}
                className="flex-shrink-0 p-4 bg-white/20 hover:bg-white/30 rounded-xl transition-all hover:scale-105 backdrop-blur"
                title="Copy Token"
              >
                <Copy className="h-7 w-7" />
              </button>
            </div>
            <div className="mt-6 pt-6 border-t border-white/20">
              <p className="text-sm opacity-90 flex items-center gap-2">
                <span className="inline-block w-2 h-2 bg-white rounded-full"></span>
                Write this token clearly for the voter or copy to clipboard
              </p>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-6 p-5 bg-blue-50 border-2 border-blue-200 rounded-xl">
          <h4 className="font-bold text-blue-900 mb-2 flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            Next Steps
          </h4>
          <ul className="text-sm text-blue-800 space-y-1.5">
            <li className="flex items-start gap-2">
              <span className="text-blue-600 mt-0.5">1.</span>
              <span>Provide this token to the voter securely</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 mt-0.5">2.</span>
              <span>Voter can use this token to access the voting portal</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 mt-0.5">3.</span>
              <span>Token is single-use and will be invalid after voting</span>
            </li>
          </ul>
        </div>

        {/* Action Button */}
        <div className="mt-6">
          <button
            onClick={onNewGeneration}
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 rounded-xl hover:from-indigo-700 hover:to-purple-700 font-semibold transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
          >
            <Key className="h-5 w-5" />
            Generate Another Token
          </button>
        </div>
      </div>
    </>
  );
};