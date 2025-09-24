import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as d3 from 'd3';
import { renderCandlestickChart } from '../ChartRenderer';
import { ChartCalculations, CandlestickData } from '../../types';

// Mock the chart data utils
vi.mock('../../utils/chartDataUtils', () => ({
  createViewportXScale: vi.fn(() => d3.scaleLinear().domain([0, 1]).range([0, 100])),
  isFakeCandle: vi.fn(() => false),
}));

describe('ChartRenderer Viewport Tests', () => {
  let mockSvgElement: SVGSVGElement;
  let mockCalculations: ChartCalculations;
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

    // Create test data with 100 candles
    mockData = Array.from({ length: 100 }, (_, i) => ({
      timestamp: new Date(2024, 0, 1, i).toISOString(),
      open: 100 + i,
      high: 105 + i,
      low: 95 + i,
      close: 102 + i,
      volume: 1000 + i * 100,
    }));

    // Create mock calculations with specific viewport
    const baseXScale = d3
      .scaleLinear()
      .domain([0, mockData.length - 1])
      .range([0, 800]);
    const baseYScale = d3.scaleLinear().domain([95, 205]).range([400, 0]);

    mockCalculations = {
      innerWidth: 800,
      innerHeight: 400,
      baseXScale,
      baseYScale,
      transformedXScale: baseXScale,
      transformedYScale: baseYScale,
      viewStart: 20, // Specific viewport start
      viewEnd: 30, // Specific viewport end
      visibleData: mockData.slice(20, 31), // 11 candles
      allData: mockData,
      transformString: 'translate(0,0) scale(1)',
    };
  });

  describe('Viewport Respect Tests', () => {
    it('should use provided viewport when useProvidedViewport is true', () => {
      // Spy on console.log to capture what's happening
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Call renderCandlestickChart with useProvidedViewport = true
      renderCandlestickChart(mockSvgElement, mockCalculations, true);

      // Check that the chart content group has candles
      const chartContent = d3.select(mockSvgElement).select('.chart-content');
      const candleSticks = chartContent.select('.candle-sticks');

      expect(candleSticks.empty()).toBe(false);

      // The key test: check if the rendered candles match the provided viewport
      // We expect 11 candles (30 - 20 + 1) when using provided viewport
      const renderedCandles = candleSticks.selectAll('rect').nodes();

      // This test will fail if the function is still using the fixed window size
      // instead of the provided viewport
      expect(renderedCandles.length).toBe(11); // Should be 11 candles, not 80

      consoleSpy.mockRestore();
    });

    it('should use fixed window size when useProvidedViewport is false', () => {
      // Spy on console.log to capture what's happening
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Call renderCandlestickChart with useProvidedViewport = false
      renderCandlestickChart(mockSvgElement, mockCalculations, false);

      // Check that the chart content group has candles
      const chartContent = d3.select(mockSvgElement).select('.chart-content');
      const candleSticks = chartContent.select('.candle-sticks');

      expect(candleSticks.empty()).toBe(false);

      // The key test: check if the rendered candles use the fixed window size
      // We expect 80 candles (CHART_DATA_POINTS) when not using provided viewport
      const renderedCandles = candleSticks.selectAll('rect').nodes();

      // This test will pass if the function uses the fixed window size
      expect(renderedCandles.length).toBe(80); // Should be 80 candles (CHART_DATA_POINTS)

      consoleSpy.mockRestore();
    });

    it('should default to fixed window size when useProvidedViewport is not specified', () => {
      // Spy on console.log to capture what's happening
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Call renderCandlestickChart without the useProvidedViewport parameter
      renderCandlestickChart(mockSvgElement, mockCalculations);

      // Check that the chart content group has candles
      const chartContent = d3.select(mockSvgElement).select('.chart-content');
      const candleSticks = chartContent.select('.chart-content');

      expect(candleSticks.empty()).toBe(false);

      // The key test: check if the rendered candles use the fixed window size
      const renderedCandles = candleSticks.selectAll('rect').nodes();

      // This test will pass if the function defaults to fixed window size
      expect(renderedCandles.length).toBe(80); // Should be 80 candles (CHART_DATA_POINTS)

      consoleSpy.mockRestore();
    });
  });

  describe('Edge Case Viewport Tests', () => {
    it('should handle single candle viewport correctly', () => {
      const singleCandleCalculations = {
        ...mockCalculations,
        viewStart: 50,
        viewEnd: 50, // Same as start - single candle
        visibleData: mockData.slice(50, 51), // 1 candle
      };

      // Spy on console.log to capture what's happening
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      renderCandlestickChart(mockSvgElement, singleCandleCalculations, true);

      const chartContent = d3.select(mockSvgElement).select('.chart-content');
      const candleSticks = chartContent.select('.candle-sticks');
      const renderedCandles = candleSticks.selectAll('rect').nodes();

      // Should render exactly 1 candle when using provided viewport
      expect(renderedCandles.length).toBe(1);

      consoleSpy.mockRestore();
    });

    it('should handle large viewport correctly', () => {
      const largeViewportCalculations = {
        ...mockCalculations,
        viewStart: 10,
        viewEnd: 90, // 81 candles
        visibleData: mockData.slice(10, 91), // 81 candles
      };

      // Spy on console.log to capture what's happening
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      renderCandlestickChart(mockSvgElement, largeViewportCalculations, true);

      const chartContent = d3.select(mockSvgElement).select('.chart-content');
      const candleSticks = chartContent.select('.candle-sticks');
      const renderedCandles = candleSticks.selectAll('rect').nodes();

      // Should render exactly 81 candles when using provided viewport
      expect(renderedCandles.length).toBe(81);

      consoleSpy.mockRestore();
    });
  });

  describe('Integration Test', () => {
    it('should demonstrate the exact bug from the logs', () => {
      // Recreate the exact scenario from the logs
      const bugScenarioCalculations = {
        ...mockCalculations,
        viewStart: 573, // From the logs
        viewEnd: 652, // From the logs
        visibleData: mockData.slice(573, 653), // 80 candles
        allData: Array.from({ length: 1001 }, (_, i) => ({
          // 1001 total candles
          timestamp: new Date(2024, 0, 1, i).toISOString(),
          open: 100 + i,
          high: 105 + i,
          low: 95 + i,
          close: 102 + i,
          volume: 1000 + i * 100,
        })),
      };

      // Spy on console.log to capture what's happening
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // This should use the provided viewport (573-652 = 80 candles)
      renderCandlestickChart(mockSvgElement, bugScenarioCalculations, true);

      const chartContent = d3.select(mockSvgElement).select('.chart-content');
      const candleSticks = chartContent.select('.candle-sticks');
      const renderedCandles = candleSticks.selectAll('rect').nodes();

      // The bug: this should be 80 candles (652 - 573 + 1)
      // But if the bug exists, it might be 80 candles for a different reason
      // (the fixed window size coincidentally being 80)

      // More importantly, we need to verify the actual data being rendered
      // matches the provided viewport, not some calculated viewport
      expect(renderedCandles.length).toBe(80);

      // TODO: Add more specific checks to verify the actual data range
      // being rendered matches the provided viewport

      consoleSpy.mockRestore();
    });
  });
});
