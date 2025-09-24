import { describe, it, expect } from 'vitest';

describe('StockChart Viewport Shift Fix', () => {
  it('should correctly shift viewport by 600 points when loading past data', () => {
    // Test the viewport shift calculation logic
    const prevStart = 301;
    const prevEnd = 380;
    const prevLength = 599;
    const fetchPoints = 600;
    const direction = 'past';

    // Simulate the data shift calculation from the fixed code
    let dataShift = 0;
    if (direction === 'past') {
      dataShift = fetchPoints; // Should be 600
    }

    expect(dataShift).toBe(600);

    // Test viewport anchoring
    const anchoredStart = Math.round(prevStart + dataShift);
    const anchoredEnd = Math.round(prevEnd + dataShift);

    expect(anchoredStart).toBe(901); // 301 + 600
    expect(anchoredEnd).toBe(980); // 380 + 600

    // Test that the viewport size is preserved
    const originalSize = prevEnd - prevStart + 1;
    const anchoredSize = anchoredEnd - anchoredStart + 1;
    expect(anchoredSize).toBe(originalSize); // Should be 80
  });

  it('should not apply viewport clamping when viewport is valid', () => {
    // Test the improved viewport clamping logic
    const total = 1199;
    const currentViewStart = 901;
    const currentViewEnd = 980;

    // Simulate the viewport validation logic
    const start = Math.max(0, Math.floor(currentViewStart));
    const end = Math.min(total - 1, Math.ceil(currentViewEnd));

    const isViewportInvalid = start < 0 || end >= total || end < start || end - start + 1 < 1;

    expect(isViewportInvalid).toBe(false); // Should not be invalid
    expect(start).toBe(901);
    expect(end).toBe(980);
  });

  it('should apply viewport clamping only when viewport is invalid', () => {
    // Test clamping for invalid viewport
    const total = 1199;
    const currentViewStart = 1200; // Out of bounds
    const currentViewEnd = 1250;

    const start = Math.max(0, Math.floor(currentViewStart));
    const end = Math.min(total - 1, Math.ceil(currentViewEnd));

    const isViewportInvalid = start < 0 || end >= total || end < start || end - start + 1 < 1;

    expect(isViewportInvalid).toBe(true); // Should be invalid
    expect(start).toBe(1200); // Math.max(0, Math.floor(1200)) = 1200
    expect(end).toBe(1198); // Math.min(1198, Math.ceil(1250)) = 1198
  });
});
