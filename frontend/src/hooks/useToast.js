import { useState, useCallback } from "react";

export const useToast = () => {
    const [toasts, setToasts] = useState([]);

    const showToast = useCallback((message, type = "success", duration = 3000) => {
        const id = Date.now();
        const toast = { id, message, type, duration };
        setToasts((prev) => [...prev, toast]);
        return id;
    }, []);

    const removeToast = useCallback((id) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    return {
        toasts,
        showToast,
        removeToast,
        showSuccess: (message, duration) => showToast(message, "success", duration),
        showError: (message, duration) => showToast(message, "error", duration),
        showInfo: (message, duration) => showToast(message, "info", duration),
    };
};
