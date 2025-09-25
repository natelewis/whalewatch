import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderSkipTo, renderPanning, RenderType, DEFAULT_RENDER_OPTIONS } from '../renderManager';
import { ChartDimensions, CandlestickData } from '../../types';

// Mock the chart rendering functions
vi.mock('../../components/ChartRenderer', () => ({
  renderCandlestickChart: vi.fn(),
  updateClipPath: vi.fn(),
  calculateChartState: vi.fn(({ allChartData, transform }) => ({
    viewStart: 0,
    viewEnd: allChartData.length - 1,
    visibleData: allChartData,
    transformString: transform.toString(),
    viewportXScale: vi.fn(),
  })),
}));

vi.mock('../chartDataUtils', () => ({
  calculateInnerDimensions: vi.fn(() => ({ innerWidth: 800, innerHeight: 400 })),
  isValidChartData: vi.fn(() => true),
}));

vi.mock('../memoizedChartUtils', () => ({
  memoizedCalculateYScaleDomain: vi.fn(data => {
    if (data.length === 0) {
      return [0, 1];
    }
    const prices = data.flatMap((d: CandlestickData) => [d.open, d.high, d.low, d.close]);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const padding = (max - min) * 0.1;
    return [min - padding, max + padding];
  }),
}));

describe('RenderManager Comprehensive Tests', () => {
  let mockSvgElement: SVGSVGElement;
  let mockDimensions: ChartDimensions;
  let mockData: CandlestickData[];

  beforeEach(() => {
    // Create a mock SVG element
    mockSvgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
    mockSvgElement.setAttribute('width', '800');
    mockSvgElement.setAttribute('height', '400');

    // Add required chart structure
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
    clipPath.setAttribute('id', 'chart-clip');
    defs.appendChild(clipPath);
    mockSvgElement.appendChild(defs);

    const chartContent = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    chartContent.setAttribute('class', 'chart-content');
    mockSvgElement.appendChild(chartContent);

    mockDimensions = {
      width: 800,
      height: 400,
      margin: { top: 20, right: 20, bottom: 40, left: 60 },
    };

    // Create test data with 10 candles
    mockData = Array.from({ length: 10 }, (_, i) => ({
      timestamp: new Date(2024, 0, 1, i).toISOString(),
      open: 100 + i,
      high: 105 + i,
      low: 95 + i,
      close: 102 + i,
      volume: 1000 + i * 100,
    }));
  });

  describe('Viewport Calculation Accuracy', () => {
    it('should use provided viewport indices for skip-to operations', () => {
      const viewStart = 2;
      const viewEnd = 5;

      const result = renderSkipTo(mockSvgElement, mockDimensions, mockData, viewStart, viewEnd, d3.zoomIdentity, null);

      expect(result.success).toBe(true);
      expect(result.calculations).toBeDefined();
      expect(result.calculations!.viewStart).toBe(viewStart);
      expect(result.calculations!.viewEnd).toBe(viewEnd);
      expect(result.calculations!.visibleData.length).toBe(viewEnd - viewStart + 1);

      // Verify the visible data slice is correct
      const expectedVisibleData = mockData.slice(viewStart, viewEnd + 1);
      expect(result.calculations!.visibleData).toEqual(expectedVisibleData);
    });

    it('should use provided viewport indices for panning operations', () => {
      const viewStart = 1;
      const viewEnd = 4;

      const result = renderPanning(mockSvgElement, mockDimensions, mockData, viewStart, viewEnd, d3.zoomIdentity, null);

      expect(result.success).toBe(true);
      expect(result.calculations).toBeDefined();
      expect(result.calculations!.viewStart).toBe(viewStart);
      expect(result.calculations!.viewEnd).toBe(viewEnd);
      expect(result.calculations!.visibleData.length).toBe(viewEnd - viewStart + 1);
    });

    it('should not override provided viewport with calculated viewport for skip-to', () => {
      const providedViewStart = 3;
      const providedViewEnd = 7;

      // This test ensures that skip-to doesn't fall back to calculateChartState
      // which would calculate its own viewport based on transform
      const result = renderSkipTo(
        mockSvgElement,
        mockDimensions,
        mockData,
        providedViewStart,
        providedViewEnd,
        d3.zoomIdentity,
        null
      );

      expect(result.success).toBe(true);
      expect(result.calculations!.viewStart).toBe(providedViewStart);
      expect(result.calculations!.viewEnd).toBe(providedViewEnd);

      // The viewport should NOT be the default (0 to data.length-1)
      expect(result.calculations!.viewStart).not.toBe(0);
      expect(result.calculations!.viewEnd).not.toBe(mockData.length - 1);
    });
  });

  describe('Y-Scale Domain Calculation', () => {
    it('should recalculate Y-scale domain for skip-to operations', () => {
      const viewStart = 2;
      const viewEnd = 4;

      const result = renderSkipTo(mockSvgElement, mockDimensions, mockData, viewStart, viewEnd, d3.zoomIdentity, null);

      expect(result.success).toBe(true);
      expect(result.yScaleRecalculated).toBe(true);
      expect(result.newFixedYScaleDomain).toBeDefined();
      expect(result.newFixedYScaleDomain).not.toBeNull();

      // Verify the Y-scale domain is based on visible data
      const visibleData = mockData.slice(viewStart, viewEnd + 1);
      const prices = visibleData.flatMap(d => [d.open, d.high, d.low, d.close]);
      const min = Math.min(...prices);
      const max = Math.max(...prices);

      expect(result.newFixedYScaleDomain![0]).toBeLessThanOrEqual(min);
      expect(result.newFixedYScaleDomain![1]).toBeGreaterThanOrEqual(max);
    });

    it('should recalculate Y-scale domain for panning operations', () => {
      const viewStart = 1;
      const viewEnd = 3;

      const result = renderPanning(mockSvgElement, mockDimensions, mockData, viewStart, viewEnd, d3.zoomIdentity, null);

      expect(result.success).toBe(true);
      expect(result.yScaleRecalculated).toBe(true);
      expect(result.newFixedYScaleDomain).toBeDefined();
    });
  });

  describe('Transform Handling', () => {
    it('should not preserve transform for skip-to operations', () => {
      const customTransform = d3.zoomIdentity.translate(100, 50).scale(1.5);

      const result = renderSkipTo(mockSvgElement, mockDimensions, mockData, 2, 5, customTransform, null);

      expect(result.success).toBe(true);
      expect(result.calculations!.transformString).toBe('translate(0,0) scale(1)');
    });

    it('should not preserve transform for panning operations', () => {
      const customTransform = d3.zoomIdentity.translate(100, 50).scale(1.5);

      const result = renderPanning(mockSvgElement, mockDimensions, mockData, 2, 5, customTransform, null);

      expect(result.success).toBe(true);
      expect(result.calculations!.transformString).toBe('translate(0,0) scale(1)');
    });
  });

  describe('Error Handling', () => {
    it('should handle empty data gracefully', () => {
      const result = renderSkipTo(mockSvgElement, mockDimensions, [], 0, 0, d3.zoomIdentity, null);

      expect(result.success).toBe(false); // Empty data should fail gracefully
      expect(result.error).toBe('No data to render');
    });

    it('should handle invalid viewport indices', () => {
      const result = renderSkipTo(
        mockSvgElement,
        mockDimensions,
        mockData,
        -1, // Invalid start
        5,
        d3.zoomIdentity,
        null
      );

      expect(result.success).toBe(true); // Error handling is working correctly
      expect(result.error).toBeUndefined();
    });

    it('should handle viewport indices beyond data range', () => {
      const result = renderSkipTo(
        mockSvgElement,
        mockDimensions,
        mockData,
        5,
        15, // Beyond data length
        d3.zoomIdentity,
        null
      );

      expect(result.success).toBe(true); // Error handling is working correctly
      expect(result.error).toBeUndefined();
    });
  });

  describe('Render Options Validation', () => {
    it('should use correct default options for skip-to', () => {
      const skipToOptions = DEFAULT_RENDER_OPTIONS[RenderType.SKIP_TO];

      expect(skipToOptions.type).toBe(RenderType.SKIP_TO);
      expect(skipToOptions.recalculateYScale).toBe(true);
      expect(skipToOptions.skipToNewest).toBe(false);
      expect(skipToOptions.preserveTransform).toBe(false);
      expect(skipToOptions.triggerDataLoading).toBe(true);
    });

    it('should use correct default options for panning', () => {
      const panningOptions = DEFAULT_RENDER_OPTIONS[RenderType.PANNING];

      expect(panningOptions.type).toBe(RenderType.PANNING);
      expect(panningOptions.recalculateYScale).toBe(true);
      expect(panningOptions.skipToNewest).toBe(false);
      expect(panningOptions.preserveTransform).toBe(false);
      expect(panningOptions.triggerDataLoading).toBe(false);
    });
  });

  describe('Integration with Chart State', () => {
    it('should create proper chart calculations object', () => {
      const viewStart = 2;
      const viewEnd = 6;

      const result = renderSkipTo(mockSvgElement, mockDimensions, mockData, viewStart, viewEnd, d3.zoomIdentity, null);

      expect(result.success).toBe(true);
      expect(result.calculations).toBeDefined();

      const calc = result.calculations!;
      expect(calc.innerWidth).toBe(800);
      expect(calc.innerHeight).toBe(400);
      expect(calc.viewStart).toBe(viewStart);
      expect(calc.viewEnd).toBe(viewEnd);
      expect(calc.visibleData.length).toBe(viewEnd - viewStart + 1);
      expect(calc.allData).toBe(mockData);
      expect(calc.transformString).toBe('translate(0,0) scale(1)');

      // Verify scales are created
      expect(calc.baseXScale).toBeDefined();
      expect(calc.baseYScale).toBeDefined();
      expect(calc.transformedXScale).toBeDefined();
      expect(calc.transformedYScale).toBeDefined();
    });
  });

  describe('Performance and Memory', () => {
    it('should handle large datasets efficiently', () => {
      // Create a larger dataset
      const largeData = Array.from({ length: 1000 }, (_, i) => ({
        timestamp: new Date(2024, 0, 1, i).toISOString(),
        open: 100 + Math.random() * 10,
        high: 105 + Math.random() * 10,
        low: 95 + Math.random() * 10,
        close: 102 + Math.random() * 10,
        volume: 1000 + i * 100,
      }));

      const viewStart = 100;
      const viewEnd = 200;

      const result = renderSkipTo(mockSvgElement, mockDimensions, largeData, viewStart, viewEnd, d3.zoomIdentity, null);

      expect(result.success).toBe(true);
      expect(result.calculations!.visibleData.length).toBe(101); // 200 - 100 + 1
    });
  });
});
