import axios from 'axios';
import { vi } from 'vitest';
import { authService } from '../../services/authService';

// Mock axios
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      interceptors: {
        request: {
          use: vi.fn(),
        },
        response: {
          use: vi.fn(),
        },
      },
      get: vi.fn(),
      post: vi.fn(),
    })),
    interceptors: {
      request: {
        use: vi.fn(),
      },
      response: {
        use: vi.fn(),
      },
    },
    get: vi.fn(),
    post: vi.fn(),
  },
}));
const mockedAxios = axios as any;

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
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue('test-token');
  });

  describe('verifyToken', () => {
    it('should verify token and return user data', async () => {
      const mockResponse = {
        data: {
          user: {
            id: 'user-1',
            email: 'test@example.com',
            name: 'Test User',
          },
        },
      };

      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await authService.verifyToken();

      expect(mockedAxios.get).toHaveBeenCalledWith('/api/auth/verify');
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle verification errors', async () => {
      const errorMessage = 'Invalid token';
      mockedAxios.get.mockRejectedValue(new Error(errorMessage));

      await expect(authService.verifyToken()).rejects.toThrow(errorMessage);
    });
  });

  describe('logout', () => {
    it('should call logout endpoint', async () => {
      const mockResponse = {
        data: {
          message: 'Logged out successfully',
        },
      };

      mockedAxios.post.mockResolvedValue(mockResponse);

      const result = await authService.logout();

      expect(mockedAxios.post).toHaveBeenCalledWith('/api/auth/logout');
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle logout errors', async () => {
      const errorMessage = 'Logout failed';
      mockedAxios.post.mockRejectedValue(new Error(errorMessage));

      await expect(authService.logout()).rejects.toThrow(errorMessage);
    });
  });
});
