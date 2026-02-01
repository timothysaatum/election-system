// import { AlertCircle, CheckCircle, X, AlertTriangle } from 'lucide-react';

// export const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message, type = 'warning' }) => {
//   if (!isOpen) return null;

//   const icons = {
//     warning: <AlertTriangle className="h-12 w-12 text-yellow-500" />,
//     danger: <AlertCircle className="h-12 w-12 text-red-500" />,
//     info: <CheckCircle className="h-12 w-12 text-blue-500" />,
//   };

//   const buttonColors = {
//     warning: 'bg-yellow-600 hover:bg-yellow-700',
//     danger: 'bg-red-600 hover:bg-red-700',
//     info: 'bg-blue-600 hover:bg-blue-700',
//   };

//   return (
//     <div className="fixed inset-0 z-50 overflow-y-auto">
//       {/* Backdrop */}
//       <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={onClose}></div>

//       {/* Modal */}
//       <div className="flex items-center justify-center min-h-screen p-4">
//         <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6 z-50">
//           {/* Close button */}
//           <button
//             onClick={onClose}
//             className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
//           >
//             <X className="h-5 w-5" />
//           </button>

//           {/* Icon */}
//           <div className="flex justify-center mb-4">
//             {icons[type]}
//           </div>

//           {/* Title */}
//           <h3 className="text-xl font-bold text-gray-900 text-center mb-2">
//             {title}
//           </h3>

//           {/* Message */}
//           <p className="text-gray-600 text-center mb-6">
//             {message}
//           </p>

//           {/* Actions */}
//           <div className="flex gap-3">
//             <button
//               onClick={onClose}
//               className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
//             >
//               Cancel
//             </button>
//             <button
//               onClick={() => {
//                 onConfirm();
//                 onClose();
//               }}
//               className={`flex-1 px-4 py-2 rounded-lg text-white transition-colors ${buttonColors[type]}`}
//             >
//               Confirm
//             </button>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// };

// export const AlertModal = ({ isOpen, onClose, title, message, type = 'error' }) => {
//   if (!isOpen) return null;

//   const icons = {
//     error: <AlertCircle className="h-12 w-12 text-red-500" />,
//     success: <CheckCircle className="h-12 w-12 text-green-500" />,
//     info: <CheckCircle className="h-12 w-12 text-blue-500" />,
//   };

//   return (
//     <div className="fixed inset-0 z-50 overflow-y-auto">
//       {/* Backdrop */}
//       <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={onClose}></div>

//       {/* Modal */}
//       <div className="flex items-center justify-center min-h-screen p-4">
//         <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6 z-50">
//           {/* Close button */}
//           <button
//             onClick={onClose}
//             className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
//           >
//             <X className="h-5 w-5" />
//           </button>

//           {/* Icon */}
//           <div className="flex justify-center mb-4">
//             {icons[type]}
//           </div>

//           {/* Title */}
//           <h3 className="text-xl font-bold text-gray-900 text-center mb-2">
//             {title}
//           </h3>

//           {/* Message */}
//           <p className="text-gray-600 text-center mb-6">
//             {message}
//           </p>

//           {/* Action */}
//           <button
//             onClick={onClose}
//             className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
//           >
//             OK
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// };
import { AlertCircle, CheckCircle, X, AlertTriangle } from 'lucide-react';

export const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message, type = 'warning' }) => {
  if (!isOpen) return null;

  const icons = {
    warning: <AlertTriangle className="h-14 w-14 text-amber-500" />,
    danger: <AlertCircle className="h-14 w-14 text-red-500" />,
    info: <CheckCircle className="h-14 w-14 text-blue-500" />,
  };

  const buttonColors = {
    warning: 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700',
    danger: 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700',
    info: 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700',
  };

  const iconBgColors = {
    warning: 'bg-amber-100',
    danger: 'bg-red-100',
    info: 'bg-blue-100',
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        
        .modal-backdrop {
          animation: fadeIn 0.2s ease-out;
        }
        
        .modal-content {
          animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        @keyframes iconPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        
        .icon-pulse {
          animation: iconPulse 2s ease-in-out infinite;
        }
      `}</style>

      {/* Backdrop */}
      <div
        className="modal-backdrop fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      ></div>

      {/* Modal */}
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="modal-content relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 z-50">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg p-1 transition-all"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Icon */}
          <div className="flex justify-center mb-5">
            <div className={`${iconBgColors[type]} p-4 rounded-2xl icon-pulse`}>
              {icons[type]}
            </div>
          </div>

          {/* Title */}
          <h3 className="text-2xl font-bold text-slate-900 text-center mb-3">
            {title}
          </h3>

          {/* Message */}
          <p className="text-slate-600 text-center mb-8 leading-relaxed">
            {message}
          </p>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-5 py-3 border-2 border-slate-300 rounded-xl text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-all font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={`flex-1 px-5 py-3 rounded-xl text-white transition-all font-semibold shadow-lg hover:shadow-xl ${buttonColors[type]}`}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const AlertModal = ({ isOpen, onClose, title, message, type = 'error' }) => {
  if (!isOpen) return null;

  const icons = {
    error: <AlertCircle className="h-14 w-14 text-red-500" />,
    success: <CheckCircle className="h-14 w-14 text-green-500" />,
    info: <CheckCircle className="h-14 w-14 text-blue-500" />,
  };

  const iconBgColors = {
    error: 'bg-red-100',
    success: 'bg-green-100',
    info: 'bg-blue-100',
  };

  const buttonColors = {
    error: 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700',
    success: 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700',
    info: 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700',
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        
        .modal-backdrop {
          animation: fadeIn 0.2s ease-out;
        }
        
        .modal-content {
          animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        @keyframes iconPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        
        .icon-pulse {
          animation: iconPulse 2s ease-in-out infinite;
        }
      `}</style>

      {/* Backdrop */}
      <div
        className="modal-backdrop fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      ></div>

      {/* Modal */}
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="modal-content relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 z-50">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg p-1 transition-all"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Icon */}
          <div className="flex justify-center mb-5">
            <div className={`${iconBgColors[type]} p-4 rounded-2xl icon-pulse`}>
              {icons[type]}
            </div>
          </div>

          {/* Title */}
          <h3 className="text-2xl font-bold text-slate-900 text-center mb-3">
            {title}
          </h3>

          {/* Message */}
          <p className="text-slate-600 text-center mb-8 leading-relaxed">
            {message}
          </p>

          {/* Action */}
          <button
            onClick={onClose}
            className={`w-full px-5 py-3 rounded-xl text-white transition-all font-semibold shadow-lg hover:shadow-xl ${buttonColors[type]}`}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};