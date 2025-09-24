import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import { ChartTimeframe, DEFAULT_CHART_DATA_POINTS, ChartDimensions } from '../types';
import { getLocalStorageItem, setLocalStorageItem } from '../utils/localStorage';
import { CandlestickData } from '../types';
import { useChartWebSocket } from '../hooks/useChartWebSocket';
import { useChartDataProcessor } from '../hooks/useChartDataProcessor';
import { useChartStateManager } from '../hooks/useChartStateManager';
import { apiService } from '../services/apiService';
import { safeCall, createUserFriendlyMessage } from '@whalewatch/shared';
import { formatPrice, processChartData, calculateInnerDimensions, isValidChartData } from '../utils/chartDataUtils';
import { smartDateRenderer } from '../utils/dateRenderer';
import { TimeframeConfig } from '../types';
import { createChart, renderCandlestickChart, updateClipPath, calculateChartState } from './ChartRenderer';
import { memoizedCalculateYScaleDomain } from '../utils/memoizedChartUtils';
import {
  BUFFER_SIZE,
  MIN_CHART_HEIGHT,
  CHART_HEIGHT_OFFSET,
  CHART_DATA_POINTS,
  MARGIN_SIZE,
  RIGHT_EDGE_CHECK_INTERVAL,
  CANDLE_UP_COLOR,
  CANDLE_DOWN_COLOR,
  Y_SCALE_REPRESENTATIVE_DATA_LENGTH,
} from '../constants';
import { BarChart3 } from 'lucide-react';

interface StockChartProps {
  symbol: string;
}

// Chart calculation types (matching ChartRenderer)
interface ChartCalculations {
  innerWidth: number;
  innerHeight: number;
  baseXScale: d3.ScaleLinear<number, number>;
  baseYScale: d3.ScaleLinear<number, number>;
  transformedXScale: d3.ScaleLinear<number, number>;
  transformedYScale: d3.ScaleLinear<number, number>;
  viewStart: number;
  viewEnd: number;
  visibleData: CandlestickData[];
  allData: CandlestickData[]; // Full dataset for rendering
  transformString: string;
}

// Helper function for Y-scale domain calculation using memoized function
const calculateYScaleDomain = memoizedCalculateYScaleDomain;

const StockChart: React.FC<StockChartProps> = ({ symbol }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Use consolidated state management
  const { state: chartState, actions: chartActions } = useChartStateManager(symbol, null);

  // Use new utility hooks
  const { isValidData, getVisibleData } = useChartDataProcessor(chartState.allData);

  // Local state for timeframe management
  const [timeframe, setTimeframe] = useState<ChartTimeframe | null>(null);

  const manualRenderInProgressRef = useRef(false);

  // Track current buffer range to know when to re-render
  const currentBufferRangeRef = useRef<{ start: number; end: number } | null>(null);

  // Track if we're currently in a panning operation
  const isPanningRef = useRef(false);

  // Track if we're currently loading data
  const isLoadingDataRef = useRef(false);

  // Track if chart has been created
  const chartCreatedRef = useRef(false);

  // Track if initial view has been set
  const initialViewSetRef = useRef(false);

  // Track if initial data has been loaded
  const initialDataLoadedRef = useRef(false);

  // Track last processed WebSocket data
  const lastProcessedDataRef = useRef<string | null>(null);

  // Debounce timer for pruning
  const pruneTimeoutRef = useRef<number | null>(null);

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

  // Update dimensions ref when dimensions change
  useEffect(() => {
    currentDimensionsRef.current = chartState.dimensions;
  }, [chartState.dimensions]);

  // Update data ref when chart data changes
  useEffect(() => {
    currentDataRef.current = chartState.allData;
  }, [chartState.allData]);

  // Update viewport refs when view changes
  useEffect(() => {
    currentViewStartRef.current = chartState.currentViewStart;
    currentViewEndRef.current = chartState.currentViewEnd;
  }, [chartState.currentViewStart, chartState.currentViewEnd]);

  // Update fixed Y-scale domain ref when it changes
  useEffect(() => {
    console.log('🔍 Fixed Y-scale domain changed:', {
      oldDomain: fixedYScaleDomainRef.current,
      newDomain: chartState.fixedYScaleDomain,
      changed: JSON.stringify(fixedYScaleDomainRef.current) !== JSON.stringify(chartState.fixedYScaleDomain),
    });
    fixedYScaleDomainRef.current = chartState.fixedYScaleDomain;
  }, [chartState.fixedYScaleDomain]);

  // Function to automatically load more data when buffered candles are rendered
  const loadMoreDataOnBufferedRender = useCallback(
    (direction: 'past' | 'future' = 'past'): void => {
      const dataLoadStartTime = performance.now();

      if (timeframe === null) {
        console.warn('Cannot auto-load more data: no timeframe selected');
        return;
      }

      // Only load more data if we haven't reached the maximum yet
      if (chartState.allData.length >= 1000) {
        console.log('📊 Max data points reached, skipping auto-load');
        return;
      }

      // Fetch exactly BUFFER_SIZE each time
      const fetchPoints = BUFFER_SIZE;

      // Use ref to avoid stale closure issues
      const currentData = currentDataRef.current;

      // Determine anchor time based on direction
      const anchorTimestamp =
        direction === 'past' ? currentData[0]?.timestamp : currentData[currentData.length - 1]?.timestamp;

      // Keep auto-load success/timing logs only; removed verbose pre-load logging

      // Prevent multiple in-flight loads
      if (isLoadingDataRef.current) {
        console.log('⏸️ Skipping auto-load, request in flight');
        return;
      }
      isLoadingDataRef.current = true;

      // Request exactly BUFFER_SIZE more bars from the chosen side
      apiService
        .getChartData(symbol, timeframe, fetchPoints, anchorTimestamp, direction === 'past' ? 'past' : 'future')
        .then(response => {
          const { formattedData } = processChartData(
            response.bars,
            chartState.timeframe || '1m',
            DEFAULT_CHART_DATA_POINTS
          );

          // Merge while preserving order and removing dups
          const mergedData = mergeHistoricalData(currentDataRef.current, formattedData);

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
          const prevStart = chartState.currentViewStart;
          const prevEnd = chartState.currentViewEnd;
          const windowSize = Math.max(1, Math.round(prevEnd - prevStart));

          const prevLength = currentDataRef.current.length;
          const mergedLength = mergedData.length;
          const totalAfter = prunedData.length;

          const addedLeft = direction === 'past' ? Math.max(0, mergedLength - prevLength) : 0;
          const removedLeft =
            direction === 'future' && prunedData.length !== mergedData.length
              ? mergedData.length - prunedData.length
              : 0;

          let anchoredStart = Math.round(prevStart + addedLeft - removedLeft);
          let anchoredEnd = Math.round(prevEnd + addedLeft - removedLeft);

          if (anchoredEnd > totalAfter - 1) {
            anchoredEnd = totalAfter - 1;
          }
          if (anchoredStart < 0) {
            anchoredStart = 0;
          }
          if (anchoredEnd - anchoredStart < windowSize) {
            anchoredStart = Math.max(0, anchoredEnd - windowSize);
          }

          chartActions.setAllData(prunedData);
          chartActions.setViewport(anchoredStart, anchoredEnd);

          console.log('✅ Successfully auto-loaded data:', {
            direction,
            fetched: formattedData.length,
            requested: fetchPoints,
            newTotal: prunedData.length,
          });

          const dataLoadEndTime = performance.now();
          console.log(`⏱️ Data loading (async) took: ${(dataLoadEndTime - dataLoadStartTime).toFixed(2)}ms`);
        })
        .catch(error => {
          console.error('Failed to auto-load more data:', error);
        })
        .finally(() => {
          isLoadingDataRef.current = false;
        });
    },
    [timeframe, chartState.allData.length, symbol, chartActions]
  );

  // Wrapper function that renders candlesticks and triggers data loading for non-panning cases
  const renderCandlestickChartWithCallback = useCallback(
    (svgElement: SVGSVGElement, calculations: ChartCalculations): void => {
      renderCandlestickChart(svgElement, calculations);
    },
    []
  );

  // Function to merge new historical data with existing data
  const mergeHistoricalData = (existingData: CandlestickData[], newData: CandlestickData[]): CandlestickData[] => {
    // Combine all data and deduplicate by timestamp
    const combinedData = [...existingData, ...newData];
    const uniqueData = combinedData.reduce((acc: CandlestickData[], current: CandlestickData) => {
      const existingIndex = acc.findIndex((item: CandlestickData) => item.timestamp === current.timestamp);
      if (existingIndex === -1) {
        acc.push(current);
      } else {
        // If duplicate timestamp, keep the newer data (from newData)
        acc[existingIndex] = current;
      }
      return acc;
    }, [] as CandlestickData[]);

    // Sort by time to ensure chronological order
    return uniqueData.sort(
      (a: CandlestickData, b: CandlestickData) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  };

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

  // Chart data management is now handled by useChartStateManager

  // WebSocket for real-time data
  const chartWebSocket = useChartWebSocket({
    symbol,
    onChartData: bar => {
      console.log('🌐 WebSocket data received in StockChart:', {
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
        console.log('⏸️ WebSocket data skipped: Duplicate detected');
        return;
      }

      lastProcessedDataRef.current = dataKey;
      console.log('📤 Calling updateChartWithLiveData...');
      chartActions.updateChartWithLiveData(bar);
    },
  });

  // Update visible data when view changes
  useEffect(() => {
    if (isValidData) {
      const newVisibleData = getVisibleData(chartState.currentViewStart, chartState.currentViewEnd);
      chartActions.setData(newVisibleData);
    }
  }, [chartState.currentViewStart, chartState.currentViewEnd, chartState.allData, isValidData, getVisibleData]); // Removed chartActions

  // Handle auto-redraw when viewport changes due to live data updates
  useEffect(() => {
    console.log('🎨 Auto-redraw useEffect triggered:', {
      chartLoaded: chartState.chartLoaded,
      svgRefExists: !!svgRef.current,
      dataLength: chartState.allData.length,
      currentViewport: `${chartState.currentViewStart}-${chartState.currentViewEnd}`,
      isPanning: isPanningRef.current,
      manualRenderInProgress: manualRenderInProgressRef.current,
    });

    // Only trigger auto-redraw if chart is loaded and we have valid data
    if (!chartState.chartLoaded || !svgRef.current || chartState.allData.length === 0) {
      console.log('⏸️ Auto-redraw skipped: Chart not ready');
      return;
    }

    // Skip if we're currently panning to avoid conflicts
    if (isPanningRef.current) {
      console.log('⏸️ Auto-redraw skipped: Currently panning');
      return;
    }

    // Skip if manual render is in progress
    if (manualRenderInProgressRef.current) {
      console.log('⏸️ Auto-redraw skipped: Manual render in progress');
      return;
    }

    // Get current transform to preserve zoom level
    const currentZoomTransform = d3.zoomTransform(svgRef.current);

    // Calculate chart state with current data and viewport
    const calculations = calculateChartState({
      dimensions: chartState.dimensions,
      allChartData: chartState.allData,
      transform: currentZoomTransform,
      fixedYScaleDomain: chartState.fixedYScaleDomain,
    });

    // Update clip-path to accommodate any data changes
    updateClipPath(svgRef.current as SVGSVGElement, chartState.allData, chartState.dimensions);

    // Re-render candlesticks with updated viewport
    renderCandlestickChartWithCallback(svgRef.current as SVGSVGElement, calculations);

    console.log('✅ Auto-redraw re-render completed:', {
      viewport: `${chartState.currentViewStart}-${chartState.currentViewEnd}`,
      dataLength: chartState.allData.length,
      transform: `${currentZoomTransform.x}, ${currentZoomTransform.y}, ${currentZoomTransform.k}`,
    });
  }, [
    chartState.currentViewStart,
    chartState.currentViewEnd,
    chartState.allData,
    chartState.chartLoaded,
    chartState.dimensions,
    chartState.fixedYScaleDomain,
  ]);

  // Load saved timeframe from localStorage (but don't load data here)
  useEffect(() => {
    if (initialDataLoadedRef.current) {
      console.log('🔄 Initial timeframe already loaded; skipping');
      return;
    }

    const result = safeCall(() => {
      return getLocalStorageItem<ChartTimeframe>('chartTimeframe', '1h');
    });

    if (result.isOk()) {
      const savedTimeframe = result.value;
      setTimeframe(savedTimeframe);
      initialDataLoadedRef.current = true;
    } else {
      console.warn('Failed to load chart timeframe from localStorage:', createUserFriendlyMessage(result.error));
      setTimeframe('1h');
      initialDataLoadedRef.current = true;
    }
  }, [symbol]); // Only load timeframe, not data

  // Save timeframe to localStorage
  useEffect(() => {
    if (timeframe !== null) {
      const result = safeCall(() => {
        setLocalStorageItem('chartTimeframe', timeframe);
      });

      if (result.isErr()) {
        console.warn('Failed to save chart timeframe to localStorage:', createUserFriendlyMessage(result.error));
      }
    }
  }, [timeframe]);

  // Load chart data when symbol or timeframe changes
  useEffect(() => {
    // Skip if timeframe is not set yet
    if (timeframe === null) {
      return;
    }

    // Skip if already loading data
    if (isLoadingDataRef.current) {
      console.log('🔄 Data load already in progress; skipping duplicate request');
      return;
    }

    // Reset loading state to allow new data loading
    isLoadingDataRef.current = false;

    chartActions.resetChart(); // Reset chart state for new symbol/timeframe
    chartActions.setTimeframe(timeframe);
    chartCreatedRef.current = false; // Allow chart recreation for new timeframe
    lastProcessedDataRef.current = null; // Reset WebSocket data tracking

    // Force chart recreation by clearing the chart state
    chartActions.setChartExists(false);
    chartActions.setChartLoaded(false);

    console.log('🔄 Loading data for symbol/timeframe:', {
      symbol,
      timeframe,
      currentDataLength: chartState.allData.length,
      isLoadingDataRef: isLoadingDataRef.current,
    });
    isLoadingDataRef.current = true;
    chartActions.loadChartData(symbol, timeframe, DEFAULT_CHART_DATA_POINTS, undefined, 'past').finally(() => {
      console.log('✅ Data loading completed for timeframe:', timeframe);
      isLoadingDataRef.current = false;
    });
  }, [symbol, timeframe]); // Single effect handles all data loading

  // Cleanup refs on unmount
  useEffect(() => {
    return () => {
      isLoadingDataRef.current = false;
      chartCreatedRef.current = false;
      // Clean up chart event listeners
      if (chartCleanupRef.current) {
        chartCleanupRef.current();
        chartCleanupRef.current = null;
      }
    };
  }, []);

  // Reset refs when symbol changes
  useEffect(() => {
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

  // Handle container resize
  useEffect(() => {
    const handleResize = (): void => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const newDimensions = {
          ...chartState.dimensions,
          width: rect.width,
          height: Math.max(MIN_CHART_HEIGHT, rect.height - CHART_HEIGHT_OFFSET),
        };

        chartActions.setDimensions(newDimensions);
      }
    };

    // Use ResizeObserver for accurate container size detection
    let resizeObserver: ResizeObserver | null = null;
    if (containerRef.current && window.ResizeObserver) {
      resizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
          if (entry.target === containerRef.current) {
            handleResize();
          }
        }
      });
      resizeObserver.observe(containerRef.current);
    }

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, []); // No dependencies needed - just sets dimensions

  // Separate effect to handle dimension changes and re-render chart
  useEffect(() => {
    if (svgRef.current && chartState.chartLoaded && chartState.chartExists && chartState.allData.length > 0) {
      // Get current transform
      const currentZoomTransform = d3.zoomTransform(svgRef.current);

      // Calculate new chart state with updated dimensions
      const calculations = calculateChartState({
        dimensions: chartState.dimensions,
        allChartData: chartState.allData,
        transform: currentZoomTransform,
        fixedYScaleDomain: chartState.fixedYScaleDomain,
      });

      // Update clip-path for new dimensions
      updateClipPath(svgRef.current as SVGSVGElement, chartState.allData, chartState.dimensions);

      // Re-render candlesticks with new dimensions
      // Note: candlesticks will use base scales since transform is applied to chart content group
      renderCandlestickChartWithCallback(svgRef.current as SVGSVGElement, calculations);

      // Update overlay for new dimensions
      const overlay = d3.select(svgRef.current).select<SVGRectElement>('.overlay');
      if (!overlay.empty()) {
        const { innerWidth, innerHeight } = calculateInnerDimensions(chartState.dimensions);
        overlay.attr('width', innerWidth).attr('height', innerHeight);
      }
    }
  }, [chartState.dimensions.width, chartState.dimensions.height]); // Trigger when dimensions change

  // Clamp viewport indices whenever data length or viewport changes to prevent invalid ranges
  useEffect(() => {
    const total = chartState.allData.length;
    if (total === 0) {
      return;
    }

    let start = Math.max(0, Math.floor(chartState.currentViewStart));
    let end = Math.min(total - 1, Math.ceil(chartState.currentViewEnd));

    if (end < start) {
      end = Math.min(total - 1, start + CHART_DATA_POINTS - 1);
    }

    if (end >= total) {
      end = total - 1;
    }
    if (start < 0) {
      start = 0;
    }

    // Ensure at most CHART_DATA_POINTS window when possible
    if (end - start + 1 < 1) {
      end = Math.min(total - 1, start + CHART_DATA_POINTS - 1);
    }

    if (start !== chartState.currentViewStart || end !== chartState.currentViewEnd) {
      chartActions.setViewport(start, end);
    }
  }, [chartState.currentViewStart, chartState.currentViewEnd, chartState.allData.length]);

  // Set initial view to show newest data when data loads
  useEffect(() => {
    if (isValidData && !initialViewSetRef.current) {
      const totalDataLength = chartState.allData.length;

      // If this is the first load, show newest data with proper buffer setup
      if (chartState.data.length === 0 && totalDataLength > 0) {
        // Set up initial view to show most recent data with full buffer available
        const newEndIndex = totalDataLength - 1;
        const newStartIndex = Math.max(0, totalDataLength - CHART_DATA_POINTS);

        chartActions.setViewport(newStartIndex, newEndIndex);
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
  useEffect(() => {
    // Only create chart if it hasn't been created yet and we have valid data
    // Allow recreation when timeframe changes (chartCreatedRef.current is set to false)
    if (chartCreatedRef.current) {
      return; // Chart already created, skip
    }

    console.log('🎯 Chart creation effect triggered:', {
      chartCreatedRef: chartCreatedRef.current,
      isValidData,
      allDataLength: chartState.allData.length,
      chartExists: chartState.chartExists,
      timeframe: chartState.timeframe,
      currentViewStart: chartState.currentViewStart,
      currentViewEnd: chartState.currentViewEnd,
      viewportSize: chartState.currentViewEnd - chartState.currentViewStart + 1,
    });

    const gElementExists = svgRef.current ? !d3.select(svgRef.current).select('g').empty() : false;

    // Check if viewport is properly set (not showing entire dataset)
    const viewportSize = chartState.currentViewEnd - chartState.currentViewStart + 1;
    const isViewportProperlySet = viewportSize < chartState.allData.length && viewportSize > 0;

    const shouldCreate =
      isValidData &&
      chartState.allData.length > 0 &&
      svgRef.current &&
      (!chartState.chartExists || !gElementExists) &&
      isViewportProperlySet; // Only create chart if viewport is properly set

    // Force recreation when chartCreatedRef.current is false (timeframe change)
    const shouldForceRecreate =
      !chartCreatedRef.current && isValidData && chartState.allData.length > 0 && svgRef.current;

    console.log('🎯 Chart creation conditions:', {
      gElementExists,
      shouldCreate,
      shouldForceRecreate,
      isValidData,
      allDataLength: chartState.allData.length,
      chartExists: chartState.chartExists,
      svgRefExists: !!svgRef.current,
      viewportSize,
      isViewportProperlySet,
      currentViewStart: chartState.currentViewStart,
      currentViewEnd: chartState.currentViewEnd,
    });

    // Set viewport if it's not set yet
    if (isValidData && chartState.allData.length > 0 && chartState.currentViewEnd === 0) {
      const dataLength = chartState.allData.length;
      const viewStart = Math.max(0, dataLength - CHART_DATA_POINTS);
      const viewEnd = dataLength - 1;
      chartActions.setViewport(viewStart, viewEnd);
    }

    if (shouldCreate || shouldForceRecreate) {
      // Only validate that we have a reasonable range
      // Negative indices are normal when panning to historical data

      if (chartState.currentViewStart > chartState.currentViewEnd || chartState.currentViewEnd < 0) {
        console.warn('Invalid view range in chart creation effect, resetting to valid values:', {
          currentViewStart: chartState.currentViewStart,
          currentViewEnd: chartState.currentViewEnd,
          dataLength: chartState.allData.length,
        });

        // Reset to valid view indices
        const validViewStart = Math.max(0, chartState.allData.length - CHART_DATA_POINTS);
        const validViewEnd = chartState.allData.length - 1;
        chartActions.setViewport(validViewStart, validViewEnd);
        return;
      }

      // Create chart if it doesn't exist yet, or if there's a significant data change
      // Don't recreate chart after panning - this causes unwanted y-scale recalculation

      // If DOM element is missing but state says chart exists, reset the chart state
      if (chartState.chartExists && !gElementExists) {
        chartActions.setChartLoaded(false);
        chartActions.setChartExists(false);
      }

      const shouldCreateChart = !chartState.chartExists || !gElementExists;

      if (shouldCreateChart) {
        // Ensure we have the latest dimensions before creating the chart
        let dimensionsToUse = chartState.dimensions;

        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const latestDimensions = {
            ...chartState.dimensions,
            width: rect.width,
            height: Math.max(MIN_CHART_HEIGHT, rect.height - CHART_HEIGHT_OFFSET),
          };

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
          },
          chartState: chartState,
          bufferRangeRef: currentBufferRangeRef,
          isPanningRef: isPanningRef,
          onBufferedCandlesRendered: loadMoreDataOnBufferedRender,
        });

        // Mark chart as created to prevent re-creation
        chartCreatedRef.current = true;

        // Also handle initial candlestick rendering for timeframe changes
        // This ensures the chart is fully rendered when switching timeframes
        if (svgRef.current && chartState.allData.length > 0) {
          // Create calculations for initial render (no transform)
          const initialTransformForRender = d3.zoomIdentity;
          const calculationsForRender = calculateChartState({
            dimensions: dimensionsToUse,
            allChartData: chartState.allData,
            transform: initialTransformForRender,
            fixedYScaleDomain: chartState.fixedYScaleDomain,
          });

          // Calculate the fixed Y-scale domain using centralized calculation
          // Only calculate if we don't already have a fixed domain (first time only)
          let fixedYScaleDomain: [number, number] | null = chartState.fixedYScaleDomain;
          if (!fixedYScaleDomain && isValidChartData(calculationsForRender.visibleData)) {
            // Use a representative sample of recent data for Y-scale domain
            // This provides a good balance between being zoomed in and maintaining consistency
            const representativeDataLength = Math.min(Y_SCALE_REPRESENTATIVE_DATA_LENGTH, chartState.allData.length);
            const representativeData = chartState.allData.slice(-representativeDataLength);
            fixedYScaleDomain = calculateYScaleDomain(representativeData);

            // Set the fixed Y-scale domain for future renders
            chartActions.setFixedYScaleDomain(fixedYScaleDomain);
            fixedYScaleDomainRef.current = fixedYScaleDomain;
          }

          // Recalculate with the fixed Y-scale domain
          const finalCalculations = calculateChartState({
            dimensions: dimensionsToUse,
            allChartData: chartState.allData,
            transform: initialTransformForRender,
            fixedYScaleDomain: fixedYScaleDomain,
          });

          // Update clip-path to accommodate the current dataset
          updateClipPath(svgRef.current as SVGSVGElement, chartState.allData, dimensionsToUse);

          // Render candlesticks
          renderCandlestickChartWithCallback(svgRef.current as SVGSVGElement, finalCalculations);

          // Set initial buffer range
          const bufferSize = BUFFER_SIZE;
          const dataLength = finalCalculations.allData.length;
          const marginSize = MARGIN_SIZE;
          const atDataStart = finalCalculations.viewStart <= marginSize;
          const atDataEnd = finalCalculations.viewEnd >= dataLength - marginSize;

          let actualStart, actualEnd;

          if (atDataStart && atDataEnd) {
            actualStart = 0;
            actualEnd = dataLength - 1;
          } else if (atDataStart) {
            actualStart = 0;
            actualEnd = Math.min(dataLength - 1, Math.ceil(finalCalculations.viewEnd) + bufferSize);
          } else if (atDataEnd) {
            actualStart = Math.max(0, Math.floor(finalCalculations.viewStart) - bufferSize);
            actualEnd = dataLength - 1;
          } else {
            actualStart = Math.max(0, Math.floor(finalCalculations.viewStart) - bufferSize);
            actualEnd = Math.min(dataLength - 1, Math.ceil(finalCalculations.viewEnd) + bufferSize);
          }

          currentBufferRangeRef.current = {
            start: actualStart,
            end: actualEnd,
          };
        }
      }
    }
  }, [
    chartState.currentViewStart,
    chartState.currentViewEnd,
    chartState.dimensions,
    chartState.fixedYScaleDomain,
    chartState.chartExists,
    chartState.allData.length, // Include allData.length to trigger chart updates
    isValidData,
    svgRef.current, // Re-run when SVG element becomes available
  ]);

  // Prune off-chart data based on BUFFER_SIZE when not panning
  useEffect(() => {
    // Skip pruning during panning or when dataset is already small
    const total = chartState.allData.length;
    if (isPanningRef.current || total === 0) {
      return;
    }

    // Debounce to avoid frequent slicing during quick interactions
    if (pruneTimeoutRef.current) {
      window.clearTimeout(pruneTimeoutRef.current);
    }

    pruneTimeoutRef.current = window.setTimeout(() => {
      const bufferSize = BUFFER_SIZE; // retention chunk
      const viewStart = Math.max(0, Math.floor(chartState.currentViewStart));
      const viewEnd = Math.min(total - 1, Math.ceil(chartState.currentViewEnd));

      // Simplified rule: keep at most 2 * BUFFER_SIZE overall by centering around view when possible
      const desiredWindow = Math.min(total, BUFFER_SIZE * 2);
      const keepStart = Math.max(0, Math.min(viewStart, total - desiredWindow));
      const preliminaryEnd = Math.min(total - 1, Math.max(viewEnd, desiredWindow - 1));
      const keepEnd = Math.min(preliminaryEnd, keepStart + desiredWindow - 1);

      const leftExcess = keepStart; // number of points before keepStart
      const rightExcess = total - 1 - keepEnd; // number of points after keepEnd

      // Prune whenever total exceeds allowed window
      const shouldPrune = total > desiredWindow && (leftExcess > 0 || rightExcess > 0);
      if (!shouldPrune) {
        return;
      }

      // Slice to the retention window
      const newAllData = chartState.allData.slice(keepStart, keepEnd + 1);

      // Adjust viewport to new indices after slice
      const newViewStart = chartState.currentViewStart - keepStart;
      const newViewEnd = chartState.currentViewEnd - keepStart;

      // Update buffer range ref to match new dataset
      const newBufferStart = Math.max(0, Math.floor(newViewStart) - bufferSize);
      const newBufferEnd = Math.min(newAllData.length - 1, Math.ceil(newViewEnd) + bufferSize);
      currentBufferRangeRef.current = { start: newBufferStart, end: newBufferEnd };

      // Commit updates
      chartActions.setAllData(newAllData);
      chartActions.setViewport(newViewStart, newViewEnd);
    }, 200);

    return () => {
      if (pruneTimeoutRef.current) {
        window.clearTimeout(pruneTimeoutRef.current);
      }
    };
  }, [chartState.currentViewStart, chartState.currentViewEnd, chartState.allData.length]);

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
        {chartState.isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading chart data...</p>
            </div>
          </div>
        ) : chartState.error ? (
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
            {/* Custom Title Component */}
            <div className="mb-4 px-2 h-12 flex items-center">
              {chartState.hoverData?.data ? (
                <div className="flex justify-between items-center w-full">
                  <div className="flex flex-col">
                    <span className="font-bold text-foreground text-lg">{symbol}</span>
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
                  <span className="font-bold text-foreground text-lg">{symbol}</span>
                </div>
              )}
            </div>

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
            <span>Total: {chartState.allData.length}</span>
            <span>Visible: {CHART_DATA_POINTS}</span>
            <span>
              View:{' '}
              {(() => {
                const actualStart = Math.max(0, chartState.currentViewStart);
                const actualEnd = Math.min(chartState.allData.length - 1, chartState.currentViewEnd);
                const actualPoints = actualEnd - actualStart + 1;
                return `${Math.round(actualStart)}-${Math.round(actualEnd)} (${Math.round(actualPoints)})`;
              })()}
            </span>
            <span>TF: {timeframe || 'Loading...'}</span>
          </div>
          <div className="flex items-center space-x-4">
            {/* Chart State Information */}
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${chartState.chartLoaded ? 'bg-green-500' : 'bg-gray-500'}`}></div>
              <span>{chartState.chartLoaded ? 'Chart Ready' : 'Loading...'}</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span>Live</span>
            </div>
            <div className="flex items-center space-x-2">
              <div
                className={`w-2 h-2 rounded-full ${chartWebSocket.isConnected ? 'bg-green-500' : 'bg-red-500'}`}
              ></div>
              <span>{chartWebSocket.isConnected ? 'WebSocket Connected' : 'WebSocket Disconnected'}</span>
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
