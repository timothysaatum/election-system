import { useState } from 'react';
import { votingApi } from '../services/votingApi';
// Added User icon for the Student ID field
import { Shield, ArrowRight, AlertCircle, Info, Lock, User } from 'lucide-react';

const TokenVerification = ({ onVerified }) => {
  const [token, setToken] = useState('');
  const [studentId, setStudentId] = useState(''); // Local state for the unused field
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Notice: studentId is not passed here, so it remains unused logic-wise
      const data = await votingApi.verifyToken(token);
      onVerified(data);
    } catch (err) {
      setError(err.message || 'Failed to verify token. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleTokenChange = (e) => {
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (value.length <= 8) {
      setToken(value);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@700&display=swap');
        
        * {
          font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        
        .token-input {
          font-family: 'JetBrains Mono', monospace;
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
        
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
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
        
        .verify-card {
          animation: slideUp 0.6s ease-out;
        }
        
        .float-icon {
          animation: float 3s ease-in-out infinite;
        }
        
        .pulse-ring {
          animation: pulse-ring 3s ease-in-out infinite;
        }
      `}</style>

      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
        <div className="verify-card bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 border-2 border-slate-200">
          {/* Header with Icon */}
          <div className="text-center mb-8">
            <div className="relative inline-block mb-6">
              <div className="absolute inset-0 bg-blue-500 rounded-full pulse-ring"></div>
              <div className="relative w-20 h-20 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center shadow-xl float-icon">
                <Shield className="w-10 h-10 text-white" />
              </div>
            </div>
            <h1 className="text-4xl font-bold text-slate-900 mb-3">Voter Verification</h1>
            <p className="text-slate-600 text-lg">Enter your details to proceed</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Added Student ID Input (Visual Only) */}
            <div>
              <label htmlFor="studentId" className="block text-sm font-bold text-slate-700 mb-3">
                Student ID
              </label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  type="text"
                  id="studentId"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  placeholder="e.g. STU-12345"
                  className="w-full pl-12 pr-4 py-4 border-2 border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-slate-50"
                  disabled={loading}
                  autoComplete="off"
                />
              </div>
            </div>

            {/* Token Input */}
            <div>
              <label htmlFor="token" className="block text-sm font-bold text-slate-700 mb-3">
                Voting Token
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  type="text"
                  id="token"
                  value={token}
                  onChange={handleTokenChange}
                  placeholder="A13E"
                  className="token-input w-full pl-12 pr-4 py-4 text-center text-3xl tracking-widest border-2 border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all uppercase bg-slate-50"
                  disabled={loading}
                  autoComplete="off"
                  maxLength={4}
                />
              </div>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className={`font-semibold ${token.length === 4 ? 'text-green-600' : 'text-slate-500'}`}>
                  {token.length}/4 characters
                </span>
                {token.length === 4 && (
                  <span className="flex items-center gap-1 text-green-600 font-semibold">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Ready
                  </span>
                )}
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-gradient-to-r from-red-50 to-red-100/50 border-2 border-red-300 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-800 font-medium">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || token.length !== 4}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-4 px-6 rounded-xl font-bold text-lg hover:from-blue-700 hover:to-indigo-700 disabled:from-slate-300 disabled:to-slate-400 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-3 shadow-lg hover:shadow-xl disabled:shadow-none"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <span>Verify Token</span>
                  <ArrowRight className="w-6 h-6" />
                </>
              )}
            </button>
          </form>

          {/* Help Section */}
          <div className="mt-8 pt-6 border-t-2 border-slate-200">
            <div className="flex items-start gap-3 text-sm">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Info className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="font-bold text-slate-900 mb-2">Need help?</p>
                <p className="text-slate-600 leading-relaxed">
                  Your voting token was provided during registration. If you've lost your token, please contact the election administrator.
                </p>
              </div>
            </div>
          </div>

          {/* Security Badge */}
          <div className="mt-6 p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border-2 border-green-200">
            <div className="flex items-center justify-center gap-2 text-sm text-green-800">
              <Shield className="w-4 h-4" />
              <span className="font-semibold">Secure & Encrypted Voting System</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default TokenVerification;