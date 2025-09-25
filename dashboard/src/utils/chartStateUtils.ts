import { ChartDimensions, CandlestickData, ChartTimeframe } from '../types';
import { MIN_CHART_HEIGHT, CHART_HEIGHT_OFFSET } from '../constants';
import { logger } from './logger';

export interface ChartStateValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface DimensionCalculation {
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
}

/**
 * Calculate chart dimensions from container element
 */
export const calculateChartDimensions = (
  containerElement: HTMLElement | null,
  currentDimensions: ChartDimensions
): DimensionCalculation => {
  if (!containerElement) {
    return currentDimensions;
  }

  const rect = containerElement.getBoundingClientRect();
  return {
    ...currentDimensions,
    width: rect.width,
    height: Math.max(MIN_CHART_HEIGHT, rect.height - CHART_HEIGHT_OFFSET),
  };
};

/**
 * Validate chart state for creation/rendering
 */
export const validateChartState = (
  allData: CandlestickData[],
  currentViewStart: number,
  currentViewEnd: number,
  svgElement: SVGSVGElement | null,
  chartExists: boolean,
  chartLoaded: boolean
): ChartStateValidation => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check data validity
  if (!allData || allData.length === 0) {
    errors.push('No chart data available');
  }

  // Check SVG element
  if (!svgElement) {
    errors.push('SVG element not available');
  }

  // Check viewport validity
  if (allData.length > 0) {
    if (currentViewStart > currentViewEnd) {
      errors.push(`Invalid viewport: start (${currentViewStart}) > end (${currentViewEnd})`);
    }

    if (currentViewEnd < 0) {
      errors.push(`Invalid viewport: end (${currentViewEnd}) is negative`);
    }

    if (currentViewStart >= allData.length) {
      errors.push(`Invalid viewport: start (${currentViewStart}) exceeds data length (${allData.length})`);
    }
  }

  // Check chart state consistency
  if (chartLoaded && !chartExists) {
    warnings.push('Chart marked as loaded but does not exist');
  }

  const isValid = errors.length === 0;

  logger.chart.target('Chart state validation:', {
    isValid,
    errors,
    warnings,
    dataLength: allData.length,
    viewport: `${currentViewStart}-${currentViewEnd}`,
    chartExists,
    chartLoaded,
    svgExists: !!svgElement,
  });

  return { isValid, errors, warnings };
};

/**
 * Check if chart should be created
 */
export const shouldCreateChart = (
  allData: CandlestickData[],
  currentViewStart: number,
  currentViewEnd: number,
  svgElement: SVGSVGElement | null,
  chartExists: boolean,
  chartLoaded: boolean,
  gElementExists: boolean
): boolean => {
  const validation = validateChartState(
    allData,
    currentViewStart,
    currentViewEnd,
    svgElement,
    chartExists,
    chartLoaded
  );

  if (!validation.isValid) {
    return false;
  }

  // Check if viewport is properly set (not showing entire dataset)
  const viewportSize = currentViewEnd - currentViewStart + 1;
  const isViewportProperlySet = viewportSize < allData.length && viewportSize > 0;

  const shouldCreate = allData.length > 0 && svgElement && (!chartExists || !gElementExists) && isViewportProperlySet;

  logger.chart.target('Chart creation decision:', {
    shouldCreate,
    dataLength: allData.length,
    viewportSize,
    isViewportProperlySet,
    chartExists,
    gElementExists,
    svgExists: !!svgElement,
  });

  return shouldCreate;
};

/**
 * Check if chart should be recreated (force recreation)
 */
export const shouldForceRecreateChart = (
  allData: CandlestickData[],
  svgElement: SVGSVGElement | null,
  chartCreatedRef: boolean
): boolean => {
  return !chartCreatedRef && allData.length > 0 && !!svgElement;
};

/**
 * Validate data for chart operations
 */
export const validateChartData = (data: CandlestickData[]): boolean => {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return false;
  }

  // Check if all data points have required properties
  return data.every(
    point =>
      point.timestamp &&
      typeof point.open === 'number' &&
      typeof point.high === 'number' &&
      typeof point.low === 'number' &&
      typeof point.close === 'number'
  );
};

/**
 * Check if chart is ready for rendering
 */
export const isChartReady = (
  chartLoaded: boolean,
  svgElement: SVGSVGElement | null,
  allData: CandlestickData[]
): boolean => {
  return chartLoaded && !!svgElement && allData.length > 0;
};

/**
 * Check if chart is in a loading state
 */
export const isChartLoading = (isLoading: boolean, allData: CandlestickData[]): boolean => {
  return isLoading || allData.length === 0;
};

/**
 * Check if chart has an error state
 */
export const hasChartError = (error: string | null): boolean => {
  return !!error;
};

/**
 * Get chart status for debugging
 */
export const getChartStatus = (
  chartLoaded: boolean,
  chartExists: boolean,
  isLoading: boolean,
  error: string | null,
  allData: CandlestickData[]
): string => {
  if (error) {
    return 'Error';
  }
  if (isLoading || allData.length === 0) {
    return 'Loading';
  }
  if (!chartExists) {
    return 'Not Created';
  }
  if (!chartLoaded) {
    return 'Not Loaded';
  }
  return 'Ready';
};

/**
 * Calculate chart metrics for debugging
 */
export const calculateChartMetrics = (
  allData: CandlestickData[],
  currentViewStart: number,
  currentViewEnd: number,
  timeframe: ChartTimeframe | null
) => {
  const total = allData.length;
  const actualStart = Math.max(0, currentViewStart);
  const actualEnd = Math.min(total - 1, currentViewEnd);
  const actualPoints = actualEnd - actualStart + 1;

  return {
    total,
    visible: actualPoints,
    viewport: `${Math.round(actualStart)}-${Math.round(actualEnd)}`,
    timeframe: timeframe || 'Loading...',
    dataRange:
      total > 0
        ? {
            first: allData[0]?.timestamp,
            last: allData[total - 1]?.timestamp,
          }
        : null,
  };
};
