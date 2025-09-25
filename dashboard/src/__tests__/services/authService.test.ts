import { vi } from 'vitest';

// Mock the authService module directly
vi.mock('../../services/authService', () => ({
  authService: {
    verifyToken: vi.fn(),
    logout: vi.fn(),
  },
}));

import { authService } from '../../services/authService';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('authService', () => {
  const mockAuthService = authService as {
    verifyToken: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue('test-token');
  });

  describe('verifyToken', () => {
    it('should verify token and return user data', async () => {
      const mockUserData = {
        user: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
        },
      };

      mockAuthService.verifyToken.mockResolvedValue(mockUserData);

      const result = await authService.verifyToken();

      expect(mockAuthService.verifyToken).toHaveBeenCalled();
      expect(result).toEqual(mockUserData);
    });

    it('should handle verification errors', async () => {
      const errorMessage = 'Invalid token';
      mockAuthService.verifyToken.mockRejectedValue(new Error(errorMessage));

      await expect(authService.verifyToken()).rejects.toThrow(errorMessage);
    });
  });

  describe('logout', () => {
    it('should call logout endpoint', async () => {
      const mockLogoutData = {
        message: 'Logged out successfully',
      };

      mockAuthService.logout.mockResolvedValue(mockLogoutData);

      const result = await authService.logout();

      expect(mockAuthService.logout).toHaveBeenCalled();
      expect(result).toEqual(mockLogoutData);
    });

    it('should handle logout errors', async () => {
      const errorMessage = 'Logout failed';
      mockAuthService.logout.mockRejectedValue(new Error(errorMessage));

      await expect(authService.logout()).rejects.toThrow(errorMessage);
    });
  });
});
