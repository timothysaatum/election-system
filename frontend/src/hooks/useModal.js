import { useState } from 'react';

export const useModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [modalProps, setModalProps] = useState({});
  const [resolvePromise, setResolvePromise] = useState(null);

  const showConfirm = ({ title, message, type = 'warning' }) => {
    return new Promise((resolve) => {
      setModalProps({ title, message, type });
      setResolvePromise(() => resolve);
      setIsOpen(true);
    });
  };

  const showAlert = ({ title, message, type = 'error' }) => {
    return new Promise((resolve) => {
      setModalProps({ title, message, type, isAlert: true });
      setResolvePromise(() => resolve);
      setIsOpen(true);
    });
  };

  const handleConfirm = () => {
    if (resolvePromise) resolvePromise(true);
    setIsOpen(false);
  };

  const handleClose = () => {
    if (resolvePromise) resolvePromise(false);
    setIsOpen(false);
  };

  return {
    isOpen,
    modalProps,
    showConfirm,
    showAlert,
    handleConfirm,
    handleClose,
  };
};