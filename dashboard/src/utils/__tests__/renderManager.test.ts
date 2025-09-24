import { renderChart, RenderType, DEFAULT_RENDER_OPTIONS } from '../renderManager';
import { ChartDimensions, CandlestickData } from '../../types';

// Mock SVG element for testing
const createMockSVGElement = (): SVGSVGElement => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '800');
  svg.setAttribute('height', '400');
  return svg;
};

// Mock chart data
const createMockChartData = (): CandlestickData[] => [
  {
    timestamp: '2024-01-01T09:00:00Z',
    open: 100,
    high: 105,
    low: 95,
    close: 102,
    volume: 1000,
  },
  {
    timestamp: '2024-01-01T09:01:00Z',
    open: 102,
    high: 108,
    low: 98,
    close: 106,
    volume: 1200,
  },
  {
    timestamp: '2024-01-01T09:02:00Z',
    open: 106,
    high: 110,
    low: 104,
    close: 108,
    volume: 1100,
  },
];

// Mock dimensions
const mockDimensions: ChartDimensions = {
  width: 800,
  height: 400,
  margin: { top: 20, right: 60, bottom: 40, left: 0 },
};

describe('renderManager', () => {
  describe('renderChart', () => {
    it('should handle initial render correctly', () => {
      const svgElement = createMockSVGElement();
      const chartData = createMockChartData();

      const result = renderChart({
        svgElement,
        dimensions: mockDimensions,
        allData: chartData,
        currentViewStart: 0,
        currentViewEnd: 2,
        options: DEFAULT_RENDER_OPTIONS[RenderType.INITIAL],
      });

      expect(result.success).toBe(true);
      expect(result.yScaleRecalculated).toBe(true);
      expect(result.calculations).toBeDefined();
      expect(result.newFixedYScaleDomain).toBeDefined();
    });

    it('should handle panning render correctly', () => {
      const svgElement = createMockSVGElement();
      const chartData = createMockChartData();

      const result = renderChart({
        svgElement,
        dimensions: mockDimensions,
        allData: chartData,
        currentViewStart: 1,
        currentViewEnd: 2,
        options: DEFAULT_RENDER_OPTIONS[RenderType.PANNING],
      });

      expect(result.success).toBe(true);
      expect(result.yScaleRecalculated).toBe(true); // EXPERIMENT: Now always recalculates Y-scale
      expect(result.calculations).toBeDefined();
      // Verify that panning render uses the provided viewport indices
      expect(result.calculations?.viewStart).toBe(1);
      expect(result.calculations?.viewEnd).toBe(2);
      expect(result.calculations?.visibleData.length).toBe(2);
    });

    it('should handle skip-to render correctly', () => {
      const svgElement = createMockSVGElement();
      const chartData = createMockChartData();

      const result = renderChart({
        svgElement,
        dimensions: mockDimensions,
        allData: chartData,
        currentViewStart: 0,
        currentViewEnd: 1,
        options: DEFAULT_RENDER_OPTIONS[RenderType.SKIP_TO],
      });

      expect(result.success).toBe(true);
      expect(result.yScaleRecalculated).toBe(true);
      expect(result.calculations).toBeDefined();
      expect(result.newFixedYScaleDomain).toBeDefined();
    });

    it('should handle WebSocket render correctly', () => {
      const svgElement = createMockSVGElement();
      const chartData = createMockChartData();

      const result = renderChart({
        svgElement,
        dimensions: mockDimensions,
        allData: chartData,
        currentViewStart: 0,
        currentViewEnd: 2,
        options: DEFAULT_RENDER_OPTIONS[RenderType.WEBSOCKET],
      });

      expect(result.success).toBe(true);
      expect(result.yScaleRecalculated).toBe(true);
      expect(result.calculations).toBeDefined();
      expect(result.newFixedYScaleDomain).toBeDefined();
    });

    it('should handle invalid inputs gracefully', () => {
      const result = renderChart({
        svgElement: null as any,
        dimensions: mockDimensions,
        allData: [],
        currentViewStart: 0,
        currentViewEnd: 0,
        options: DEFAULT_RENDER_OPTIONS[RenderType.INITIAL],
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.yScaleRecalculated).toBe(false);
    });

    it('should handle empty data gracefully', () => {
      const svgElement = createMockSVGElement();

      const result = renderChart({
        svgElement,
        dimensions: mockDimensions,
        allData: [],
        currentViewStart: 0,
        currentViewEnd: 0,
        options: DEFAULT_RENDER_OPTIONS[RenderType.INITIAL],
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid chart data');
      expect(result.yScaleRecalculated).toBe(false);
    });
  });

  describe('DEFAULT_RENDER_OPTIONS', () => {
    it('should have correct options for each render type', () => {
      expect(DEFAULT_RENDER_OPTIONS[RenderType.INITIAL]).toEqual({
        type: RenderType.INITIAL,
        recalculateYScale: true,
        skipToNewest: true,
        preserveTransform: false,
        triggerDataLoading: true,
      });

      expect(DEFAULT_RENDER_OPTIONS[RenderType.PANNING]).toEqual({
        type: RenderType.PANNING,
        recalculateYScale: true, // EXPERIMENT: Now always recalculates
        skipToNewest: false,
        preserveTransform: false, // EXPERIMENT: Now doesn't preserve transform
        triggerDataLoading: false,
      });

      expect(DEFAULT_RENDER_OPTIONS[RenderType.SKIP_TO]).toEqual({
        type: RenderType.SKIP_TO,
        recalculateYScale: true,
        skipToNewest: false,
        preserveTransform: false,
        triggerDataLoading: false,
      });

      expect(DEFAULT_RENDER_OPTIONS[RenderType.WEBSOCKET]).toEqual({
        type: RenderType.WEBSOCKET,
        recalculateYScale: true,
        skipToNewest: true,
        preserveTransform: false,
        triggerDataLoading: true,
      });
    });
  });
});
