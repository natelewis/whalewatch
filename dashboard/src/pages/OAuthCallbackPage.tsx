import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { Sun, Moon } from 'lucide-react';
import { safeCallAsync, createUserFriendlyMessage } from '@whalewatch/shared';

export const OAuthCallbackPage: React.FC = () => {
  const { handleOAuthCallback } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const processCallback = async () => {
      const result = await safeCallAsync(async () => {
        const token = searchParams.get('token');
        const authError = searchParams.get('error');

        if (authError) {
          throw new Error('Authentication failed. Please try again.');
        }

        if (!token) {
          throw new Error('No authentication token received.');
        }

        const authResult = await handleOAuthCallback(token);

        if (!authResult.success) {
          throw new Error(authResult.error || 'Authentication failed.');
        }

        return authResult;
      });

      if (result.isOk()) {
        setStatus('success');
        setTimeout(() => {
          navigate('/');
        }, 1500);
      } else {
        setStatus('error');
        const userMessage = createUserFriendlyMessage(result.error);
        setError(userMessage);
      }
    };

    processCallback();
  }, [searchParams, handleOAuthCallback, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full space-y-8 p-8">
        {/* Header */}
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="flex items-center space-x-3">
              <img src="/whale-logo.png" alt="Whale Watch Logo" className="w-16 h-16" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Whale Watch</h1>
          <p className="text-muted-foreground">Processing authentication...</p>
        </div>

        {/* Status */}
        <div className="text-center">
          {status === 'processing' && (
            <div className="space-y-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="text-sm text-muted-foreground">Completing sign in...</p>
            </div>
          )}

          {status === 'success' && (
            <div className="space-y-4">
              <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm text-green-600">Successfully signed in! Redirecting...</p>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4">
              <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <p className="text-sm text-red-600">{error}</p>
              <button
                onClick={() => navigate('/login')}
                className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
              >
                Try Again
              </button>
            </div>
          )}
        </div>

        {/* Theme Toggle */}
        <div className="flex justify-center">
          <button
            onClick={toggleTheme}
            className="flex items-center px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {isDark ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
            {isDark ? 'Light' : 'Dark'}
          </button>
        </div>
      </div>
    </div>
  );
};
