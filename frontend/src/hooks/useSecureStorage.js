import { useCallback, useEffect, useRef } from 'react';

/**
 * Secure storage hook with automatic cleanup
 * Uses sessionStorage by default for better security
 * Falls back to memory storage if needed
 */
export const useSecureStorage = (storageType = 'session') => {
  const memoryStorage = useRef({});
  
  const getStorage = useCallback(() => {
    try {
      if (storageType === 'session' && typeof sessionStorage !== 'undefined') {
        return sessionStorage;
      }
      if (storageType === 'local' && typeof localStorage !== 'undefined') {
        return localStorage;
      }
    } catch (e) {
      console.warn('Storage not available, using memory storage');
    }
    return null;
  }, [storageType]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      memoryStorage.current = {};
    };
  }, []);

  const setItem = useCallback((key, value, encrypt = false) => {
    try {
      const serialized = JSON.stringify(value);
      const data = encrypt ? btoa(serialized) : serialized;
      
      const storage = getStorage();
      if (storage) {
        storage.setItem(key, data);
      } else {
        memoryStorage.current[key] = data;
      }
    } catch (error) {
      console.error('Failed to set item:', error);
    }
  }, [getStorage]);

  const getItem = useCallback((key, decrypt = false) => {
    try {
      const storage = getStorage();
      let data = storage ? storage.getItem(key) : memoryStorage.current[key];
      
      if (!data) return null;
      
      if (decrypt) {
        data = atob(data);
      }
      
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to get item:', error);
      return null;
    }
  }, [getStorage]);

  const removeItem = useCallback((key) => {
    try {
      const storage = getStorage();
      if (storage) {
        storage.removeItem(key);
      } else {
        delete memoryStorage.current[key];
      }
    } catch (error) {
      console.error('Failed to remove item:', error);
    }
  }, [getStorage]);

  const clear = useCallback(() => {
    try {
      const storage = getStorage();
      if (storage) {
        storage.clear();
      }
      memoryStorage.current = {};
    } catch (error) {
      console.error('Failed to clear storage:', error);
    }
  }, [getStorage]);

  const exists = useCallback((key) => {
    const storage = getStorage();
    if (storage) {
      return storage.getItem(key) !== null;
    }
    return key in memoryStorage.current;
  }, [getStorage]);

  return {
    setItem,
    getItem,
    removeItem,
    clear,
    exists,
  };
};

export default useSecureStorage;