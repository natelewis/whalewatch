/**
 * Utility functions for managing localStorage with type safety and error handling
 */

export class LocalStorageError extends Error {
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

