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
      handleSessionTimeout();
    }
  }, [sessionTime, step]);

  const handleVerified = (data) => {
    login(data);
    setStep('vote');
  };

  const handleVoteComplete = (result) => {
    setVoteResult(result);
    setStep('success');
    logout(); // Clear session after successful vote
  };

  const handleSessionTimeout = () => {
    logout();
    setStep('verify');
    alert('Your session has expired. Please verify your token again.');
  };

  const handleClose = () => {
    logout();
    window.location.href = '/'; // Redirect to home or thank you page
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
      
      {step === 'success' && voteResult && (
        <VoteSuccess result={voteResult} onClose={handleClose} />
      )}
    </>
  );
};

export default VotingPage;