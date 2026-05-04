import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, logoutUser } from '../utils/firebase';
import { onAuthStateChanged } from 'firebase/auth';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(null);
  const [needsUsername, setNeedsUsername] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const idToken = await firebaseUser.getIdToken();
        const displayName = firebaseUser.displayName;
        const hasUsername = displayName && displayName.trim().length > 0;
        setNeedsUsername(!hasUsername);
        const username = hasUsername ? displayName : firebaseUser.email?.split('@')[0] || 'User';
        setUser({ id: firebaseUser.uid, username, email: firebaseUser.email, photoURL: firebaseUser.photoURL, hasUsername });
        setToken(idToken);
        localStorage.setItem('token', idToken);
      } else {
        setUser(null); setToken(null); setNeedsUsername(false);
        localStorage.removeItem('token');
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Auto refresh token every 55 mins
  useEffect(() => {
    const interval = setInterval(async () => {
      if (auth.currentUser) {
        const newToken = await auth.currentUser.getIdToken(true);
        setToken(newToken);
        localStorage.setItem('token', newToken);
      }
    }, 55 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const logout = async () => {
    await logoutUser();
    setUser(null); setToken(null); setNeedsUsername(false);
    localStorage.removeItem('token');
  };

  const refreshToken = async () => {
    if (auth.currentUser) {
      const newToken = await auth.currentUser.getIdToken(true);
      setToken(newToken);
      localStorage.setItem('token', newToken);
      const firebaseUser = auth.currentUser;
      const displayName = firebaseUser.displayName;
      const hasUsername = displayName && displayName.trim().length > 0;
      setNeedsUsername(!hasUsername);
      setUser(prev => ({ ...prev, username: hasUsername ? displayName : prev?.email?.split('@')[0] || 'User', hasUsername }));
      return newToken;
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, needsUsername, logout, refreshToken, isLoggedIn: !!user }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
