import { checkAutoLoadTrigger } from '../renderManager';
import { LOAD_EDGE_TRIGGER } from '../../constants';
import { vi } from 'vitest';

// Mock callback function for testing
const createMockCallback = (shouldReturnValue = true) => {
  const calls: Array<{ direction: 'past' | 'future'; timestamp: number }> = [];
  const callback = vi.fn((direction: 'past' | 'future') => {
    calls.push({ direction, timestamp: Date.now() });
    return shouldReturnValue;
  });
  callback.calls = calls;
  return callback;
};

// Mock ref objects for testing
const createMockRef = <T>(initialValue: T) => ({ current: initialValue });

// Helper function to wait for setTimeout callbacks
const waitForCallbacks = () => new Promise(resolve => setTimeout(resolve, 10));

describe('checkAutoLoadTrigger', () => {
  describe('basic functionality', () => {
    it('should not trigger callback when no callback is provided', () => {
      const mockCallback = createMockCallback();

      checkAutoLoadTrigger(
        0,
        100,
        1000,
        undefined // No callback provided
      );

      expect(mockCallback.calls).toHaveLength(0);
    });

    it('should not trigger callback when viewport is far from edges', () => {
      const mockCallback = createMockCallback();

      checkAutoLoadTrigger(
        200, // Far from left edge
        300, // Far from right edge
        1000,
        mockCallback
      );

      expect(mockCallback.calls).toHaveLength(0);
    });

    it('should trigger past callback when close to left edge', async () => {
      const mockCallback = createMockCallback();

      checkAutoLoadTrigger(
        LOAD_EDGE_TRIGGER - 10, // Within threshold of left edge
        200,
        1000,
        mockCallback
      );

      await waitForCallbacks();

      expect(mockCallback.calls).toHaveLength(1);
      expect(mockCallback.calls[0].direction).toBe('past');
    });

    it('should trigger future callback when close to right edge', async () => {
      const mockCallback = createMockCallback();

      checkAutoLoadTrigger(
        LOAD_EDGE_TRIGGER + 10, // Far from left edge
        1000 - LOAD_EDGE_TRIGGER + 10, // Within threshold of right edge
        1000,
        mockCallback
      );

      await waitForCallbacks();
      expect(mockCallback.calls).toHaveLength(1);
      expect(mockCallback.calls[0].direction).toBe('future');
    });

    it('should trigger both callbacks when close to both edges', async () => {
      const mockCallback = createMockCallback();

      checkAutoLoadTrigger(
        LOAD_EDGE_TRIGGER - 10, // Close to left edge
        1000 - LOAD_EDGE_TRIGGER + 10, // Close to right edge
        1000,
        mockCallback
      );

      await waitForCallbacks();
      expect(mockCallback.calls).toHaveLength(2);
      expect(mockCallback.calls[0].direction).toBe('past');
      expect(mockCallback.calls[1].direction).toBe('future');
    });
  });

  describe('threshold boundaries', () => {
    it('should trigger past callback at exact threshold', async () => {
      const mockCallback = createMockCallback();

      checkAutoLoadTrigger(
        LOAD_EDGE_TRIGGER, // Exactly at threshold
        200,
        1000,
        mockCallback
      );

      await waitForCallbacks();
      expect(mockCallback.calls).toHaveLength(1);
      expect(mockCallback.calls[0].direction).toBe('past');
    });

    it('should trigger future callback at exact threshold', async () => {
      const mockCallback = createMockCallback();

      checkAutoLoadTrigger(
        LOAD_EDGE_TRIGGER + 10, // Far from left edge
        1000 - 1 - LOAD_EDGE_TRIGGER, // Exactly at threshold
        1000,
        mockCallback
      );

      await waitForCallbacks();
      expect(mockCallback.calls).toHaveLength(1);
      expect(mockCallback.calls[0].direction).toBe('future');
    });

    it('should not trigger past callback just beyond threshold', () => {
      const mockCallback = createMockCallback();

      checkAutoLoadTrigger(
        LOAD_EDGE_TRIGGER + 1, // Just beyond threshold
        200,
        1000,
        mockCallback
      );

      expect(mockCallback.calls).toHaveLength(0);
    });

    it('should not trigger future callback just beyond threshold', () => {
      const mockCallback = createMockCallback();

      checkAutoLoadTrigger(
        200,
        1000 - 1 - LOAD_EDGE_TRIGGER - 1, // Just beyond threshold
        1000,
        mockCallback
      );

      expect(mockCallback.calls).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('should handle zero data length', () => {
      const mockCallback = createMockCallback();

      checkAutoLoadTrigger(0, 0, 0, mockCallback);

      expect(mockCallback.calls).toHaveLength(0);
    });

    it('should handle single data point', async () => {
      const mockCallback = createMockCallback();

      checkAutoLoadTrigger(0, 0, 1, mockCallback);

      await waitForCallbacks();
      // Single data point triggers both past and future since it's at both edges
      expect(mockCallback.calls).toHaveLength(2);
      expect(mockCallback.calls[0].direction).toBe('past');
      expect(mockCallback.calls[1].direction).toBe('future');
    });

    it('should handle negative viewport indices', async () => {
      const mockCallback = createMockCallback();

      checkAutoLoadTrigger(
        -10, // Negative start
        50,
        1000,
        mockCallback
      );

      await waitForCallbacks();
      expect(mockCallback.calls).toHaveLength(1);
      expect(mockCallback.calls[0].direction).toBe('past');
    });

    it('should handle viewport extending beyond data', async () => {
      const mockCallback = createMockCallback();

      checkAutoLoadTrigger(
        LOAD_EDGE_TRIGGER + 10, // Far from left edge
        1200, // Beyond data length
        1000,
        mockCallback
      );

      await waitForCallbacks();
      expect(mockCallback.calls).toHaveLength(1);
      expect(mockCallback.calls[0].direction).toBe('future');
    });
  });

  describe('ref object handling', () => {
    it('should update loadRequestedLeft ref when triggering past callback', async () => {
      const mockCallback = createMockCallback();
      const loadRequestedLeft = createMockRef(false);
      const lastLoadDataLengthLeft = createMockRef<number | null>(null);

      checkAutoLoadTrigger(
        LOAD_EDGE_TRIGGER - 10,
        200,
        1000,
        mockCallback,
        loadRequestedLeft,
        undefined,
        lastLoadDataLengthLeft
      );

      expect(loadRequestedLeft.current).toBe(true);
      expect(lastLoadDataLengthLeft.current).toBe(1000);
      await waitForCallbacks();
      expect(mockCallback.calls).toHaveLength(1);
    });

    it('should update loadRequestedRight ref when triggering future callback', async () => {
      const mockCallback = createMockCallback();
      const loadRequestedRight = createMockRef(false);
      const lastLoadDataLengthRight = createMockRef<number | null>(null);

      checkAutoLoadTrigger(
        LOAD_EDGE_TRIGGER + 10, // Far from left edge
        1000 - LOAD_EDGE_TRIGGER + 10,
        1000,
        mockCallback,
        undefined,
        loadRequestedRight,
        undefined,
        lastLoadDataLengthRight
      );

      expect(loadRequestedRight.current).toBe(true);
      expect(lastLoadDataLengthRight.current).toBe(1000);
      await waitForCallbacks();
      expect(mockCallback.calls).toHaveLength(1);
    });

    it('should not trigger callback when already requested (left)', () => {
      const mockCallback = createMockCallback();
      const loadRequestedLeft = createMockRef(true); // Already requested

      checkAutoLoadTrigger(LOAD_EDGE_TRIGGER - 10, 200, 1000, mockCallback, loadRequestedLeft);

      expect(mockCallback.calls).toHaveLength(0);
    });

    it('should not trigger callback when already requested (right)', () => {
      const mockCallback = createMockCallback();
      const loadRequestedRight = createMockRef(true); // Already requested

      checkAutoLoadTrigger(200, 1000 - LOAD_EDGE_TRIGGER + 10, 1000, mockCallback, undefined, loadRequestedRight);

      expect(mockCallback.calls).toHaveLength(0);
    });
  });

  describe('data length change handling', () => {
    it('should reset left lock when data length changes', async () => {
      const mockCallback = createMockCallback();
      const loadRequestedLeft = createMockRef(true);
      const lastLoadDataLengthLeft = createMockRef(500); // Previous data length

      checkAutoLoadTrigger(
        LOAD_EDGE_TRIGGER - 10,
        200,
        1000, // New data length (different from 500)
        mockCallback,
        loadRequestedLeft,
        undefined,
        lastLoadDataLengthLeft
      );

      // The ref should be reset to false initially, then set to true when callback is triggered
      expect(loadRequestedLeft.current).toBe(true); // Set to true when callback is triggered
      expect(lastLoadDataLengthLeft.current).toBe(1000); // Updated to new data length
      await waitForCallbacks();
      expect(mockCallback.calls).toHaveLength(1); // Should trigger after reset
    });

    it('should reset right lock when data length changes', async () => {
      const mockCallback = createMockCallback();
      const loadRequestedRight = createMockRef(true);
      const lastLoadDataLengthRight = createMockRef(500); // Previous data length

      checkAutoLoadTrigger(
        LOAD_EDGE_TRIGGER + 10, // Far from left edge
        1000 - LOAD_EDGE_TRIGGER + 10,
        1000, // New data length (different from 500)
        mockCallback,
        undefined,
        loadRequestedRight,
        undefined,
        lastLoadDataLengthRight
      );

      // The ref should be reset to false initially, then set to true when callback is triggered
      expect(loadRequestedRight.current).toBe(true); // Set to true when callback is triggered
      expect(lastLoadDataLengthRight.current).toBe(1000); // Updated to new data length
      await waitForCallbacks();
      expect(mockCallback.calls).toHaveLength(1); // Should trigger after reset
    });

    it('should not reset lock when data length is the same', () => {
      const mockCallback = createMockCallback();
      const loadRequestedLeft = createMockRef(true);
      const lastLoadDataLengthLeft = createMockRef(1000); // Same data length

      checkAutoLoadTrigger(
        LOAD_EDGE_TRIGGER - 10,
        200,
        1000, // Same data length
        mockCallback,
        loadRequestedLeft,
        undefined,
        lastLoadDataLengthLeft
      );

      expect(loadRequestedLeft.current).toBe(true); // Should remain true
      expect(lastLoadDataLengthLeft.current).toBe(1000); // Should remain unchanged
      expect(mockCallback.calls).toHaveLength(0); // Should not trigger
    });
  });

  describe('callback return value handling', () => {
    it('should reset refs when callback returns false (left)', async () => {
      const mockCallback = createMockCallback(false); // Returns false
      const loadRequestedLeft = createMockRef(false);
      const lastLoadDataLengthLeft = createMockRef<number | null>(null);

      checkAutoLoadTrigger(
        LOAD_EDGE_TRIGGER - 10,
        200,
        1000,
        mockCallback,
        loadRequestedLeft,
        undefined,
        lastLoadDataLengthLeft
      );

      // Initially set to true
      expect(loadRequestedLeft.current).toBe(true);
      expect(lastLoadDataLengthLeft.current).toBe(1000);

      await waitForCallbacks();

      // Should be reset to false because callback returned false
      expect(loadRequestedLeft.current).toBe(false);
      expect(lastLoadDataLengthLeft.current).toBe(null);
      expect(mockCallback.calls).toHaveLength(1);
    });

    it('should reset refs when callback returns false (right)', async () => {
      const mockCallback = createMockCallback(false); // Returns false
      const loadRequestedRight = createMockRef(false);
      const lastLoadDataLengthRight = createMockRef<number | null>(null);

      checkAutoLoadTrigger(
        LOAD_EDGE_TRIGGER + 10, // Far from left edge
        1000 - LOAD_EDGE_TRIGGER + 10,
        1000,
        mockCallback,
        undefined,
        loadRequestedRight,
        undefined,
        lastLoadDataLengthRight
      );

      // Initially set to true
      expect(loadRequestedRight.current).toBe(true);
      expect(lastLoadDataLengthRight.current).toBe(1000);

      await waitForCallbacks();

      // Should be reset to false because callback returned false
      expect(loadRequestedRight.current).toBe(false);
      expect(lastLoadDataLengthRight.current).toBe(null);
      expect(mockCallback.calls).toHaveLength(1);
    });

    it('should keep refs when callback returns true (left)', async () => {
      const mockCallback = createMockCallback(true); // Returns true
      const loadRequestedLeft = createMockRef(false);
      const lastLoadDataLengthLeft = createMockRef<number | null>(null);

      checkAutoLoadTrigger(
        LOAD_EDGE_TRIGGER - 10,
        200,
        1000,
        mockCallback,
        loadRequestedLeft,
        undefined,
        lastLoadDataLengthLeft
      );

      // Initially set to true
      expect(loadRequestedLeft.current).toBe(true);
      expect(lastLoadDataLengthLeft.current).toBe(1000);

      await waitForCallbacks();

      // Should remain true because callback returned true
      expect(loadRequestedLeft.current).toBe(true);
      expect(lastLoadDataLengthLeft.current).toBe(1000);
      expect(mockCallback.calls).toHaveLength(1);
    });
  });

  describe('callback timing', () => {
    it('should call callback asynchronously with setTimeout', async () => {
      const mockCallback = createMockCallback();
      const startTime = Date.now();

      checkAutoLoadTrigger(LOAD_EDGE_TRIGGER - 10, 200, 1000, mockCallback);

      // Callback should not be called immediately
      expect(mockCallback.calls).toHaveLength(0);

      // Wait for setTimeout to execute
      await waitForCallbacks();
      expect(mockCallback.calls).toHaveLength(1);
      expect(mockCallback.calls[0].timestamp).toBeGreaterThanOrEqual(startTime);
    });
  });

  describe('console logging', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should log auto-load check information', () => {
      const mockCallback = createMockCallback();

      checkAutoLoadTrigger(100, 200, 1000, mockCallback);

      expect(consoleSpy).toHaveBeenCalledWith('🔍 Auto-load check:', {
        viewport: '100-200',
        totalDataLength: 1000,
        distanceLeft: 100,
        distanceRight: 799,
        threshold: LOAD_EDGE_TRIGGER,
        loadRequestedLeft: undefined,
        loadRequestedRight: undefined,
      });
    });

    it('should log when triggering past data load', () => {
      const mockCallback = createMockCallback();

      checkAutoLoadTrigger(LOAD_EDGE_TRIGGER - 10, 200, 1000, mockCallback);

      expect(consoleSpy).toHaveBeenCalledWith('📊 Triggering auto-load for past data');
    });

    it('should log when triggering future data load', () => {
      const mockCallback = createMockCallback();

      checkAutoLoadTrigger(200, 1000 - LOAD_EDGE_TRIGGER + 10, 1000, mockCallback);

      expect(consoleSpy).toHaveBeenCalledWith('📊 Triggering auto-load for future data');
    });
  });

  describe('integration scenarios', () => {
    it('should handle typical panning scenario', async () => {
      const mockCallback = createMockCallback();
      const loadRequestedLeft = createMockRef(false);
      const loadRequestedRight = createMockRef(false);
      const lastLoadDataLengthLeft = createMockRef<number | null>(null);
      const lastLoadDataLengthRight = createMockRef<number | null>(null);

      // Simulate panning to the left edge
      checkAutoLoadTrigger(
        50, // Close to left edge
        150,
        1000,
        mockCallback,
        loadRequestedLeft,
        loadRequestedRight,
        lastLoadDataLengthLeft,
        lastLoadDataLengthRight
      );

      expect(loadRequestedLeft.current).toBe(true);
      expect(lastLoadDataLengthLeft.current).toBe(1000);
      await waitForCallbacks();
      expect(mockCallback.calls).toHaveLength(1);
      expect(mockCallback.calls[0].direction).toBe('past');
    });

    it('should handle WebSocket update scenario', async () => {
      const mockCallback = createMockCallback();

      // Simulate WebSocket update when viewport is at the right edge
      checkAutoLoadTrigger(
        800,
        950, // Close to right edge
        1000,
        mockCallback
      );

      await waitForCallbacks();
      expect(mockCallback.calls).toHaveLength(1);
      expect(mockCallback.calls[0].direction).toBe('future');
    });

    it('should handle skip-to operation scenario', async () => {
      const mockCallback = createMockCallback();

      // Simulate skip-to operation that places viewport at left edge
      checkAutoLoadTrigger(
        0, // At left edge
        80,
        1000,
        mockCallback
      );

      await waitForCallbacks();
      expect(mockCallback.calls).toHaveLength(1);
      expect(mockCallback.calls[0].direction).toBe('past');
    });
  });
});
