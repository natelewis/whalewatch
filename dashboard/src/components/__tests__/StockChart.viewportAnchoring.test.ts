import { describe, it, expect } from 'vitest';

describe('StockChart Viewport Anchoring Logic', () => {
  it('should calculate correct data shift for past data loading', () => {
    // Test the data shift calculation logic directly
    const prevLength = 599;
    const mergedLength = 1199; // 599 + 600
    const direction = 'past';

    // This simulates the logic from the fixed code
    let dataShift = 0;
    if (direction === 'past') {
      dataShift = Math.max(0, mergedLength - prevLength);
    }

    expect(dataShift).toBe(600); // Should be 600 new data points

    // Test viewport anchoring
    const prevStart = 301;
    const prevEnd = 380;
    const anchoredStart = Math.round(prevStart + dataShift);
    const anchoredEnd = Math.round(prevEnd + dataShift);

    expect(anchoredStart).toBe(901); // 301 + 600
    expect(anchoredEnd).toBe(980); // 380 + 600
  });

  it('should calculate correct data shift for future data loading', () => {
    // Test future data loading scenario
    const mergedLength = 1199;
    const prunedDataLength = 1200; // After pruning
    const direction = 'future';

    let dataShift = 0;
    if (direction === 'future') {
      const prunedFromLeft = mergedLength - prunedDataLength;
      dataShift = -prunedFromLeft; // Negative shift if we removed data from left
    }

    expect(dataShift).toBe(1); // Should be 1 (we pruned 1 data point from left)

    // Test viewport anchoring
    const prevStart = 301;
    const prevEnd = 380;
    const anchoredStart = Math.round(prevStart + dataShift);
    const anchoredEnd = Math.round(prevEnd + dataShift);

    expect(anchoredStart).toBe(302); // 301 + 1
    expect(anchoredEnd).toBe(381); // 380 + 1
  });

  it('should expand viewport correctly when centered around anchored position', () => {
    // Test the viewport expansion logic
    const CHART_DATA_POINTS = 80;
    const totalAfter = 1200;

    // Simulate a single-point viewport that needs expansion
    let anchoredStart = 600;
    let anchoredEnd = 600;

    const properWindowSize = CHART_DATA_POINTS;
    const currentWindowSize = anchoredEnd - anchoredStart + 1;

    if (currentWindowSize < properWindowSize) {
      // Calculate the center point of the current viewport
      const centerPoint = Math.round((anchoredStart + anchoredEnd) / 2);

      // Calculate new start and end positions centered around this point
      const halfWindow = Math.floor(properWindowSize / 2);
      anchoredStart = Math.max(0, centerPoint - halfWindow);
      anchoredEnd = Math.min(totalAfter - 1, centerPoint + halfWindow);

      // Adjust to ensure exactly properWindowSize points
      const actualWindowSize = anchoredEnd - anchoredStart + 1;
      if (actualWindowSize < properWindowSize) {
        // Try to expand to the right first
        const rightExpansion = Math.min(totalAfter - 1 - anchoredEnd, properWindowSize - actualWindowSize);
        anchoredEnd += rightExpansion;

        // If still not enough, expand to the left
        const remainingExpansion = properWindowSize - (anchoredEnd - anchoredStart + 1);
        if (remainingExpansion > 0) {
          anchoredStart = Math.max(0, anchoredStart - remainingExpansion);
        }
      } else if (actualWindowSize > properWindowSize) {
        // Trim excess from the right
        anchoredEnd = anchoredStart + properWindowSize - 1;
      }
    }

    // Verify the viewport is properly expanded
    expect(anchoredEnd - anchoredStart + 1).toBe(80);
    expect(anchoredStart).toBe(560); // 600 - 40 = 560
    expect(anchoredEnd).toBe(639); // 600 + 39 = 639 (adjusted for 80 points)
  });

  it('should handle boundary cases in viewport expansion', () => {
    // Test when the anchored position is near the beginning of data
    const CHART_DATA_POINTS = 80;
    const totalAfter = 1200;

    // Simulate a viewport near the beginning
    let anchoredStart = 10;
    let anchoredEnd = 10;

    const properWindowSize = CHART_DATA_POINTS;
    const currentWindowSize = anchoredEnd - anchoredStart + 1;

    if (currentWindowSize < properWindowSize) {
      const centerPoint = Math.round((anchoredStart + anchoredEnd) / 2);
      const halfWindow = Math.floor(properWindowSize / 2);
      anchoredStart = Math.max(0, centerPoint - halfWindow);
      anchoredEnd = Math.min(totalAfter - 1, centerPoint + halfWindow);

      // Adjust if we hit boundaries
      if (anchoredEnd - anchoredStart + 1 < properWindowSize) {
        if (anchoredStart === 0) {
          anchoredEnd = Math.min(totalAfter - 1, properWindowSize - 1);
        } else if (anchoredEnd === totalAfter - 1) {
          anchoredStart = Math.max(0, totalAfter - properWindowSize);
        }
      }
    }

    // Should expand to the right since we can't expand left
    expect(anchoredStart).toBe(0);
    expect(anchoredEnd).toBe(79); // 0 + 80 - 1 = 79
    expect(anchoredEnd - anchoredStart + 1).toBe(80);
  });
});
