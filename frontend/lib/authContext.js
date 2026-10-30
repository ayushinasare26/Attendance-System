'use client';

/**
 * frontend/lib/authContext.js
 *
 * Client-side authentication context, session state, and flash notifications.
 * Flask server remains the single authority on authentication via session cookies.
 * This context coordinates client-side navigation, tracks session state,
 * and handles flash messages.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import api from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [flashes, setFlashes] = useState([]);

  const addFlash = useCallback((message, category = 'info') => {
    if (!message) return;
    const id = Date.now() + Math.random().toString(36).substring(2, 7);
    setFlashes((prev) => [...prev, { id, message, category }]);
  }, []);

  const removeFlash = useCallback((id) => {
    setFlashes((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clearFlashes = useCallback(() => {
    setFlashes([]);
  }, []);

  useEffect(() => {
    // Listen for 401 / 403 authorization failures dispatched by api.js
    const handleUnauthorized = (event) => {
      const { redirect, message } = event.detail || {};
      if (message) {
        setAuthError(message);
        addFlash(message, 'danger');
      }
      if (redirect) {
        router.push(redirect);
      }
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, [router, addFlash]);

  const loginEmployee = async (credentials) => {
    setAuthError(null);
    const res = await api.post('/employee/login', credentials);
    if (res && res.session) {
      setSession(res.session);
    }
    if (res && res.message) {
      addFlash(res.message, res.category || (res.ok ? 'success' : 'danger'));
    }
    if (res && res.ok && res.redirect) {
      router.push(res.redirect);
    }
    return res;
  };

  const loginAdmin = async (credentials) => {
    setAuthError(null);
    const res = await api.post('/admin/login', credentials);
    if (res && res.session) {
      setSession(res.session);
    }
    if (res && res.message) {
      addFlash(res.message, res.category || (res.ok ? 'success' : 'danger'));
    }
    if (res && res.ok && res.redirect) {
      router.push(res.redirect);
    }
    return res;
  };

  const logout = async (portal = 'employee') => {
    let endpoint = '/employee/logout';
    if (portal === 'admin') endpoint = '/admin/logout';
    if (portal === 'manager') endpoint = '/manager/logout';

    const res = await api.get(endpoint);
    setSession(null);
    if (res && res.redirect) {
      router.push(res.redirect);
    } else {
      router.push('/login');
    }
    return res;
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        setSession,
        authError,
        setAuthError,
        flashes,
        addFlash,
        removeFlash,
        clearFlashes,
        loginEmployee,
        loginAdmin,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

export default AuthContext;
