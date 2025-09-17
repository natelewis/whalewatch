import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { OAuthCallbackPage } from '../../pages/OAuthCallbackPage';
import { useAuth } from '../../contexts/AuthContext';

// Mock the auth context
jest.mock('../../contexts/AuthContext');
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

// Mock react-router-dom
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useSearchParams: () => [new URLSearchParams('?token=test-token')],
}));

const renderWithRouter = (component: React.ReactElement) => {
  return render(
    <BrowserRouter>
      {component}
    </BrowserRouter>
  );
};

describe('OAuthCallbackPage', () => {
  const mockHandleOAuthCallback = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      loginWithGoogle: jest.fn(),
      handleOAuthCallback: mockHandleOAuthCallback,
      logout: jest.fn(),
    });
  });

  it('renders loading state initially', () => {
    renderWithRouter(<OAuthCallbackPage />);

    expect(screen.getByText('Completing authentication...')).toBeInTheDocument();
    expect(screen.getByText('Please wait while we log you in.')).toBeInTheDocument();
  });

  it('calls handleOAuthCallback with token from URL', async () => {
    mockHandleOAuthCallback.mockResolvedValue(undefined);

    renderWithRouter(<OAuthCallbackPage />);

    await waitFor(() => {
      expect(mockHandleOAuthCallback).toHaveBeenCalledWith('test-token');
    });
  });

  it('navigates to dashboard after successful authentication', async () => {
    mockHandleOAuthCallback.mockResolvedValue(undefined);

    renderWithRouter(<OAuthCallbackPage />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('shows error when no token is provided', async () => {
    // Mock useSearchParams to return no token
    jest.doMock('react-router-dom', () => ({
      ...jest.requireActual('react-router-dom'),
      useNavigate: () => mockNavigate,
      useSearchParams: () => [new URLSearchParams('')],
    }));

    renderWithRouter(<OAuthCallbackPage />);

    await waitFor(() => {
      expect(screen.getByText('Authentication Error')).toBeInTheDocument();
      expect(screen.getByText('No authentication token received.')).toBeInTheDocument();
    });
  });

  it('shows error when OAuth callback fails', async () => {
    mockHandleOAuthCallback.mockRejectedValue(new Error('OAuth failed'));

    renderWithRouter(<OAuthCallbackPage />);

    await waitFor(() => {
      expect(screen.getByText('Authentication Error')).toBeInTheDocument();
      expect(screen.getByText('Authentication failed. Please try again.')).toBeInTheDocument();
    });
  });

  it('shows error when error parameter is in URL', async () => {
    // Mock useSearchParams to return error
    jest.doMock('react-router-dom', () => ({
      ...jest.requireActual('react-router-dom'),
      useNavigate: () => mockNavigate,
      useSearchParams: () => [new URLSearchParams('?error=access_denied')],
    }));

    renderWithRouter(<OAuthCallbackPage />);

    await waitFor(() => {
      expect(screen.getByText('Authentication Error')).toBeInTheDocument();
      expect(screen.getByText('Authentication failed. Please try again.')).toBeInTheDocument();
    });
  });

  it('navigates to login when try again is clicked', async () => {
    mockHandleOAuthCallback.mockRejectedValue(new Error('OAuth failed'));

    renderWithRouter(<OAuthCallbackPage />);

    await waitFor(() => {
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });

    const tryAgainButton = screen.getByText('Try Again');
    tryAgainButton.click();

    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });
});
