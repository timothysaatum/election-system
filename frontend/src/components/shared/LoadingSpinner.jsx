
const LoadingSpinner = ({ message = 'Loading...', size = 'md' }) => {
  const sizes = {
    sm: 'h-8 w-8',
    md: 'h-12 w-12',
    lg: 'h-16 w-16',
  };

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <div className={`animate-spin rounded-full border-b-2 border-blue-600 ${sizes[size]}`}></div>
      {message && <p className="text-gray-600">{message}</p>}
    </div>
  );
};

export default LoadingSpinner;