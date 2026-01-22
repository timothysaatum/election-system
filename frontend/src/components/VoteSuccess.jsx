import { useEffect, useState } from 'react';

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
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-8">
        {/* Success Icon */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-4 animate-bounce">
            <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Vote Cast Successfully!</h1>
          <p className="text-gray-600">Thank you for participating in the election</p>
        </div>

        {/* Vote Summary */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-700 font-medium">Status:</span>
              <span className="text-green-700 font-bold">{result.message || 'Successful'}</span>
            </div>
            {result.votes_cast && (
              <div className="flex items-center justify-between">
                <span className="text-gray-700 font-medium">Votes Cast:</span>
                <span className="text-gray-900 font-bold">{result.votes_cast}</span>
              </div>
            )}
            {result.failed_votes && result.failed_votes.length > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-gray-700 font-medium">Failed Votes:</span>
                <span className="text-red-700 font-bold">{result.failed_votes.length}</span>
              </div>
            )}
          </div>
        </div>

        {/* Important Information */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-1">Important Notes:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Your vote has been securely recorded</li>
                <li>You cannot vote again in this election</li>
                <li>Your voting session has been closed</li>
                <li>Election results will be announced according to the schedule</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Failed Votes Warning */}
        {result.failed_votes && result.failed_votes.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div className="text-sm text-red-800">
                <p className="font-semibold mb-1">Some votes could not be processed:</p>
                <ul className="list-disc list-inside space-y-1">
                  {result.failed_votes.map((vote, idx) => (
                    <li key={idx}>{vote.reason || 'Unknown error'}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={onClose}
            className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 transition-colors duration-200 flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Return to Home
          </button>

          <div className="text-center text-sm text-gray-600">
            Automatically redirecting in <span className="font-bold text-gray-900">{countdown}</span> seconds...
          </div>
        </div>

        {/* Confirmation Message */}
        <div className="mt-6 pt-6 border-t border-gray-200 text-center">
          <p className="text-sm text-gray-600">
            Thank you for exercising your democratic right!
          </p>
          <p className="text-xs text-gray-500 mt-2">
            Your participation makes a difference
          </p>
        </div>
      </div>
    </div>
  );
};

export default VoteSuccess;