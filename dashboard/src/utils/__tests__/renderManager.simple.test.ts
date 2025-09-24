import { describe, it, expect } from 'vitest';
import { RenderType, DEFAULT_RENDER_OPTIONS } from '../renderManager';

describe('Simple Render Manager Test', () => {
  it('should have correct default options for skip-to', () => {
    const skipToOptions = DEFAULT_RENDER_OPTIONS[RenderType.SKIP_TO];

    expect(skipToOptions.type).toBe(RenderType.SKIP_TO);
    expect(skipToOptions.recalculateYScale).toBe(true);
    expect(skipToOptions.skipToNewest).toBe(false);
    expect(skipToOptions.preserveTransform).toBe(false);
    expect(skipToOptions.triggerDataLoading).toBe(true);
  });

  it('should have correct default options for panning', () => {
    const panningOptions = DEFAULT_RENDER_OPTIONS[RenderType.PANNING];

    expect(panningOptions.type).toBe(RenderType.PANNING);
    expect(panningOptions.recalculateYScale).toBe(true);
    expect(panningOptions.skipToNewest).toBe(false);
    expect(panningOptions.preserveTransform).toBe(false);
    expect(panningOptions.triggerDataLoading).toBe(false);
  });

  it('should have correct enum values', () => {
    expect(RenderType.SKIP_TO).toBe('skip_to');
    expect(RenderType.PANNING).toBe('panning');
    expect(RenderType.INITIAL).toBe('initial');
    expect(RenderType.WEBSOCKET).toBe('websocket');
  });
});
