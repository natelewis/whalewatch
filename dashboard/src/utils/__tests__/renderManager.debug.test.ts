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
    if (data.length === 0) return [0, 1];
    const prices = data.flatMap(d => [d.open, d.high, d.low, d.close]);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const padding = (max - min) * 0.1;
    return [min - padding, max + padding];
  }),
}));

describe('RenderManager Debug Tests', () => {
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

  it('should pass useProvidedViewport=true for skip-to operations', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = renderChart({
      svgElement: mockSvgElement,
      dimensions: mockDimensions,
      allData: mockData,
      currentViewStart: 2,
      currentViewEnd: 5,
      options: DEFAULT_RENDER_OPTIONS[RenderType.SKIP_TO],
    });

    expect(result.success).toBe(true);

    // Check that renderCandlestickChart was called with useProvidedViewport=true
    const renderCandlestickChartCall = consoleSpy.mock.calls.find(call =>
      call[0]?.includes('renderCandlestickChart called with:')
    );

    expect(renderCandlestickChartCall).toBeDefined();
    expect(renderCandlestickChartCall![1]).toMatchObject({
      useProvidedViewport: true,
      viewStart: 2,
      viewEnd: 5,
      visibleDataLength: 4,
    });

    consoleSpy.mockRestore();
  });

  it('should pass useProvidedViewport=false for initial operations', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = renderChart({
      svgElement: mockSvgElement,
      dimensions: mockDimensions,
      allData: mockData,
      currentViewStart: 0,
      currentViewEnd: 5,
      options: DEFAULT_RENDER_OPTIONS[RenderType.INITIAL],
    });

    expect(result.success).toBe(true);

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
