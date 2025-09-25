import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { OAuthCallbackPage } from '../../pages/OAuthCallbackPage';
import { useAuth } from '../../hooks/useAuth';
import { ThemeProvider } from '../../contexts/ThemeContext';

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock the auth context
vi.mock('../../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));
const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;

// Mock react-router-dom
const mockNavigate = vi.fn();
const mockUseSearchParams = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => mockUseSearchParams(),
  };
});

const renderWithRouter = (component: React.ReactElement) => {
  return render(
    <BrowserRouter>
      <ThemeProvider>{component}</ThemeProvider>
    </BrowserRouter>
  );
};

describe('OAuthCallbackPage', () => {
  const mockHandleOAuthCallback = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSearchParams.mockReturnValue([new URLSearchParams('?token=test-token')]);
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      loginWithGoogle: vi.fn(),
      handleOAuthCallback: mockHandleOAuthCallback,
      logout: vi.fn(),
    });
  });

  it('renders loading state initially', () => {
    renderWithRouter(<OAuthCallbackPage />);

    expect(screen.getByText('Completing sign in...')).toBeInTheDocument();
  });

  it('calls handleOAuthCallback with token from URL', async () => {
    mockHandleOAuthCallback.mockResolvedValue(undefined);

    renderWithRouter(<OAuthCallbackPage />);

    await waitFor(() => {
      expect(mockHandleOAuthCallback).toHaveBeenCalledWith('test-token');
    });
  });

  it('navigates to dashboard after successful authentication', async () => {
    mockHandleOAuthCallback.mockResolvedValue({ success: true });

    renderWithRouter(<OAuthCallbackPage />);

    await waitFor(
      () => {
        expect(mockNavigate).toHaveBeenCalledWith('/');
      },
      { timeout: 2000 }
    );
  });

  it('shows error when no token is provided', async () => {
    // Mock useSearchParams to return no token
    mockUseSearchParams.mockReturnValue([new URLSearchParams('')]);

    renderWithRouter(<OAuthCallbackPage />);

    await waitFor(() => {
      expect(screen.getByText('No authentication token received.')).toBeInTheDocument();
    });
  });

  it('shows error when OAuth callback fails', async () => {
    mockHandleOAuthCallback.mockResolvedValue({ success: false, error: 'OAuth failed' });

    renderWithRouter(<OAuthCallbackPage />);

    await waitFor(() => {
      expect(screen.getByText('OAuth failed')).toBeInTheDocument();
    });
  });

  it('shows error when error parameter is in URL', async () => {
    // Mock useSearchParams to return error
    mockUseSearchParams.mockReturnValue([new URLSearchParams('?error=access_denied')]);

    renderWithRouter(<OAuthCallbackPage />);

    await waitFor(() => {
      expect(screen.getByText('Authentication failed. Please try again.')).toBeInTheDocument();
    });
  });

  it('navigates to login when try again is clicked', async () => {
    mockHandleOAuthCallback.mockResolvedValue({ success: false, error: 'OAuth failed' });

    renderWithRouter(<OAuthCallbackPage />);

    await waitFor(() => {
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });

    const tryAgainButton = screen.getByText('Try Again');
    tryAgainButton.click();

    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });
});
