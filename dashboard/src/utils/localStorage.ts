/**
 * Utility functions for managing localStorage and sessionStorage with type safety and error handling
 */

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}

// Keep the old class for backward compatibility
export class LocalStorageError extends StorageError {
  constructor(message: string) {
    super(message);
    this.name = 'LocalStorageError';
  }
}

/**
 * Safely get an item from localStorage with type safety
 * @param key - The localStorage key
 * @param defaultValue - Default value to return if key doesn't exist or parsing fails
 * @returns The parsed value or default value
 */
export function getLocalStorageItem<T>(key: string, defaultValue: T): T {
  try {
    if (typeof window === 'undefined') {
      return defaultValue;
    }

    const item = localStorage.getItem(key);
    if (item === null) {
      return defaultValue;
    }

    return JSON.parse(item) as T;
  } catch (error) {
    console.warn(`Failed to parse localStorage item "${key}":`, error);
    return defaultValue;
  }
}

/**
 * Safely set an item in localStorage with error handling
 * @param key - The localStorage key
 * @param value - The value to store
 * @throws LocalStorageError if storage fails
 */
export function setLocalStorageItem<T>(key: string, value: T): void {
  try {
    if (typeof window === 'undefined') {
      throw new LocalStorageError('localStorage is not available in this environment');
    }

    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    if (error instanceof DOMException) {
      throw new LocalStorageError(`Failed to save to localStorage: ${error.message}`);
    }
    throw new LocalStorageError(`Failed to save to localStorage: ${error}`);
  }
}

/**
 * Remove an item from localStorage
 * @param key - The localStorage key
 */
export function removeLocalStorageItem(key: string): void {
  try {
    if (typeof window === 'undefined') {
      return;
    }
    localStorage.removeItem(key);
  } catch (error) {
    console.warn(`Failed to remove localStorage item "${key}":`, error);
  }
}

/**
 * Check if localStorage is available
 * @returns true if localStorage is available, false otherwise
 */
export function isLocalStorageAvailable(): boolean {
  try {
    if (typeof window === 'undefined') {
      return false;
    }
    const test = '__localStorage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// SESSION STORAGE FUNCTIONS
// ============================================================================

/**
 * Safely get an item from sessionStorage with type safety
 * @param key - The sessionStorage key
 * @param defaultValue - Default value to return if key doesn't exist or parsing fails
 * @returns The parsed value or default value
 */
export function getSessionStorageItem<T>(key: string, defaultValue: T): T {
  try {
    if (typeof window === 'undefined') {
      return defaultValue;
    }

    const item = sessionStorage.getItem(key);
    if (item === null) {
      return defaultValue;
    }

    return JSON.parse(item) as T;
  } catch (error) {
    console.warn(`Failed to parse sessionStorage item "${key}":`, error);
    return defaultValue;
  }
}

/**
 * Safely set an item in sessionStorage with error handling
 * @param key - The sessionStorage key
 * @param value - The value to store
 * @throws StorageError if storage fails
 */
export function setSessionStorageItem<T>(key: string, value: T): void {
  try {
    if (typeof window === 'undefined') {
      throw new StorageError('sessionStorage is not available in this environment');
    }

    sessionStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    if (error instanceof DOMException) {
      throw new StorageError(`Failed to save to sessionStorage: ${error.message}`);
    }
    throw new StorageError(`Failed to save to sessionStorage: ${error}`);
  }
}

/**
 * Remove an item from sessionStorage
 * @param key - The sessionStorage key
 */
export function removeSessionStorageItem(key: string): void {
  try {
    if (typeof window === 'undefined') {
      return;
    }
    sessionStorage.removeItem(key);
  } catch (error) {
    console.warn(`Failed to remove sessionStorage item "${key}":`, error);
  }
}

/**
 * Check if sessionStorage is available
 * @returns true if sessionStorage is available, false otherwise
 */
export function isSessionStorageAvailable(): boolean {
  try {
    if (typeof window === 'undefined') {
      return false;
    }
    const test = '__sessionStorage_test__';
    sessionStorage.setItem(test, test);
    sessionStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}
