import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import { ChartTimeframe, DEFAULT_CHART_DATA_POINTS, ChartDimensions, ChartCalculations } from '../types';
import { getLocalStorageItem, setLocalStorageItem } from '../utils/localStorage';
import { CandlestickData } from '../types';
import { useChartWebSocket } from '../hooks/useChartWebSocket';
import { useChartDataProcessor } from '../hooks/useChartDataProcessor';
import { useChartStateManager } from '../hooks/useChartStateManager';
import { safeCall, createUserFriendlyMessage, getDisplayName } from '@whalewatch/shared';
import { MultiTechnicalIndicatorsToggle } from './MultiTechnicalIndicatorsSelector';
import { renderMultiTechnicalIndicators } from './MultiTechnicalIndicatorsRenderer';
import { useTechnicalIndicators } from '../hooks/useTechnicalIndicators';
import { logger } from '../utils/logger';
import { CANDLE_UP_COLOR, CANDLE_DOWN_COLOR } from '../constants';
import { formatPrice, calculateInnerDimensions } from '../utils/chartDataUtils';
import { TimeframeConfig } from '../types';
import { createChart, calculateChartState, updateAxes } from './ChartRenderer';
import { renderInitial, renderPanning, renderWebSocket } from '../utils/renderManager';
import { BUFFER_SIZE, CHART_DATA_POINTS } from '../constants';

// Import new utility functions
import {
  calculateNewestViewport,
  calculateAnchoredViewport,
  validateViewport,
  calculateBufferRange,
  calculatePruningRange,
  calculateDataShift,
} from '../utils/viewportUtils';
import {
  calculateChartDimensions,
  validateChartState,
  shouldCreateChart,
  shouldForceRecreateChart,
  isChartReady,
  isChartLoading,
  hasChartError,
  getChartStatus,
  calculateChartMetrics,
} from '../utils/chartStateUtils';
import { mergeHistoricalData, autoLoadData } from '../utils/dataLoadingUtils';
import {
  useRefUpdates,
  useCleanup,
  useDebouncedEffect,
  useLoadingState,
  useLoggedEffect,
  useConditionalEffect,
} from '../utils/effectUtils';
import { logError } from '../utils/errorHandlingUtils';

interface StockChartProps {
  symbol: string;
  onSymbolChange?: (symbol: string) => void;
}

const StockChart: React.FC<StockChartProps> = ({ symbol }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Use consolidated state management
  const { state: chartState, actions: chartActions } = useChartStateManager(symbol, null);

  // Use new utility hooks
  const { isValidData, getVisibleData } = useChartDataProcessor(chartState.allData);

  // Local state for timeframe management
  const [timeframe, setTimeframe] = useState<ChartTimeframe | null>(null);

  // Use new utility hooks for state management
  const { setLoading: setLoadingData } = useLoadingState(false);

  // Use ref to prevent effect loops
  const isLoadingDataRef = useRef(false);

  // Track current buffer range to know when to re-render
  const currentBufferRangeRef = useRef<{ start: number; end: number } | null>(null);

  // Track if we're currently in a panning operation
  const isPanningRef = useRef(false);

  // Track if chart has been created
  const chartCreatedRef = useRef(false);

  // Track if initial view has been set
  const initialViewSetRef = useRef(false);

  // Track if initial data has been loaded
  const initialDataLoadedRef = useRef(false);

  // Track last processed WebSocket data
  const lastProcessedDataRef = useRef<string | null>(null);

  // Store reference to the zoom behavior
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  // Store reference to the fixed Y-scale domain
  const fixedYScaleDomainRef = useRef<[number, number] | null>(null);

  // Store reference to the current data
  const currentDataRef = useRef<CandlestickData[]>([]);

  // Store reference to the current dimensions
  const currentDimensionsRef = useRef<ChartDimensions>({
    width: 0,
    height: 0,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });

  // Store reference to chart cleanup function
  const chartCleanupRef = useRef<(() => void) | null>(null);

  // Store reference to current view indices
  const currentViewStartRef = useRef<number>(0);
  const currentViewEndRef = useRef<number>(0);

  // Track when we've reached the end of available data to prevent repeated auto-load attempts
  const reachedEndOfDataRef = useRef<{ past: boolean; future: boolean }>({ past: false, future: false });

  // Track when we're in the middle of an auto-load operation to prevent re-render loops
  const isAutoLoadingRef = useRef<boolean>(false);

  // Use persisted technical indicators hook
  const {
    state: technicalIndicatorsState,
    actions: technicalIndicatorsActions,
    enabledData: technicalIndicatorsData,
  } = useTechnicalIndicators(chartState.allData);

  // Use new utility hooks for ref management
  useRefUpdates([
    { ref: currentDimensionsRef, value: chartState.dimensions, logMessage: 'Dimensions updated' },
    { ref: currentDataRef, value: chartState.allData, logMessage: 'Data updated' },
    { ref: currentViewStartRef, value: chartState.currentViewStart, logMessage: 'View start updated' },
    { ref: currentViewEndRef, value: chartState.currentViewEnd, logMessage: 'View end updated' },
    { ref: fixedYScaleDomainRef, value: chartState.fixedYScaleDomain, logMessage: 'Y-scale domain updated' },
  ]);

  // Reset end-of-data flags when symbol or timeframe changes
  useEffect(() => {
    reachedEndOfDataRef.current = { past: false, future: false };
  }, [symbol, timeframe]);

  // Reset end-of-data flags when viewport changes significantly
  // This allows re-attempting data loading when user pans to new areas
  useEffect(() => {
    // Reset future data flag when viewport moves significantly to the right
    // This indicates the user is exploring new future data
    const currentViewEnd = chartState.currentViewEnd;
    const totalDataLength = chartState.allData.length;
    const distanceFromEnd = totalDataLength - 1 - currentViewEnd;

    // If we're close to the end but not at the very end, reset the future flag
    // This allows re-attempting future data loading
    if (distanceFromEnd < 50 && distanceFromEnd > 0) {
      reachedEndOfDataRef.current.future = false;
      logger.chart.data('Reset future data flag - user exploring near end of data');
    }
  }, [chartState.currentViewEnd, chartState.allData.length]);

  // Function to automatically load more data when buffered candles are rendered
  const loadMoreDataOnBufferedRender = useCallback(
    async (direction: 'past' | 'future' = 'past'): Promise<boolean> => {
      if (timeframe === null) {
        logger.warn('Cannot auto-load more data: no timeframe selected');
        return false;
      }

      try {
        const result = await autoLoadData(
          {
            symbol,
            timeframe,
            direction,
            fetchPoints: BUFFER_SIZE,
          },
          currentDataRef.current,
          reachedEndOfDataRef.current,
          isLoadingDataRef.current
        );

        if (!result.success) {
          if (result.reachedEnd) {
            reachedEndOfDataRef.current[direction] = true;
          }
          return false;
        }

        // Check if we reached the end of data (even if successful)
        if (result.reachedEnd) {
          reachedEndOfDataRef.current[direction] = true;
          logger.chart.data(`Reached end of ${direction} data, stopping auto-load`);

          // Set a timeout to reset the flag after 30 seconds
          // This allows retrying in case the "end of data" was incorrectly detected
          setTimeout(() => {
            reachedEndOfDataRef.current[direction] = false;
            logger.chart.data(`Reset ${direction} data flag after timeout`);
          }, 30000);

          return false;
        }

        if (!result.data) {
          return false;
        }

        // Merge while preserving order and removing dups
        const mergedData = mergeHistoricalData(currentDataRef.current, result.data);

        // After merging, enforce max window of 2 * BUFFER_SIZE (prune opposite side)
        let prunedData = mergedData;
        if (mergedData.length > BUFFER_SIZE * 2) {
          if (direction === 'past') {
            // Loaded left: drop rightmost excess
            prunedData = mergedData.slice(0, BUFFER_SIZE * 2);
          } else {
            // Loaded right: drop leftmost excess
            prunedData = mergedData.slice(mergedData.length - BUFFER_SIZE * 2);
          }
        }

        // Anchor viewport exactly like manual "Load Left": shift indices to keep the same candles visible
        const prevStart = currentViewStartRef.current;
        const prevEnd = currentViewEndRef.current;
        const totalAfter = prunedData.length;

        // Calculate the actual shift that occurred due to data changes
        const dataShift = calculateDataShift(direction, BUFFER_SIZE, mergedData.length, prunedData.length);

        // Calculate anchored viewport
        const anchoredViewport = calculateAnchoredViewport(prevStart, prevEnd, dataShift, totalAfter);

        chartActions.setAllData(prunedData);
        chartActions.setViewport(anchoredViewport.start, anchoredViewport.end);

        logger.chart.success('Successfully auto-loaded data:', {
          direction,
          fetched: result.data.length,
          requested: BUFFER_SIZE,
          newTotal: prunedData.length,
          finalViewport: `${anchoredViewport.start}-${anchoredViewport.end}`,
        });

        // Reset the end-of-data flag since we successfully loaded new data
        reachedEndOfDataRef.current[direction] = false;

        return true;
      } catch (error) {
        logError(error as Error, 'auto-load data', { direction, symbol, timeframe });
        return false;
      }
    },
    [timeframe, chartState.allData.length, symbol, chartActions]
  );

  // Define timeframes array
  const timeframes: TimeframeConfig[] = useMemo(
    () => [
      { value: '1m', label: '1m', limit: DEFAULT_CHART_DATA_POINTS },
      { value: '15m', label: '15m', limit: DEFAULT_CHART_DATA_POINTS },
      { value: '30m', label: '30m', limit: DEFAULT_CHART_DATA_POINTS },
      { value: '1h', label: '1h', limit: DEFAULT_CHART_DATA_POINTS },
      { value: '1d', label: '1d', limit: DEFAULT_CHART_DATA_POINTS },
    ],
    []
  );

  // Define time skip options
  const timeSkipOptions = useMemo(
    () => [
      { label: 'Now', hours: 0 },
      { label: '1 day ago', hours: 24 },
      { label: '1 week ago', hours: 24 * 7 },
      { label: '1 month ago', hours: 24 * 30 },
      { label: '3 months ago', hours: 24 * 30 * 3 },
      { label: '6 months ago', hours: 24 * 30 * 6 },
      { label: '1 year ago', hours: 24 * 365 },
    ],
    []
  );

  // Function to skip to a specific time
  const skipToTime = useCallback(
    async (hoursAgo: number) => {
      if (!chartState.timeframe) {
        logger.warn('Cannot skip to time: No timeframe set');
        return;
      }

      // Calculate target time (hours ago from now)
      const now = new Date();
      const targetTime = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
      const targetTimeString = targetTime.toISOString();

      logger.chart.data('Skipping to time:', {
        hoursAgo,
        targetTime: targetTimeString,
        timeframe: chartState.timeframe,
        symbol,
      });

      try {
        // Fetch new data centered around the target time
        await chartActions.loadChartData(
          symbol,
          chartState.timeframe,
          DEFAULT_CHART_DATA_POINTS,
          targetTimeString,
          'centered'
        );

        logger.chart.success('New data loaded for skip-to time:', targetTimeString);

        // After loading new data, we need to recreate the chart structure
        // because the data has completely changed
        chartActions.setChartExists(false);
        chartActions.setChartLoaded(false);
        chartCreatedRef.current = false; // Allow chart recreation

        logger.chart.loading('Chart structure reset for skip-to operation');
      } catch (error) {
        logError(error as Error, 'skip to time', { hoursAgo, targetTime: targetTimeString });
      }
    },
    [chartState.timeframe, chartActions, symbol]
  );

  // WebSocket for real-time data
  const chartWebSocket = useChartWebSocket({
    symbol,
    onChartData: bar => {
      logger.chart.websocket('WebSocket data received in StockChart:', {
        symbol,
        timestamp: bar.t,
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: bar.v,
      });

      // Always process incoming websocket data
      // Create a unique key for this data point to prevent duplicate processing
      const dataKey = `${bar.t}-${bar.o}-${bar.h}-${bar.l}-${bar.c}`;

      // Skip if we've already processed this exact data point
      if (lastProcessedDataRef.current === dataKey) {
        logger.chart.skip('WebSocket data skipped: Duplicate detected');
        return;
      }

      lastProcessedDataRef.current = dataKey;
      logger.chart.data('Calling updateChartWithLiveData...');
      chartActions.updateChartWithLiveData(bar);
    },
  });

  // Update visible data when view changes
  useEffect(() => {
    if (isValidData) {
      const newVisibleData = getVisibleData(chartState.currentViewStart, chartState.currentViewEnd);
      chartActions.setData(newVisibleData);
    }
  }, [chartState.currentViewStart, chartState.currentViewEnd, chartState.allData, isValidData, getVisibleData]);

  // Handle auto-redraw when viewport changes due to live data updates
  useLoggedEffect(
    () => {
      // Only trigger auto-redraw if chart is ready
      if (!isChartReady(chartState.chartLoaded, svgRef.current, chartState.allData)) {
        logger.chart.skip('Auto-redraw skipped: Chart not ready');
        return;
      }

      // Skip if we're currently panning to avoid conflicts
      if (isPanningRef.current) {
        logger.chart.skip('Auto-redraw skipped: Currently panning');
        return;
      }

      // Get current transform to preserve zoom level
      const currentZoomTransform = d3.zoomTransform(svgRef.current!);

      // Use centralized render function for auto-redraw (WebSocket-like behavior)
      const renderResult = renderWebSocket(
        svgRef.current as SVGSVGElement,
        chartState.dimensions,
        chartState.allData,
        chartState.currentViewStart,
        chartState.currentViewEnd,
        loadMoreDataOnBufferedRender,
        isAutoLoadingRef.current // Skip auto-load check if we're currently auto-loading
      );

      if (renderResult.success && renderResult.newFixedYScaleDomain) {
        // Update the fixed Y-scale domain if it was recalculated
        chartActions.setFixedYScaleDomain(renderResult.newFixedYScaleDomain);
      }

      // Render unified technical indicators
      if (technicalIndicatorsData.length > 0 && renderResult.success && renderResult.calculations) {
        const renderItems = technicalIndicatorsData.map(item => ({
          data: item.data,
          color: item.item.color,
          label: item.item.label,
          type: item.item.type,
        }));
        renderMultiTechnicalIndicators(svgRef.current as SVGSVGElement, renderItems, renderResult.calculations);
      } else {
        // Remove all indicators if none are enabled
        const chartContent = d3.select(svgRef.current).select('.chart-content');
        const indicatorsGroup = chartContent.select('.technical-indicators');
        if (!indicatorsGroup.empty()) {
          indicatorsGroup.remove();
        }
      }

      logger.chart.success('Auto-redraw re-render completed:', {
        viewport: `${chartState.currentViewStart}-${chartState.currentViewEnd}`,
        dataLength: chartState.allData.length,
        transform: `${currentZoomTransform.x}, ${currentZoomTransform.y}, ${currentZoomTransform.k}`,
      });

      // Reset auto-loading flag after re-render is complete
      if (isAutoLoadingRef.current) {
        logger.chart.loading('Auto-load re-render detected, scheduling flag reset');
        // Use setTimeout to ensure all related re-renders are complete
        setTimeout(() => {
          if (isAutoLoadingRef.current) {
            logger.chart.loading('Resetting auto-loading flag after timeout');
            isAutoLoadingRef.current = false;
          }
        }, 100); // Increased delay to ensure viewport clamping effect runs first
      }
    },
    [
      chartState.currentViewStart,
      chartState.currentViewEnd,
      chartState.allData,
      chartState.chartLoaded,
      chartState.dimensions,
      chartState.fixedYScaleDomain,
      technicalIndicatorsData,
    ],
    'Auto-redraw'
  );

  // Load saved timeframe from localStorage (but don't load data here)
  useConditionalEffect(
    !initialDataLoadedRef.current,
    () => {
      const result = safeCall(() => {
        return getLocalStorageItem<ChartTimeframe>('chartTimeframe', '1h');
      });

      if (result.isOk()) {
        const savedTimeframe = result.value;
        setTimeframe(savedTimeframe);
        initialDataLoadedRef.current = true;
      } else {
        logger.warn('Failed to load chart timeframe from localStorage:', createUserFriendlyMessage(result.error));
        setTimeframe('1h');
        initialDataLoadedRef.current = true;
      }
    },
    [symbol]
  );

  // Save timeframe to localStorage
  useEffect(() => {
    if (timeframe !== null) {
      const result = safeCall(() => {
        setLocalStorageItem('chartTimeframe', timeframe);
      });

      if (result.isErr()) {
        logger.warn('Failed to save chart timeframe to localStorage:', createUserFriendlyMessage(result.error));
      }
    }
  }, [timeframe]);

  // Load chart data when symbol or timeframe changes
  useLoggedEffect(
    () => {
      // Skip if timeframe is not set yet
      if (timeframe === null) {
        return;
      }

      // Skip if already loading data
      if (isLoadingDataRef.current) {
        logger.chart.loading('Data load already in progress; skipping duplicate request');
        return;
      }

      chartActions.resetChart(); // Reset chart state for new symbol/timeframe
      chartActions.setTimeframe(timeframe);
      chartCreatedRef.current = false; // Allow chart recreation for new timeframe
      lastProcessedDataRef.current = null; // Reset WebSocket data tracking

      // Force chart recreation by clearing the chart state
      chartActions.setChartExists(false);
      chartActions.setChartLoaded(false);

      logger.chart.loading('Loading data for symbol/timeframe:', {
        symbol,
        timeframe,
        currentDataLength: chartState.allData.length,
        isLoadingData: isLoadingDataRef.current,
      });

      isLoadingDataRef.current = true;
      setLoadingData(true);
      chartActions
        .loadChartData(symbol, timeframe, DEFAULT_CHART_DATA_POINTS, new Date().toISOString(), 'past')
        .finally(() => {
          logger.chart.success('Data loading completed for timeframe:', timeframe);
          isLoadingDataRef.current = false;
          setLoadingData(false);
        });
    },
    [symbol, timeframe],
    'Data loading'
  );

  // Cleanup refs on unmount
  useCleanup(() => {
    isLoadingDataRef.current = false;
    setLoadingData(false);
    chartCreatedRef.current = false;
    // Clean up chart event listeners
    if (chartCleanupRef.current) {
      chartCleanupRef.current();
      chartCleanupRef.current = null;
    }
  });

  // Reset refs when symbol changes
  useEffect(() => {
    isLoadingDataRef.current = false;
    chartCreatedRef.current = false;
    initialViewSetRef.current = false;
    initialDataLoadedRef.current = false;
    lastProcessedDataRef.current = null; // Reset WebSocket data tracking
  }, [symbol]);

  // Always subscribe to WebSocket for real-time data
  useEffect(() => {
    chartWebSocket.subscribeToChartData();

    return () => {
      chartWebSocket.unsubscribeFromChartData();
    };
  }, [symbol, chartWebSocket.isConnected]); // Subscribe when symbol changes OR when connection status changes

  // Handle container resize with debouncing and immediate response
  useEffect(() => {
    let resizeTimeout: NodeJS.Timeout | null = null;

    const handleResize = (): void => {
      if (containerRef.current) {
        const newDimensions = calculateChartDimensions(containerRef.current, chartState.dimensions);

        // Check if dimensions actually changed to avoid unnecessary updates
        const dimensionsChanged =
          newDimensions.width !== chartState.dimensions.width || newDimensions.height !== chartState.dimensions.height;

        if (dimensionsChanged) {
          logger.chart.render('Container resize detected:', {
            oldWidth: chartState.dimensions.width,
            oldHeight: chartState.dimensions.height,
            newWidth: newDimensions.width,
            newHeight: newDimensions.height,
          });

          chartActions.setDimensions(newDimensions);
        }
      }
    };

    // Debounced resize handler to prevent excessive redraws
    const debouncedHandleResize = (): void => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      resizeTimeout = setTimeout(handleResize, 100);
    };

    // Use ResizeObserver for accurate container size detection
    let resizeObserver: ResizeObserver | null = null;
    if (containerRef.current && window.ResizeObserver) {
      resizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
          if (entry.target === containerRef.current) {
            // Use immediate resize for ResizeObserver to ensure real-time updates
            handleResize();
          }
        }
      });
      resizeObserver.observe(containerRef.current);
    }

    // Use debounced resize for window events
    window.addEventListener('resize', debouncedHandleResize);

    return () => {
      window.removeEventListener('resize', debouncedHandleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
    };
  }, [chartState.dimensions.width, chartState.dimensions.height]); // Re-run when dimensions change

  // Separate effect to handle dimension changes and re-render chart
  useEffect(() => {
    if (svgRef.current && chartState.chartLoaded && chartState.chartExists && chartState.allData.length > 0) {
      logger.chart.render('Dimension change detected, re-rendering chart:', {
        width: chartState.dimensions.width,
        height: chartState.dimensions.height,
        viewport: `${chartState.currentViewStart}-${chartState.currentViewEnd}`,
      });

      // Get current transform
      const currentZoomTransform = d3.zoomTransform(svgRef.current);

      // Calculate new Y-scale for the updated dimensions
      const { innerWidth, innerHeight } = calculateInnerDimensions(chartState.dimensions);

      // Create new Y-scale with updated dimensions
      const newYScale = d3
        .scaleLinear()
        .domain(chartState.fixedYScaleDomain || [0, 1])
        .range([innerHeight, 0]);

      // Apply current transform to the Y-scale
      const transformedYScale = currentZoomTransform.rescaleY(newYScale);

      // Update axes with new dimensions and scales
      updateAxes(
        svgRef.current as SVGSVGElement,
        chartState.dimensions,
        chartState.allData,
        chartState.currentViewStart,
        chartState.currentViewEnd,
        transformedYScale,
        chartState.timeframe || '1h'
      );

      // Use centralized render function for dimension changes (panning-like behavior)
      // This will redraw candlesticks with the new dimensions
      const renderResult = renderPanning(
        svgRef.current as SVGSVGElement,
        chartState.dimensions,
        chartState.allData,
        chartState.currentViewStart,
        chartState.currentViewEnd,
        currentZoomTransform,
        chartState.fixedYScaleDomain
      );

      if (renderResult.success) {
        // Update overlay for new dimensions
        const overlay = d3.select(svgRef.current).select<SVGRectElement>('.overlay');
        if (!overlay.empty()) {
          overlay.attr('width', innerWidth).attr('height', innerHeight);
        }

        // Update clip-path for new dimensions
        const clipPath = d3.select(svgRef.current).select<SVGRectElement>('#clip rect');
        if (!clipPath.empty()) {
          clipPath.attr('width', innerWidth).attr('height', innerHeight);
        }

        // Render technical indicators for dimension changes
        if (technicalIndicatorsData.length > 0 && renderResult.calculations) {
          const renderItems = technicalIndicatorsData.map(item => ({
            data: item.data,
            color: item.item.color,
            label: item.item.label,
            type: item.item.type,
          }));
          renderMultiTechnicalIndicators(svgRef.current as SVGSVGElement, renderItems, renderResult.calculations);
        } else {
          // Clear indicators if none are enabled
          const chartContent = d3.select(svgRef.current).select('.chart-content');
          const indicatorsGroup = chartContent.select('.technical-indicators');
          if (!indicatorsGroup.empty()) {
            indicatorsGroup.remove();
          }
        }

        logger.chart.success('Chart re-rendered successfully for dimension change');
      } else {
        logger.chart.error('Failed to re-render chart for dimension change:', renderResult.error);
      }
    }
  }, [chartState.dimensions.width, chartState.dimensions.height]); // Trigger when dimensions change

  // Clamp viewport indices whenever data length or viewport changes to prevent invalid ranges
  useDebouncedEffect(
    () => {
      const total = chartState.allData.length;
      if (total === 0) {
        return;
      }

      logger.chart.viewport('Viewport clamping effect triggered:', {
        total,
        currentViewStart: chartState.currentViewStart,
        currentViewEnd: chartState.currentViewEnd,
        isAutoLoading: isAutoLoadingRef.current,
      });

      // Skip viewport clamping if we're currently auto-loading to preserve anchored viewport
      if (isAutoLoadingRef.current) {
        logger.chart.skip('Viewport clamping skipped: Auto-loading in progress');
        return;
      }

      const validation = validateViewport(chartState.currentViewStart, chartState.currentViewEnd, total);

      if (!validation.isValid && validation.corrected) {
        logger.chart.fix('Viewport clamping applied:', {
          original: `${chartState.currentViewStart}-${chartState.currentViewEnd}`,
          clamped: `${validation.corrected.start}-${validation.corrected.end}`,
          total,
          reason: 'Invalid viewport detected',
          errors: validation.errors,
        });
        chartActions.setViewport(validation.corrected.start, validation.corrected.end);
      }
    },
    [chartState.currentViewStart, chartState.currentViewEnd, chartState.allData.length],
    100
  );

  // Set initial view to show newest data when data loads
  useEffect(() => {
    if (isValidData && !initialViewSetRef.current) {
      const totalDataLength = chartState.allData.length;

      // If this is the first load, show newest data with proper buffer setup
      if (chartState.data.length === 0 && totalDataLength > 0) {
        // Set up initial view to show most recent data with full buffer available
        const newestViewport = calculateNewestViewport(totalDataLength);
        chartActions.setViewport(newestViewport.start, newestViewport.end);
        initialViewSetRef.current = true;
      }
    }
  }, [chartState.allData.length, isValidData]); // Removed chartState.data.length to prevent re-runs

  // Reset refs on mount to handle hot reload
  useEffect(() => {
    chartCreatedRef.current = false;
    initialDataLoadedRef.current = false;
    lastProcessedDataRef.current = null;
  }, []); // Only run on mount

  // Create chart when data is available and view is properly set
  useLoggedEffect(
    () => {
      // Only create chart if it hasn't been created yet and we have valid data
      // Allow recreation when timeframe changes (chartCreatedRef.current is set to false)
      if (chartCreatedRef.current) {
        return; // Chart already created, skip
      }

      const gElementExists = svgRef.current ? !d3.select(svgRef.current).select('g').empty() : false;

      // Check if chart should be created
      const shouldCreate = shouldCreateChart(
        chartState.allData,
        chartState.currentViewStart,
        chartState.currentViewEnd,
        svgRef.current,
        chartState.chartExists,
        chartState.chartLoaded,
        gElementExists
      );

      // Force recreation when chartCreatedRef.current is false (timeframe change)
      const shouldForceRecreate = shouldForceRecreateChart(chartState.allData, svgRef.current, chartCreatedRef.current);

      // Set viewport if it's not set yet
      if (isValidData && chartState.allData.length > 0 && chartState.currentViewEnd === 0) {
        const newestViewport = calculateNewestViewport(chartState.allData.length);
        chartActions.setViewport(newestViewport.start, newestViewport.end);
      }

      if (shouldCreate || shouldForceRecreate) {
        // Validate chart state before creation
        const validation = validateChartState(
          chartState.allData,
          chartState.currentViewStart,
          chartState.currentViewEnd,
          svgRef.current,
          chartState.chartExists,
          chartState.chartLoaded
        );

        if (!validation.isValid) {
          logger.warn('Invalid chart state in chart creation effect:', validation.errors);

          // Reset to valid view indices
          const newestViewport = calculateNewestViewport(chartState.allData.length);
          chartActions.setViewport(newestViewport.start, newestViewport.end);
          return;
        }

        // If DOM element is missing but state says chart exists, reset the chart state
        if (chartState.chartExists && !gElementExists) {
          chartActions.setChartLoaded(false);
          chartActions.setChartExists(false);
        }

        const shouldCreateChartElement = !chartState.chartExists || !gElementExists;

        if (shouldCreateChartElement) {
          // Ensure we have the latest dimensions before creating the chart
          let dimensionsToUse = chartState.dimensions;

          if (containerRef.current) {
            const latestDimensions = calculateChartDimensions(containerRef.current, chartState.dimensions);

            // Update dimensions if they've changed
            if (
              latestDimensions.width !== chartState.dimensions.width ||
              latestDimensions.height !== chartState.dimensions.height
            ) {
              chartActions.setDimensions(latestDimensions);
              dimensionsToUse = latestDimensions;
            }
          }

          // Create calculations for chart creation
          const initialTransform = d3.zoomIdentity;
          const calculations = calculateChartState({
            dimensions: dimensionsToUse,
            allChartData: chartState.allData,
            transform: initialTransform,
            fixedYScaleDomain: chartState.fixedYScaleDomain,
          });

          // Clean up previous chart if it exists
          if (chartCleanupRef.current) {
            chartCleanupRef.current();
            chartCleanupRef.current = null;
          }

          chartCleanupRef.current = createChart({
            svgElement: svgRef.current as SVGSVGElement,
            allChartData: chartState.allData, // This will be updated via getCurrentData
            xScale: calculations.baseXScale,
            yScale: calculations.baseYScale,
            visibleData: calculations.visibleData, // Use calculated visible data instead of chartState.data
            dimensions: dimensionsToUse,
            stateCallbacks: {
              setIsZooming: chartActions.setIsZooming,
              setCurrentViewStart: chartActions.setCurrentViewStart,
              setCurrentViewEnd: chartActions.setCurrentViewEnd,
              getCurrentViewStart: () => currentViewStartRef.current,
              getCurrentViewEnd: () => currentViewEndRef.current,
              setHoverData: chartActions.setHoverData,
              setDateDisplay: chartActions.setDateDisplay,
              setChartLoaded: chartActions.setChartLoaded,
              setFixedYScaleDomain: chartActions.setFixedYScaleDomain,
              setChartExists: chartActions.setChartExists,
              setZoomBehavior: (behavior: d3.ZoomBehavior<SVGSVGElement, unknown>) => {
                zoomBehaviorRef.current = behavior;
              },
              getFixedYScaleDomain: () => fixedYScaleDomainRef.current,
              getCurrentData: () => currentDataRef.current,
              getCurrentDimensions: () => currentDimensionsRef.current,
              // Technical indicators callbacks
              getTechnicalIndicatorsData: () => technicalIndicatorsData,
              renderTechnicalIndicators: (
                svgElement: SVGSVGElement,
                renderItems: { data: unknown[]; color: string; label: string; type: 'moving_average' | 'macd' }[],
                chartCalculations: ChartCalculations
              ) => {
                renderMultiTechnicalIndicators(svgElement, renderItems, chartCalculations);
              },
            },
            chartState: chartState,
            isPanningRef: isPanningRef,
            onBufferedCandlesRendered: loadMoreDataOnBufferedRender,
          });

          // Mark chart as created to prevent re-creation
          chartCreatedRef.current = true;

          // Also handle initial candlestick rendering for timeframe changes
          // This ensures the chart is fully rendered when switching timeframes
          if (svgRef.current && chartState.allData.length > 0) {
            // Use appropriate render function based on context
            const renderResult = renderInitial(
              svgRef.current as SVGSVGElement,
              dimensionsToUse,
              chartState.allData,
              chartState.currentViewStart,
              chartState.currentViewEnd,
              loadMoreDataOnBufferedRender
            );

            if (renderResult.success) {
              // Update the fixed Y-scale domain if it was recalculated
              if (renderResult.newFixedYScaleDomain) {
                chartActions.setFixedYScaleDomain(renderResult.newFixedYScaleDomain);
                fixedYScaleDomainRef.current = renderResult.newFixedYScaleDomain;
              }

              // Set initial buffer range
              if (renderResult.calculations) {
                const bufferRange = calculateBufferRange(
                  renderResult.calculations.viewStart,
                  renderResult.calculations.viewEnd,
                  renderResult.calculations.allData.length
                );
                currentBufferRangeRef.current = bufferRange;
              }

              // Render unified technical indicators
              if (technicalIndicatorsData.length > 0 && renderResult.calculations) {
                const renderItems = technicalIndicatorsData.map(item => ({
                  data: item.data,
                  color: item.item.color,
                  label: item.item.label,
                  type: item.item.type,
                }));
                renderMultiTechnicalIndicators(svgRef.current as SVGSVGElement, renderItems, renderResult.calculations);
              } else {
                // Clear indicators if none are enabled
                const chartContent = d3.select(svgRef.current).select('.chart-content');
                const indicatorsGroup = chartContent.select('.technical-indicators');
                if (!indicatorsGroup.empty()) {
                  indicatorsGroup.remove();
                }
              }
            }
          }
        }
      }
    },
    [
      chartState.currentViewStart,
      chartState.currentViewEnd,
      chartState.dimensions,
      chartState.fixedYScaleDomain,
      chartState.chartExists,
      chartState.allData.length, // Include allData.length to trigger chart updates
      isValidData,
      svgRef.current, // Re-run when SVG element becomes available
      technicalIndicatorsData,
    ],
    'Chart creation'
  );

  // Prune off-chart data based on BUFFER_SIZE when not panning
  useDebouncedEffect(
    () => {
      // Skip pruning during panning or when dataset is already small
      const total = chartState.allData.length;
      if (isPanningRef.current || total === 0) {
        return;
      }

      const pruningRange = calculatePruningRange(chartState.currentViewStart, chartState.currentViewEnd, total);

      if (pruningRange) {
        // Slice to the retention window
        const newAllData = chartState.allData.slice(pruningRange.start, pruningRange.end + 1);

        // Adjust viewport to new indices after slice
        const newViewStart = chartState.currentViewStart - pruningRange.start;
        const newViewEnd = chartState.currentViewEnd - pruningRange.start;

        // Update buffer range ref to match new dataset
        const newBufferRange = calculateBufferRange(newViewStart, newViewEnd, newAllData.length);
        currentBufferRangeRef.current = newBufferRange;

        // Commit updates
        chartActions.setAllData(newAllData);
        chartActions.setViewport(newViewStart, newViewEnd);
      }
    },
    [chartState.currentViewStart, chartState.currentViewEnd, chartState.allData.length],
    200
  );

  // Calculate chart metrics for debugging
  const chartMetrics = useMemo(
    () => calculateChartMetrics(chartState.allData, chartState.currentViewStart, chartState.currentViewEnd, timeframe),
    [chartState.allData, chartState.currentViewStart, chartState.currentViewEnd, timeframe]
  );

  const chartStatus = getChartStatus(
    chartState.chartLoaded,
    chartState.chartExists,
    chartState.isLoading,
    chartState.error,
    chartState.allData
  );

  return (
    <div className="bg-card rounded-lg border border-border h-full flex flex-col">
      {/* Chart Header */}
      <div className="p-4 border-b border-border">
        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {/* Timeframe Selector */}
            <div className="flex space-x-1">
              {timeframes.map(tf => (
                <button
                  key={tf.value}
                  onClick={() => setTimeframe(tf.value)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    timeframe === tf.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                  disabled={timeframe === null}
                >
                  {tf.label}
                </button>
              ))}
            </div>

            {/* Time Skip Dropdown */}
            <div className="relative">
              <select
                onChange={async e => {
                  const hoursAgo = parseInt(e.target.value);
                  if (!isNaN(hoursAgo)) {
                    await skipToTime(hoursAgo);
                    e.target.value = ''; // Reset selection
                  }
                }}
                className="px-3 text-xs rounded-md bg-muted text-muted-foreground hover:bg-muted/80 border border-border focus:outline-none focus:ring-2 focus:ring-primary/20"
                style={{
                  height: '24px',
                  minHeight: '24px',
                  maxHeight: '24px',
                  boxSizing: 'border-box',
                  lineHeight: '1',
                  paddingTop: '2px',
                  paddingBottom: '2px',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  MozAppearance: 'none',
                }}
                disabled={timeframe === null || chartState.allData.length === 0}
                defaultValue=""
              >
                <option value="" disabled>
                  Skip to...
                </option>
                {timeSkipOptions.map(option => (
                  <option key={option.label} value={option.hours}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Unified Technical Indicators Toggle */}
            <MultiTechnicalIndicatorsToggle
              chartData={chartState.allData}
              technicalIndicatorsState={technicalIndicatorsState}
              technicalIndicatorsActions={technicalIndicatorsActions}
            />
          </div>

          {/* WebSocket Connection Indicator */}
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-2 px-3 py-1 rounded-md bg-muted/50">
              <div className="flex items-center space-x-1">
                <div
                  className={`w-2 h-2 rounded-full ${
                    chartWebSocket.isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
                  }`}
                ></div>
              </div>
              <span className="text-xs text-muted-foreground">
                {chartWebSocket.isConnected ? 'Live Data' : 'Disconnected'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Chart Container */}
      <div className="flex-1 p-4">
        {/* Chart Title - Always visible */}
        <div className="mb-4 px-2 h-12 flex items-center">
          {chartState.hoverData?.data ? (
            <div className="flex justify-between items-center w-full">
              <div className="flex flex-col">
                <h2 className="font-bold text-foreground text-lg">{getDisplayName(symbol)}</h2>
              </div>
              <div className="flex gap-3 text-sm">
                <span className="text-muted-foreground">
                  O:{' '}
                  <span
                    className="font-mono"
                    style={{
                      color:
                        chartState.hoverData.data.close >= chartState.hoverData.data.open
                          ? CANDLE_UP_COLOR
                          : CANDLE_DOWN_COLOR,
                    }}
                  >
                    {formatPrice(chartState.hoverData.data.open)}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  H:{' '}
                  <span
                    className="font-mono"
                    style={{
                      color:
                        chartState.hoverData.data.close >= chartState.hoverData.data.open
                          ? CANDLE_UP_COLOR
                          : CANDLE_DOWN_COLOR,
                    }}
                  >
                    {formatPrice(chartState.hoverData.data.high)}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  L:{' '}
                  <span
                    className="font-mono"
                    style={{
                      color:
                        chartState.hoverData.data.close >= chartState.hoverData.data.open
                          ? CANDLE_UP_COLOR
                          : CANDLE_DOWN_COLOR,
                    }}
                  >
                    {formatPrice(chartState.hoverData.data.low)}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  C:{' '}
                  <span
                    className="font-mono"
                    style={{
                      color:
                        chartState.hoverData.data.close >= chartState.hoverData.data.open
                          ? CANDLE_UP_COLOR
                          : CANDLE_DOWN_COLOR,
                    }}
                  >
                    {formatPrice(chartState.hoverData.data.close)}
                  </span>
                </span>
              </div>
            </div>
          ) : (
            <div className="flex justify-between items-center">
              <h2 className="font-bold text-foreground text-lg">{getDisplayName(symbol)}</h2>
            </div>
          )}
        </div>

        {isChartLoading(chartState.isLoading, chartState.allData) ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading chart data...</p>
            </div>
          </div>
        ) : hasChartError(chartState.error) ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <p className="text-destructive mb-4">{chartState.error}</p>
              <button
                onClick={() =>
                  timeframe &&
                  chartActions.loadChartData(symbol, timeframe, DEFAULT_CHART_DATA_POINTS, undefined, 'past')
                }
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              >
                Retry
              </button>
            </div>
          </div>
        ) : !isValidData || chartState.allData.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <p className="text-muted-foreground">No data available</p>
            </div>
          </div>
        ) : (
          <div className="w-full h-full relative" style={{ minHeight: '400px' }}>
            <div ref={containerRef} className="w-full h-full">
              <svg
                ref={svgRef}
                width={chartState.dimensions.width}
                height={chartState.dimensions.height}
                className="w-full h-full"
                style={{ cursor: chartState.isZooming ? 'grabbing' : 'grab' }}
              />
            </div>

            {/* Tooltip */}
          </div>
        )}
      </div>

      {/* Chart Footer - Debug Information */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center space-x-4">
            {/* Data Information */}
            <span>Total data: {chartMetrics.total}</span>
            <span>Visible: {CHART_DATA_POINTS}</span>
            <span>View: {chartMetrics.viewport}</span>
            <span>TF: {chartMetrics.timeframe}</span>
            {/* Zoom and Pan Information */}
            <span>Zoom: 1.00x</span>
            <span>Pan: 0, 0</span>
          </div>
          <div className="flex items-center space-x-4">
            {/* Chart State Information */}
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${chartState.chartLoaded ? 'bg-green-500' : 'bg-gray-500'}`}></div>
              <span>{chartStatus}</span>
            </div>
            {chartState.isZooming && (
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-blue-500">Zooming</span>
              </div>
            )}
            {chartState.allData.length > DEFAULT_CHART_DATA_POINTS && (
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                <span className="text-xs text-orange-500">Extended ({chartState.allData.length} pts)</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StockChart;
