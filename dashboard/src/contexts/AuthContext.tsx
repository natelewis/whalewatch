import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, AuthContextType } from '../types';
import { authService } from '../services/authService';
import { API_BASE_URL } from '../constants';
import { safeCallAsync, createUserFriendlyMessage } from '@whalewatch/shared';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        const result = await safeCallAsync(async () => {
          const userData = await authService.verifyToken();
          return userData;
        });

        if (result.isOk()) {
          setUser(result.value.user);
          setIsAuthenticated(true);
        } else {
          console.error('Auth initialization error:', createUserFriendlyMessage(result.error));
          localStorage.removeItem('token');
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const loginWithGoogle = () => {
    // Redirect to backend Google OAuth endpoint
    window.location.href = `${API_BASE_URL}/api/auth/google`;
  };

  const handleOAuthCallback = async (token: string) => {
    const result = await safeCallAsync(async () => {
      // Store the token
      localStorage.setItem('token', token);

      // Verify the token and get user data
      const userData = await authService.verifyToken();
      setUser(userData.user);
      setIsAuthenticated(true);

      return { success: true };
    });

    if (result.isOk()) {
      return result.value;
    } else {
      console.error('OAuth callback error:', createUserFriendlyMessage(result.error));
      localStorage.removeItem('token');
      return { success: false, error: 'Authentication failed' };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setIsAuthenticated(false);
  };

  const value: AuthContextType = {
    user,
    isAuthenticated,
    isLoading,
    loginWithGoogle,
    handleOAuthCallback,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
