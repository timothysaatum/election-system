import { useState, useEffect } from "react";
import { CheckCircle, AlertCircle, Info, X } from "lucide-react";

export const Toast = ({ message, type = "success", duration = 3000, onClose }) => {
    const [isExiting, setIsExiting] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsExiting(true);
            setTimeout(onClose, 300);
        }, duration);

        return () => clearTimeout(timer);
    }, [duration, onClose]);

    const bgColor = {
        success: "bg-green-50 border-green-200",
        error: "bg-red-50 border-red-200",
        info: "bg-blue-50 border-blue-200",
    }[type];

    const textColor = {
        success: "text-green-800",
        error: "text-red-800",
        info: "text-blue-800",
    }[type];

    const iconColor = {
        success: "text-green-500",
        error: "text-red-500",
        info: "text-blue-500",
    }[type];

    const Icon = {
        success: CheckCircle,
        error: AlertCircle,
        info: Info,
    }[type];

    return (
        <div
            className={`fixed top-4 right-4 flex items-center gap-3 px-4 py-3 rounded-lg border ${bgColor} ${textColor} shadow-lg transform transition-all duration-300 ${isExiting ? "translate-x-96 opacity-0" : "translate-x-0 opacity-100"
                }`}
            style={{ zIndex: 9999 }}
        >
            <Icon className={`h-5 w-5 flex-shrink-0 ${iconColor}`} />
            <p className="text-sm font-medium">{message}</p>
            <button
                onClick={() => {
                    setIsExiting(true);
                    setTimeout(onClose, 300);
                }}
                className="ml-2 text-gray-400 hover:text-gray-600 flex-shrink-0"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    );
};

export const ToastContainer = ({ toasts, onRemove }) => {
    return (
        <>
            {toasts.map((toast) => (
                <Toast
                    key={toast.id}
                    message={toast.message}
                    type={toast.type}
                    duration={toast.duration}
                    onClose={() => onRemove(toast.id)}
                />
            ))}
        </>
    );
};
