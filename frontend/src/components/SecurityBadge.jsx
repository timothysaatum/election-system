import { Shield, Lock, CheckCircle } from 'lucide-react';

const SecurityBadge = ({ type = 'secure', text, className = '' }) => {
  const configs = {
    encrypted: {
      icon: Lock,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      text: text || 'End-to-end encrypted',
    },
    anonymous: {
      icon: Shield,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      text: text || 'Anonymous voting',
    },
    secure: {
      icon: CheckCircle,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
      text: text || 'Secure connection',
    },
  };

  const config = configs[type] || configs.secure;
  const Icon = config.icon;

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${config.bgColor} ${className}`}>
      <Icon className={`h-4 w-4 ${config.color}`} />
      <span className={`text-sm font-medium ${config.color}`}>{config.text}</span>
    </div>
  );
};

export default SecurityBadge;