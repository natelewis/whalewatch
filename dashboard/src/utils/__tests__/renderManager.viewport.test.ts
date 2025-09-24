import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as d3 from 'd3';
import { renderChart, RenderType, DEFAULT_RENDER_OPTIONS } from '../renderManager';
import { ChartDimensions, CandlestickData } from '../../types';

// Mock the chart rendering functions
vi.mock('../../components/ChartRenderer', () => ({
  renderCandlestickChart: vi.fn(),
  updateClipPath: vi.fn(),
  calculateChartState: vi.fn(({ dimensions, allChartData, transform, fixedYScaleDomain }) => ({
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
    const prices = data.flatMap(d => [d.open, d.high, d.low, d.close]);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const padding = (max - min) * 0.1;
    return [min - padding, max + padding];
  }),
}));

describe('RenderManager Viewport Calculation Tests', () => {
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

  describe('Skip-to Viewport Calculation', () => {
    it('should use provided viewport indices instead of calculating from transform', () => {
      const providedViewStart = 2;
      const providedViewEnd = 5;

      // This test would catch the bug where skip-to was using calculateChartState
      // instead of the custom viewport calculation
      const result = renderChart({
        svgElement: mockSvgElement,
        dimensions: mockDimensions,
        allData: mockData,
        currentViewStart: providedViewStart,
        currentViewEnd: providedViewEnd,
        options: DEFAULT_RENDER_OPTIONS[RenderType.SKIP_TO],
      });

      expect(result.success).toBe(true);
      expect(result.calculations).toBeDefined();

      // The key assertion: viewport should match what we provided
      expect(result.calculations!.viewStart).toBe(providedViewStart);
      expect(result.calculations!.viewEnd).toBe(providedViewEnd);

      // Should NOT be the default viewport (0 to data.length-1)
      expect(result.calculations!.viewStart).not.toBe(0);
      expect(result.calculations!.viewEnd).not.toBe(mockData.length - 1);

      // Visible data should be the correct slice
      const expectedVisibleData = mockData.slice(providedViewStart, providedViewEnd + 1);
      expect(result.calculations!.visibleData).toEqual(expectedVisibleData);
      expect(result.calculations!.visibleData.length).toBe(4); // 5 - 2 + 1
    });

    it('should handle edge case viewport indices', () => {
      const edgeViewStart = 0;
      const edgeViewEnd = 9; // Last index

      const result = renderChart({
        svgElement: mockSvgElement,
        dimensions: mockDimensions,
        allData: mockData,
        currentViewStart: edgeViewStart,
        currentViewEnd: edgeViewEnd,
        options: DEFAULT_RENDER_OPTIONS[RenderType.SKIP_TO],
      });

      expect(result.success).toBe(true);
      expect(result.calculations!.viewStart).toBe(edgeViewStart);
      expect(result.calculations!.viewEnd).toBe(edgeViewEnd);
      expect(result.calculations!.visibleData.length).toBe(10); // All data
    });

    it('should handle single candle viewport', () => {
      const singleViewStart = 3;
      const singleViewEnd = 3; // Same as start

      const result = renderChart({
        svgElement: mockSvgElement,
        dimensions: mockDimensions,
        allData: mockData,
        currentViewStart: singleViewStart,
        currentViewEnd: singleViewEnd,
        options: DEFAULT_RENDER_OPTIONS[RenderType.SKIP_TO],
      });

      expect(result.success).toBe(true);
      expect(result.calculations!.viewStart).toBe(singleViewStart);
      expect(result.calculations!.viewEnd).toBe(singleViewEnd);
      expect(result.calculations!.visibleData.length).toBe(1);
      expect(result.calculations!.visibleData[0]).toBe(mockData[3]);
    });
  });

  describe('Panning Viewport Calculation', () => {
    it('should use provided viewport indices for panning operations', () => {
      const panViewStart = 1;
      const panViewEnd = 4;

      const result = renderChart({
        svgElement: mockSvgElement,
        dimensions: mockDimensions,
        allData: mockData,
        currentViewStart: panViewStart,
        currentViewEnd: panViewEnd,
        options: DEFAULT_RENDER_OPTIONS[RenderType.PANNING],
      });

      expect(result.success).toBe(true);
      expect(result.calculations!.viewStart).toBe(panViewStart);
      expect(result.calculations!.viewEnd).toBe(panViewEnd);
      expect(result.calculations!.visibleData.length).toBe(4); // 4 - 1 + 1
    });
  });

  describe('Other Render Types', () => {
    it('should use standard calculation for initial render', () => {
      const result = renderChart({
        svgElement: mockSvgElement,
        dimensions: mockDimensions,
        allData: mockData,
        currentViewStart: 0, // These should be ignored for initial render
        currentViewEnd: 5, // These should be ignored for initial render
        options: DEFAULT_RENDER_OPTIONS[RenderType.INITIAL],
      });

      expect(result.success).toBe(true);
      expect(result.calculations).toBeDefined();

      // For initial render, it should use the standard calculation
      // which typically shows the full dataset or recent data
      expect(result.calculations!.viewStart).toBeGreaterThanOrEqual(0);
      expect(result.calculations!.viewEnd).toBeLessThanOrEqual(mockData.length - 1);
    });

    it('should use standard calculation for WebSocket render', () => {
      const result = renderChart({
        svgElement: mockSvgElement,
        dimensions: mockDimensions,
        allData: mockData,
        currentViewStart: 0, // These should be ignored for WebSocket render
        currentViewEnd: 5, // These should be ignored for WebSocket render
        options: DEFAULT_RENDER_OPTIONS[RenderType.WEBSOCKET],
      });

      expect(result.success).toBe(true);
      expect(result.calculations).toBeDefined();

      // For WebSocket render, it should use the standard calculation
      expect(result.calculations!.viewStart).toBeGreaterThanOrEqual(0);
      expect(result.calculations!.viewEnd).toBeLessThanOrEqual(mockData.length - 1);
    });
  });

  describe('Error Cases', () => {
    it('should handle invalid viewport indices gracefully', () => {
      const result = renderChart({
        svgElement: mockSvgElement,
        dimensions: mockDimensions,
        allData: mockData,
        currentViewStart: -1, // Invalid
        currentViewEnd: 5,
        options: DEFAULT_RENDER_OPTIONS[RenderType.SKIP_TO],
      });

      expect(result.success).toBe(true); // Error handling is working correctly
      expect(result.error).toBeUndefined();
    });

    it('should handle viewport indices beyond data range', () => {
      const result = renderChart({
        svgElement: mockSvgElement,
        dimensions: mockDimensions,
        allData: mockData,
        currentViewStart: 5,
        currentViewEnd: 15, // Beyond data length (10)
        options: DEFAULT_RENDER_OPTIONS[RenderType.SKIP_TO],
      });

      expect(result.success).toBe(true); // Error handling is working correctly
      expect(result.error).toBeUndefined();
    });

    it('should handle start index greater than end index', () => {
      const result = renderChart({
        svgElement: mockSvgElement,
        dimensions: mockDimensions,
        allData: mockData,
        currentViewStart: 5,
        currentViewEnd: 3, // Less than start
        options: DEFAULT_RENDER_OPTIONS[RenderType.SKIP_TO],
      });

      expect(result.success).toBe(true); // Error handling is working correctly
      expect(result.error).toBeUndefined();
    });
  });
});
