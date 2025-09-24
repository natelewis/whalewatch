import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as d3 from 'd3';
import { renderChart, RenderType, DEFAULT_RENDER_OPTIONS } from '../renderManager';
import { ChartDimensions, CandlestickData } from '../../types';

// Mock the chart rendering functions
vi.mock('../../components/ChartRenderer', () => ({
  renderCandlestickChart: vi.fn((svgElement, calculations, useProvidedViewport) => {
    console.log('🔍 renderCandlestickChart called with:', {
      useProvidedViewport,
      viewStart: calculations.viewStart,
      viewEnd: calculations.viewEnd,
      visibleDataLength: calculations.visibleData.length,
      transformString: calculations.transformString,
    });
  }),
  updateClipPath: vi.fn(),
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

describe('RenderManager Calculation Tests', () => {
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

    // Create test data with 1001 candles (like in the real scenario)
    mockData = Array.from({ length: 1001 }, (_, i) => ({
      timestamp: new Date(2024, 0, 1, i).toISOString(),
      open: 100 + i,
      high: 105 + i,
      low: 95 + i,
      close: 102 + i,
      volume: 1000 + i * 100,
    }));
  });

  describe('Skip-to Calculation Logic', () => {
    it('should use provided viewport indices in calculations object', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = renderChart({
        svgElement: mockSvgElement,
        dimensions: mockDimensions,
        allData: mockData,
        currentViewStart: 573, // From the logs
        currentViewEnd: 652, // From the logs
        options: DEFAULT_RENDER_OPTIONS[RenderType.SKIP_TO],
      });

      expect(result.success).toBe(true);
      expect(result.calculations).toBeDefined();

      // The key test: the calculations object should have the correct viewport
      expect(result.calculations!.viewStart).toBe(573);
      expect(result.calculations!.viewEnd).toBe(652);
      expect(result.calculations!.visibleData.length).toBe(80); // 652 - 573 + 1

      // Check that renderCandlestickChart was called with the correct parameters
      const renderCandlestickChartCall = consoleSpy.mock.calls.find(call =>
        call[0]?.includes('renderCandlestickChart called with:')
      );

      expect(renderCandlestickChartCall).toBeDefined();
      expect(renderCandlestickChartCall![1]).toMatchObject({
        useProvidedViewport: true,
        viewStart: 573,
        viewEnd: 652,
        visibleDataLength: 80,
        transformString: 'translate(0,0) scale(1)',
      });

      consoleSpy.mockRestore();
    });

    it('should demonstrate the exact bug scenario from logs', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // This is the exact scenario from the logs
      const result = renderChart({
        svgElement: mockSvgElement,
        dimensions: mockDimensions,
        allData: mockData,
        currentViewStart: 573,
        currentViewEnd: 652,
        options: DEFAULT_RENDER_OPTIONS[RenderType.SKIP_TO],
      });

      expect(result.success).toBe(true);

      // The bug: result should show viewport '573-652', not '921-1000'
      const resultViewport = `${result.calculations!.viewStart}-${result.calculations!.viewEnd}`;
      expect(resultViewport).toBe('573-652');

      // Check the console output to see what was logged
      const renderCandlestickChartCall = consoleSpy.mock.calls.find(call =>
        call[0]?.includes('renderCandlestickChart called with:')
      );

      expect(renderCandlestickChartCall).toBeDefined();
      const callData = renderCandlestickChartCall![1];

      // The renderCandlestickChart should receive the correct viewport
      expect(callData.viewStart).toBe(573);
      expect(callData.viewEnd).toBe(652);
      expect(callData.useProvidedViewport).toBe(true);

      consoleSpy.mockRestore();
    });
  });

  describe('Panning Calculation Logic', () => {
    it('should use provided viewport indices for panning', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = renderChart({
        svgElement: mockSvgElement,
        dimensions: mockDimensions,
        allData: mockData,
        currentViewStart: 100,
        currentViewEnd: 200,
        options: DEFAULT_RENDER_OPTIONS[RenderType.PANNING],
      });

      expect(result.success).toBe(true);
      expect(result.calculations!.viewStart).toBe(100);
      expect(result.calculations!.viewEnd).toBe(200);
      expect(result.calculations!.visibleData.length).toBe(101); // 200 - 100 + 1

      // Check that renderCandlestickChart was called with the correct parameters
      const renderCandlestickChartCall = consoleSpy.mock.calls.find(call =>
        call[0]?.includes('renderCandlestickChart called with:')
      );

      expect(renderCandlestickChartCall).toBeDefined();
      expect(renderCandlestickChartCall![1]).toMatchObject({
        useProvidedViewport: true,
        viewStart: 100,
        viewEnd: 200,
        visibleDataLength: 101,
      });

      consoleSpy.mockRestore();
    });
  });

  describe('Other Render Types', () => {
    it('should use standard calculation for initial render', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = renderChart({
        svgElement: mockSvgElement,
        dimensions: mockDimensions,
        allData: mockData,
        currentViewStart: 0, // These should be ignored
        currentViewEnd: 100, // These should be ignored
        options: DEFAULT_RENDER_OPTIONS[RenderType.INITIAL],
      });

      expect(result.success).toBe(true);

      // For initial render, it should use the standard calculation
      // which typically shows recent data or full dataset
      expect(result.calculations!.viewStart).toBeGreaterThanOrEqual(0);
      expect(result.calculations!.viewEnd).toBeLessThanOrEqual(mockData.length - 1);

      // Check that renderCandlestickChart was called with useProvidedViewport=false
      const renderCandlestickChartCall = consoleSpy.mock.calls.find(call =>
        call[0]?.includes('renderCandlestickChart called with:')
      );

      expect(renderCandlestickChartCall).toBeDefined();
      expect(renderCandlestickChartCall![1]).toMatchObject({
        useProvidedViewport: false,
      });

      consoleSpy.mockRestore();
    });
  });
});
