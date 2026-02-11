import { useState, useEffect } from 'react';
import TokenVerification from '../components/TokenVerification';
import VotingBallot from '../components/VotingBallot';
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
      handleSessionTimeout();
    }
  }, [sessionTime, step]);

  const handleVerified = (data) => {
    login(data);
    setStep('vote');
  };

  const handleVoteComplete = (result) => {
    setVoteResult(result);
    logout(); // Clear session after successful vote

    // Show success message
    alert('Your vote has been submitted successfully! Thank you for voting.');

    // Reset to verification page
    setStep('verify');
  };

  const handleSessionTimeout = () => {
    logout();
    setStep('verify');
    alert('Your session has expired. Please verify your token again.');
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
        />
      )}
    </>
  );
};

export default VotingPage;