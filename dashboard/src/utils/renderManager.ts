import * as d3 from 'd3';
import { ChartDimensions, CandlestickData } from '../types';
import { calculateChartState, ChartCalculations } from '../components/ChartRenderer';
import { updateClipPath, renderCandlestickChart } from '../components/ChartRenderer';
import { memoizedCalculateYScaleDomain } from './memoizedChartUtils';
import { isValidChartData, calculateInnerDimensions } from './chartDataUtils';
import { LOAD_EDGE_TRIGGER } from '../constants';
import { logger } from './logger';

/**
 * Render type enumeration for different chart rendering scenarios
 */
export enum RenderType {
  INITIAL = 'initial',
  PANNING = 'panning',
  SKIP_TO = 'skip_to',
  WEBSOCKET = 'websocket',
}

/**
 * Options for controlling chart rendering behavior
 */
export interface RenderOptions {
  /** Type of render operation */
  type: RenderType;
  /** Whether to recalculate Y-scale domain/transformations */
  recalculateYScale: boolean;
  /** Whether to skip to newest candle */
  skipToNewest: boolean;
  /** Whether to preserve current zoom/pan state */
  preserveTransform: boolean;
  /** Whether to trigger data loading for buffered candles */
  triggerDataLoading: boolean;
}

/**
 * Default render options for each render type
 */
export const DEFAULT_RENDER_OPTIONS: Record<RenderType, RenderOptions> = {
  [RenderType.INITIAL]: {
    type: RenderType.INITIAL,
    recalculateYScale: true,
    skipToNewest: true,
    preserveTransform: false,
    triggerDataLoading: true,
  },
  [RenderType.PANNING]: {
    type: RenderType.PANNING,
    recalculateYScale: true, // EXPERIMENT: Always recalculate Y-scale for panning
    skipToNewest: false,
    preserveTransform: false, // EXPERIMENT: Don't preserve transform (disables vertical panning)
    triggerDataLoading: false,
  },
  [RenderType.SKIP_TO]: {
    type: RenderType.SKIP_TO,
    recalculateYScale: true,
    skipToNewest: false,
    preserveTransform: false,
    triggerDataLoading: true,
  },
  [RenderType.WEBSOCKET]: {
    type: RenderType.WEBSOCKET,
    recalculateYScale: true,
    skipToNewest: true,
    preserveTransform: false,
    triggerDataLoading: true,
  },
};

/**
 * Parameters for the centralized render function
 */
export interface RenderParams {
  /** SVG element to render to */
  svgElement: SVGSVGElement;
  /** Chart dimensions */
  dimensions: ChartDimensions;
  /** All chart data */
  allData: CandlestickData[];
  /** Current viewport start index */
  currentViewStart: number;
  /** Current viewport end index */
  currentViewEnd: number;
  /** Current transform state */
  currentTransform?: d3.ZoomTransform;
  /** Fixed Y-scale domain (if any) */
  fixedYScaleDomain?: [number, number] | null;
  /** Render options */
  options: RenderOptions;
  /** Callback for data loading when buffered candles are rendered */
  onBufferedCandlesRendered?: (direction: 'past' | 'future') => void;
  /** Skip auto-load check during this render */
  skipAutoLoadCheck?: boolean;
}

/**
 * Result of a render operation
 */
export interface RenderResult {
  /** Whether the render was successful */
  success: boolean;
  /** Any error that occurred */
  error?: string;
  /** The calculations used for rendering */
  calculations?: ChartCalculations;
  /** Whether Y-scale domain was recalculated */
  yScaleRecalculated: boolean;
  /** The new fixed Y-scale domain (if recalculated) */
  newFixedYScaleDomain?: [number, number] | null;
}

/**
 * Auto-load trigger logic for buffered candles
 * Checks if the viewport is close to data edges and triggers data loading
 */
export const checkAutoLoadTrigger = (
  viewStart: number,
  viewEnd: number,
  totalDataLength: number,
  onBufferedCandlesRendered?: (direction: 'past' | 'future') => boolean | void,
  loadRequestedLeft?: { current: boolean },
  loadRequestedRight?: { current: boolean },
  lastLoadDataLengthLeft?: { current: number | null },
  lastLoadDataLengthRight?: { current: number | null }
): void => {
  if (!onBufferedCandlesRendered) {
    return;
  }

  // Reset per-edge lock when data length changes
  if (
    lastLoadDataLengthLeft &&
    lastLoadDataLengthLeft.current !== null &&
    totalDataLength !== lastLoadDataLengthLeft.current
  ) {
    if (loadRequestedLeft) {
      loadRequestedLeft.current = false;
    }
    lastLoadDataLengthLeft.current = null;
  }
  if (
    lastLoadDataLengthRight &&
    lastLoadDataLengthRight.current !== null &&
    totalDataLength !== lastLoadDataLengthRight.current
  ) {
    if (loadRequestedRight) {
      loadRequestedRight.current = false;
    }
    lastLoadDataLengthRight.current = null;
  }

  const distanceLeft = Math.max(0, viewStart);
  const distanceRight = Math.max(0, totalDataLength - 1 - viewEnd);
  const threshold = LOAD_EDGE_TRIGGER;

  logger.chart.viewport('Auto-load check:', {
    viewport: `${viewStart}-${viewEnd}`,
    totalDataLength,
    distanceLeft,
    distanceRight,
    threshold,
    loadRequestedLeft: loadRequestedLeft?.current,
    loadRequestedRight: loadRequestedRight?.current,
  });

  if (distanceLeft <= threshold && (!loadRequestedLeft || !loadRequestedLeft.current)) {
    if (loadRequestedLeft) {
      loadRequestedLeft.current = true;
    }
    if (lastLoadDataLengthLeft) {
      lastLoadDataLengthLeft.current = totalDataLength;
    }
    logger.chart.data('Triggering auto-load for past data');
    setTimeout(() => {
      try {
        const result = onBufferedCandlesRendered('past');
        // If callback returns false, it means it didn't actually load data
        // Reset the refs to prevent infinite loops
        if (result === false) {
          if (loadRequestedLeft) {
            loadRequestedLeft.current = false;
          }
          if (lastLoadDataLengthLeft) {
            lastLoadDataLengthLeft.current = null;
          }
        }
      } catch (error) {
        console.warn('Auto-load callback failed:', error);
        // Reset the refs if callback fails to prevent infinite loops
        if (loadRequestedLeft) {
          loadRequestedLeft.current = false;
        }
        if (lastLoadDataLengthLeft) {
          lastLoadDataLengthLeft.current = null;
        }
      }
    }, 0);
  }
  if (distanceRight <= threshold && (!loadRequestedRight || !loadRequestedRight.current)) {
    if (loadRequestedRight) {
      loadRequestedRight.current = true;
    }
    if (lastLoadDataLengthRight) {
      lastLoadDataLengthRight.current = totalDataLength;
    }
    logger.chart.data('Triggering auto-load for future data');
    setTimeout(() => {
      try {
        const result = onBufferedCandlesRendered('future');
        // If callback returns false, it means it didn't actually load data
        // Reset the refs to prevent infinite loops
        if (result === false) {
          if (loadRequestedRight) {
            loadRequestedRight.current = false;
          }
          if (lastLoadDataLengthRight) {
            lastLoadDataLengthRight.current = null;
          }
        }
      } catch (error) {
        console.warn('Auto-load callback failed:', error);
        // Reset the refs if callback fails to prevent infinite loops
        if (loadRequestedRight) {
          loadRequestedRight.current = false;
        }
        if (lastLoadDataLengthRight) {
          lastLoadDataLengthRight.current = null;
        }
      }
    }, 0);
  }
};

/**
 * Centralized chart rendering function
 * Handles all rendering scenarios with configurable options
 */
export const renderChart = (params: RenderParams): RenderResult => {
  const {
    svgElement,
    dimensions,
    allData,
    currentViewStart,
    currentViewEnd,
    currentTransform = d3.zoomIdentity,
    fixedYScaleDomain = null,
    options,
    onBufferedCandlesRendered = () => {},
    skipAutoLoadCheck = false,
  } = params;

  try {
    // Validate inputs
    if (!svgElement) {
      return { success: false, error: 'No SVG element provided', yScaleRecalculated: false };
    }

    if (!isValidChartData(allData)) {
      return { success: false, error: 'Invalid chart data', yScaleRecalculated: false };
    }

    if (allData.length === 0) {
      return { success: false, error: 'No data to render', yScaleRecalculated: false };
    }

    logger.chart.render(`Rendering chart (${options.type}):`, {
      dataLength: allData.length,
      viewport: `${currentViewStart}-${currentViewEnd}`,
      recalculateYScale: options.recalculateYScale,
      skipToNewest: options.skipToNewest,
      preserveTransform: options.preserveTransform,
    });

    // Determine transform to use
    let transformToUse = currentTransform;
    if (!options.preserveTransform) {
      transformToUse = d3.zoomIdentity;
    }

    // Calculate Y-scale domain if needed
    let yScaleDomainToUse = fixedYScaleDomain;
    let yScaleRecalculated = false;

    if (options.recalculateYScale) {
      const visibleData = allData.slice(currentViewStart, currentViewEnd + 1);
      yScaleDomainToUse = memoizedCalculateYScaleDomain(visibleData);
      yScaleRecalculated = true;
    }

    // Calculate chart state with the determined parameters
    // For panning and skip-to operations, we need to override the viewport calculation
    // to use the specific viewport indices provided
    let calculations: ChartCalculations;
    logger.chart.fix('Render Type:', options.type);

    if (
      options.type === RenderType.PANNING ||
      options.type === RenderType.SKIP_TO ||
      options.type === RenderType.WEBSOCKET
    ) {
      // For panning and skip-to, create a custom calculation that uses the provided viewport
      const { innerWidth, innerHeight } = calculateInnerDimensions(dimensions);

      // Create scales similar to calculateChartState but use provided viewport
      const baseXScale = d3
        .scaleLinear()
        .domain([0, allData.length - 1])
        .range([0, innerWidth]);
      const baseYScale = d3
        .scaleLinear()
        .domain(yScaleDomainToUse || [0, 1])
        .range([innerHeight, 0]);

      const transformedXScale = transformToUse.rescaleX(baseXScale);
      const transformedYScale = transformToUse.rescaleY(baseYScale);

      // Use the provided viewport indices
      const visibleData = allData.slice(currentViewStart, currentViewEnd + 1);

      calculations = {
        innerWidth,
        innerHeight,
        baseXScale,
        baseYScale,
        transformedXScale,
        transformedYScale,
        viewStart: currentViewStart,
        viewEnd: currentViewEnd,
        visibleData,
        allData,
        transformString: transformToUse.toString(),
      };
    } else {
      logger.chart.fix('Using standard calculation for:', options.type, 'with transform:', transformToUse.toString());
      // For other render types, use the standard calculation
      calculations = calculateChartState({
        dimensions,
        allChartData: allData,
        transform: transformToUse,
        fixedYScaleDomain: yScaleDomainToUse,
      });
    }

    // Update clip-path to accommodate any data changes
    updateClipPath(svgElement, allData, dimensions);

    // Re-render candlesticks with calculated state
    // Use provided viewport for skip-to and panning operations
    const useProvidedViewport = options.type === RenderType.PANNING || options.type === RenderType.SKIP_TO;
    renderCandlestickChart(svgElement, calculations, useProvidedViewport);

    // Handle data loading for buffered candles if needed
    if (options.triggerDataLoading && !skipAutoLoadCheck) {
      // Only check auto-load for specific render types that indicate viewport changes
      // Skip auto-load checks for frequent re-renders like hover/mouse movement
      const shouldCheckAutoLoad =
        options.type === RenderType.INITIAL ||
        options.type === RenderType.SKIP_TO ||
        options.type === RenderType.WEBSOCKET ||
        options.type === RenderType.PANNING;

      if (shouldCheckAutoLoad) {
        // Check if we're close to data edges and trigger auto-load if needed
        checkAutoLoadTrigger(calculations.viewStart, calculations.viewEnd, allData.length, onBufferedCandlesRendered);
      }
    }

    logger.chart.fix('Final calculations before logging:', {
      viewStart: calculations.viewStart,
      viewEnd: calculations.viewEnd,
      visibleDataLength: calculations.visibleData.length,
      transformString: calculations.transformString,
    });
    return {
      success: true,
      calculations,
      yScaleRecalculated,
      newFixedYScaleDomain: yScaleRecalculated ? yScaleDomainToUse : null,
    };
  } catch (error) {
    logger.error(`Chart render failed (${options.type}):`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown render error',
      yScaleRecalculated: false,
    };
  }
};

/**
 * Convenience function for initial render
 */
export const renderInitial = (
  svgElement: SVGSVGElement,
  dimensions: ChartDimensions,
  allData: CandlestickData[],
  currentViewStart: number,
  currentViewEnd: number,
  onBufferedCandlesRendered?: (direction: 'past' | 'future') => void
): RenderResult => {
  return renderChart({
    svgElement,
    dimensions,
    allData,
    currentViewStart,
    currentViewEnd,
    options: DEFAULT_RENDER_OPTIONS[RenderType.INITIAL],
    ...(onBufferedCandlesRendered && { onBufferedCandlesRendered }),
  });
};

/**
 * Convenience function for panning render
 */
export const renderPanning = (
  svgElement: SVGSVGElement,
  dimensions: ChartDimensions,
  allData: CandlestickData[],
  currentViewStart: number,
  currentViewEnd: number,
  currentTransform: d3.ZoomTransform,
  fixedYScaleDomain: [number, number] | null
): RenderResult => {
  return renderChart({
    svgElement,
    dimensions,
    allData,
    currentViewStart,
    currentViewEnd,
    currentTransform,
    fixedYScaleDomain,
    options: DEFAULT_RENDER_OPTIONS[RenderType.PANNING],
  });
};

/**
 * Convenience function for WebSocket render
 */
export const renderWebSocket = (
  svgElement: SVGSVGElement,
  dimensions: ChartDimensions,
  allData: CandlestickData[],
  currentViewStart: number,
  currentViewEnd: number,
  onBufferedCandlesRendered?: (direction: 'past' | 'future') => void,
  skipAutoLoadCheck?: boolean
): RenderResult => {
  return renderChart({
    svgElement,
    dimensions,
    allData,
    currentViewStart,
    currentViewEnd,
    options: DEFAULT_RENDER_OPTIONS[RenderType.WEBSOCKET],
    ...(onBufferedCandlesRendered && { onBufferedCandlesRendered }),
    ...(skipAutoLoadCheck && { skipAutoLoadCheck }),
  });
};
