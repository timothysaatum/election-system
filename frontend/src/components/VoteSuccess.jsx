import { useEffect, useState } from 'react';
import { CheckCircle, Award, Home, Info, AlertCircle, Sparkles } from 'lucide-react';

const VoteSuccess = ({ result, onClose }) => {
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          onClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onClose]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        
        * {
          font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-20px); }
        }
        
        @keyframes confetti {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(360deg); opacity: 0; }
        }
        
        @keyframes pulse-success {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        
        .success-card {
          animation: slideUp 0.6s ease-out;
        }
        
        .success-icon {
          animation: bounce 1s ease-in-out;
        }
        
        .pulse-badge {
          animation: pulse-success 2s ease-in-out infinite;
        }
        
        .confetti {
          position: fixed;
          width: 10px;
          height: 10px;
          animation: confetti 3s linear;
        }
      `}</style>

      <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 flex items-center justify-center p-4 relative overflow-hidden">
        {/* Confetti Effect */}
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="confetti"
            style={{
              left: `${Math.random() * 100}%`,
              top: `-20px`,
              backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ec4899'][Math.floor(Math.random() * 4)],
              animationDelay: `${Math.random() * 2}s`,
            }}
          />
        ))}

        <div className="success-card bg-white rounded-3xl shadow-2xl max-w-lg w-full p-8 border-2 border-slate-200 relative z-10">
          {/* Success Icon */}
          <div className="text-center mb-6">
            <div className="relative inline-block">
              <div className="absolute inset-0 bg-green-400 rounded-full blur-xl opacity-50"></div>
              <div className="success-icon relative w-24 h-24 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-2xl">
                <CheckCircle className="w-14 h-14 text-white" strokeWidth={3} />
              </div>
            </div>
            <div className="mt-6">
              <h1 className="text-4xl font-bold text-slate-900 mb-3 flex items-center justify-center gap-2">
                <Sparkles className="w-8 h-8 text-yellow-500" />
                Vote Cast Successfully!
                <Sparkles className="w-8 h-8 text-yellow-500" />
              </h1>
              <p className="text-slate-600 text-lg">Thank you for participating in the election</p>
            </div>
          </div>

          {/* Vote Summary */}
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-300 rounded-2xl p-6 mb-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-white rounded-xl">
                <span className="text-slate-700 font-semibold flex items-center gap-2">
                  <Award className="w-5 h-5 text-green-600" />
                  Status
                </span>
                <span className="text-green-700 font-bold pulse-badge">
                  {result.message || 'Successful'}
                </span>
              </div>
              {result.votes_cast && (
                <div className="flex items-center justify-between p-3 bg-white rounded-xl">
                  <span className="text-slate-700 font-semibold flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-blue-600" />
                    Votes Cast
                  </span>
                  <span className="text-slate-900 font-bold">{result.votes_cast}</span>
                </div>
              )}
              {result.failed_votes && result.failed_votes.length > 0 && (
                <div className="flex items-center justify-between p-3 bg-white rounded-xl">
                  <span className="text-slate-700 font-semibold flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-red-600" />
                    Failed Votes
                  </span>
                  <span className="text-red-700 font-bold">{result.failed_votes.length}</span>
                </div>
              )}
            </div>
          </div>

          {/* Important Information */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-2xl p-5 mb-6">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-200 rounded-lg">
                <Info className="w-5 h-5 text-blue-700" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-blue-900 mb-3">Important Notes</p>
                <ul className="space-y-2 text-sm text-blue-800">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-600" />
                    <span>Your vote has been securely recorded</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-600" />
                    <span>You cannot vote again in this election</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-600" />
                    <span>Your voting session has been closed</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-600" />
                    <span>Results will be announced according to schedule</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Failed Votes Warning */}
          {result.failed_votes && result.failed_votes.length > 0 && (
            <div className="bg-gradient-to-r from-red-50 to-orange-50 border-2 border-red-300 rounded-2xl p-5 mb-6">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-red-200 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-700" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-red-900 mb-3">Some votes could not be processed</p>
                  <ul className="space-y-2 text-sm text-red-800">
                    {result.failed_votes.map((vote, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-red-600 mt-0.5">•</span>
                        <span>{vote.reason || 'Unknown error'}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-4">
            <button
              onClick={onClose}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-4 px-6 rounded-xl font-bold text-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-3"
            >
              <Home className="w-6 h-6" />
              Return to Home
            </button>

            <div className="text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-full">
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
                <span className="text-sm text-slate-600">
                  Redirecting in <span className="font-bold text-slate-900">{countdown}s</span>
                </span>
              </div>
            </div>
          </div>

          {/* Confirmation Message */}
          <div className="mt-8 pt-6 border-t-2 border-slate-200 text-center">
            <p className="text-slate-700 font-semibold mb-2">
              Thank you for exercising your democratic right!
            </p>
            <p className="text-sm text-slate-500">
              Your participation makes a difference
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default VoteSuccess;