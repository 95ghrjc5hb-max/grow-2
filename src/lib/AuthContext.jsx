import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authChecked, setAuthChecked] = useState(false); // Essential for routing guards

  useEffect(() => {
    // 1. Check current Supabase Session as soon as the app loads
    const getInitialSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        setUser(session?.user ?? null);
        setIsAuthenticated(!!session);
      } catch (error) {
        console.error('Error getting initial session:', error);
      } finally {
        setIsLoadingAuth(false);
        setAuthChecked(true); // Verification complete, routes can now open
      }
    };

    getInitialSession();

    // 2. Real-time Auth State Listener (Triggers on login, logout, or session changes)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsAuthenticated(!!session);
      setIsLoadingAuth(false);
      setAuthChecked(true);
    });

    // Cleanup function to prevent memory leaks
    return () => subscription.unsubscribe();
  }, []);

  // Supabase-based logout protocol
  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setIsAuthenticated(false);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      isAuthenticated,
      isLoadingAuth,
      authChecked, 
      logout
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
