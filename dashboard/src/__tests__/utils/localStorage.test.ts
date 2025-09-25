import { vi } from 'vitest';
import {
  getLocalStorageItem,
  setLocalStorageItem,
  removeLocalStorageItem,
  isLocalStorageAvailable,
  LocalStorageError,
} from '../../utils/localStorage';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('localStorage utilities', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe('getLocalStorageItem', () => {
    it('should return default value when key does not exist', () => {
      const result = getLocalStorageItem('nonexistent', 'default');
      expect(result).toBe('default');
    });

    it('should return parsed value when key exists', () => {
      localStorageMock.setItem('test-key', JSON.stringify({ name: 'test' }));
      const result = getLocalStorageItem('test-key', {});
      expect(result).toEqual({ name: 'test' });
    });

    it('should return default value when JSON parsing fails', () => {
      localStorageMock.setItem('invalid-json', 'invalid json');
      const result = getLocalStorageItem('invalid-json', 'default');
      expect(result).toBe('default');
    });

    it('should return default value when window is undefined', () => {
      const originalWindow = global.window;
      // @ts-expect-error - Testing window undefined scenario
      delete global.window;

      const result = getLocalStorageItem('test-key', 'default');
      expect(result).toBe('default');

      global.window = originalWindow;
    });
  });

  describe('setLocalStorageItem', () => {
    it('should store value in localStorage', () => {
      const testData = { name: 'test', value: 123 };
      setLocalStorageItem('test-key', testData);

      const stored = localStorageMock.getItem('test-key');
      expect(stored).toBe(JSON.stringify(testData));
    });

    it('should throw LocalStorageError when localStorage is not available', () => {
      const originalWindow = global.window;
      // @ts-expect-error - Testing window undefined scenario
      delete global.window;

      expect(() => {
        setLocalStorageItem('test-key', 'value');
      }).toThrow(LocalStorageError);

      global.window = originalWindow;
    });

    it('should throw LocalStorageError when storage quota is exceeded', () => {
      // Mock localStorage.setItem to throw quota exceeded error
      const originalSetItem = localStorageMock.setItem;
      localStorageMock.setItem = vi.fn(() => {
        const error = new DOMException('QuotaExceededError', 'QuotaExceededError');
        throw error;
      });

      expect(() => {
        setLocalStorageItem('test-key', 'value');
      }).toThrow(LocalStorageError);

      localStorageMock.setItem = originalSetItem;
    });
  });

  describe('removeLocalStorageItem', () => {
    it('should remove item from localStorage', () => {
      localStorageMock.setItem('test-key', 'test-value');
      removeLocalStorageItem('test-key');

      const result = localStorageMock.getItem('test-key');
      expect(result).toBeNull();
    });

    it('should not throw error when window is undefined', () => {
      const originalWindow = global.window;
      // @ts-expect-error - Testing window undefined scenario
      delete global.window;

      expect(() => {
        removeLocalStorageItem('test-key');
      }).not.toThrow();

      global.window = originalWindow;
    });
  });

  describe('isLocalStorageAvailable', () => {
    it('should return true when localStorage is available', () => {
      expect(isLocalStorageAvailable()).toBe(true);
    });

    it('should return false when window is undefined', () => {
      const originalWindow = global.window;
      // @ts-expect-error - Testing window undefined scenario
      delete global.window;

      expect(isLocalStorageAvailable()).toBe(false);

      global.window = originalWindow;
    });

    it('should return false when localStorage throws error', () => {
      const originalSetItem = localStorageMock.setItem;
      localStorageMock.setItem = vi.fn(() => {
        throw new Error('localStorage not available');
      });

      expect(isLocalStorageAvailable()).toBe(false);

      localStorageMock.setItem = originalSetItem;
    });
  });
});
