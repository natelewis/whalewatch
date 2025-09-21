import axios from 'axios';
import { authService } from '../../services/authService';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('authService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
