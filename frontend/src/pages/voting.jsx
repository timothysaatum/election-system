import { useState, useEffect } from 'react';
import TokenVerification from '../components/TokenVerification';
import VotingBallot from '../components/VotingBallot';
import VoteSuccess from '../components/VoteSuccess';
import { useVotingSession } from '../hooks/useVotingSession';
import LoadingSpinner from '../components/shared/LoadingSpinner';

const VotingPage = () => {
  const [step, setStep] = useState('verify'); // verify, vote, success
  const [voteResult, setVoteResult] = useState(null);

  const {
    isAuthenticated,
    voterData,
    sessionTime,
    loading: sessionLoading,
    login,
    logout
  } = useVotingSession();

  // Auto-navigate to ballot if already authenticated
  useEffect(() => {
    if (isAuthenticated && voterData && step === 'verify') {
      setStep('vote');
    }
  }, [isAuthenticated, voterData, step]);

  // Handle session timeout
  useEffect(() => {
    if (sessionTime === 0 && step === 'vote') {
      handleSessionEnd();
      alert('Your session has expired. Please verify your token again.');
    }
  }, [sessionTime, step]);

  const handleVerified = (data) => {
    login(data);
    setStep('vote');
  };

  const handleVoteComplete = (result) => {
    setVoteResult(result);
    logout(); // Clear session after successful vote
    setStep('success'); // Show success screen instead of alert
  };

  const handleSuccessClose = () => {
    // Reset to verification page for next voter
    setVoteResult(null);
    setStep('verify');
  };

  const handleSessionEnd = () => {
    // Handle session end (already voted, timeout, etc.)
    logout();
    setStep('verify');
  };

  // Show loading while checking session
  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner message="Checking session..." />
      </div>
    );
  }

  return (
    <>
      {step === 'verify' && (
        <TokenVerification onVerified={handleVerified} />
      )}

      {step === 'vote' && voterData && (
        <VotingBallot
          voterData={voterData}
          onVoteComplete={handleVoteComplete}
          sessionTime={sessionTime}
          onSessionEnd={handleSessionEnd}
        />
      )}

      {step === 'success' && voteResult && (
        <VoteSuccess
          result={voteResult}
          onClose={handleSuccessClose}
        />
      )}
    </>
  );
};

export default VotingPage;