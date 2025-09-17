import { authService } from '../../services/authService';
import axios from 'axios';

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

// Mock window.location
delete (window as any).location;
window.location = { href: '' } as any;

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.getItem.mockReturnValue('test-token');
  });

  describe('loginWithAuth0', () => {
    it('should redirect to Auth0 login URL', () => {
      authService.loginWithAuth0();

      expect(window.location.href).toBe('http://localhost:3001/api/auth/login');
    });
  });

  describe('handleAuth0Callback', () => {
    it('should exchange code for token and return user data', async () => {
      const mockResponse = {
        data: {
          token: 'jwt-token',
          user: {
            id: 'user-1',
            auth0Id: 'auth0|123456789',
            email: 'test@example.com',
            name: 'Test User',
            picture: 'https://example.com/photo.jpg',
          },
        },
      };

      mockedAxios.post.mockResolvedValue(mockResponse);

      const result = await authService.handleAuth0Callback('auth-code');

      expect(mockedAxios.post).toHaveBeenCalledWith('/api/auth/callback', { code: 'auth-code' });
      expect(localStorageMock.setItem).toHaveBeenCalledWith('token', 'jwt-token');
      expect(result).toEqual({
        token: 'jwt-token',
        user: {
          id: 'user-1',
          auth0Id: 'auth0|123456789',
          email: 'test@example.com',
          name: 'Test User',
          picture: 'https://example.com/photo.jpg',
        },
      });
    });

    it('should handle API error during callback', async () => {
      mockedAxios.post.mockRejectedValue(new Error('API Error'));

      await expect(authService.handleAuth0Callback('invalid-code')).rejects.toThrow('API Error');
    });
  });

  describe('verifyToken', () => {
    it('should verify token and return user data', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      };

      mockedAxios.get.mockResolvedValue({
        data: { user: mockUser },
      });

      const result = await authService.verifyToken('test-token');

      expect(mockedAxios.get).toHaveBeenCalledWith('/api/auth/verify', {
        headers: { Authorization: 'Bearer test-token' },
      });
      expect(result).toEqual(mockUser);
    });
  });

  describe('logout', () => {
    it('should call logout endpoint and clear token', async () => {
      mockedAxios.post.mockResolvedValue({ data: {} });

      await authService.logout();

      expect(mockedAxios.post).toHaveBeenCalledWith('/api/auth/logout');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('token');
    });

    it('should clear token even if logout endpoint fails', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Network error'));

      await authService.logout();

      expect(mockedAxios.post).toHaveBeenCalledWith('/api/auth/logout');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('token');
    });
  });
});
