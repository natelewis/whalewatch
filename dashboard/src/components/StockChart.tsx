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
import {
  formatPrice,
  processChartData,
  calculateInnerDimensions,
  createCustomTimeAxis,
  createYAxis,
  applyAxisStyling,
  isValidChartData,
} from '../utils/chartDataUtils';
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
} from '../constants';
import { BarChart3, Settings, Play, Pause, RotateCcw, ArrowRight, Wifi, WifiOff } from 'lucide-react';

interface StockChartProps {
  symbol: string;
  onSymbolChange: (symbol: string) => void;
}

// ============================================================================
// Constants are now imported from centralized constants
// ============================================================================

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

// ============================================================================

const StockChart: React.FC<StockChartProps> = ({ symbol }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Use consolidated state management
  const { state: chartState, actions: chartActions } = useChartStateManager(symbol, null);

  // Use new utility hooks
  const { isValidData, getVisibleData } = useChartDataProcessor(chartState.allData);

  // Force re-render when D3 state changes
  const [, forceUpdate] = useState({});
  const _forceRerender = (): void => forceUpdate({});

  // Local state for timeframe management
  const [timeframe, setTimeframe] = useState<ChartTimeframe | null>(null);

  // Debug logging for data state
  useEffect(() => {
    console.log('Chart data state:', {
      allDataLength: chartState.allData.length,
      isValidData,
      isLoading: chartState.isLoading,
      error: chartState.error,
      symbol,
      timeframe,
    });
  }, [chartState.allData.length, isValidData, chartState.isLoading, chartState.error, symbol, timeframe]);

  // Local state for current transform (for debugging)
  const [currentTransform, setCurrentTransform] = useState<d3.ZoomTransform | null>(null);

  // Data points are now managed through chart state
  const manualRenderInProgressRef = useRef(false);

  // Track current buffer range to know when to re-render (use ref to avoid stale closures)
  const currentBufferRangeRef = useRef<{ start: number; end: number } | null>(null);

  // Track if we're currently in a panning operation to prevent infinite loops
  const isPanningRef = useRef(false);

  // Track if we're currently loading data to prevent duplicate requests
  const isLoadingDataRef = useRef(false);

  // Track if chart has been created to prevent unnecessary re-creation
  const chartCreatedRef = useRef(false);

  // Track if initial view has been set to prevent repeated setup
  const initialViewSetRef = useRef(false);

  // Track if initial render has been completed to prevent recursive rendering
  const initialRenderCompletedRef = useRef(false);

  // Track if initial data has been loaded to prevent duplicate loading
  const initialDataLoadedRef = useRef(false);

  // Track if this is the initial mount to prevent timeframe effect from running
  const isInitialMountRef = useRef(true);

  // Track last processed WebSocket data to prevent duplicate processing
  const lastProcessedDataRef = useRef<string | null>(null);

  // Store reference to the zoom behavior for programmatic control
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  // Store reference to the fixed Y-scale domain to avoid stale closure issues
  const fixedYScaleDomainRef = useRef<[number, number] | null>(null);

  // Store reference to the current data to avoid stale closure issues
  const currentDataRef = useRef<CandlestickData[]>([]);

  // Store reference to the current dimensions to avoid stale closure issues
  const currentDimensionsRef = useRef<ChartDimensions>({
    width: 0,
    height: 0,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });

  // Update dimensions ref when dimensions change
  useEffect(() => {
    currentDimensionsRef.current = chartState.dimensions;
  }, [chartState.dimensions]);

  // Update data ref when chart data changes
  useEffect(() => {
    currentDataRef.current = chartState.allData;
  }, [chartState.allData]);

  // Trigger chart re-render when allData changes (for data loading)
  useEffect(() => {
    if (chartState.chartLoaded && chartState.chartExists && chartState.allData.length > 0) {
      console.log('🔄 allData changed, triggering chart re-render:', {
        allDataLength: chartState.allData.length,
        chartLoaded: chartState.chartLoaded,
        chartExists: chartState.chartExists,
      });

      // Get current transform to preserve view position
      const currentZoomTransform = svgRef.current ? d3.zoomTransform(svgRef.current) : d3.zoomIdentity;

      // Calculate new chart state with updated data
      const calculations = calculateChartState({
        dimensions: chartState.dimensions,
        allChartData: chartState.allData,
        transform: currentZoomTransform,
        fixedYScaleDomain: chartState.fixedYScaleDomain,
      });

      // Update clip-path to accommodate expanded dataset
      if (svgRef.current) {
        updateClipPath(svgRef.current as SVGSVGElement, chartState.allData, chartState.dimensions);
      }

      // Update X-axis with new data
      if (svgRef.current) {
        const xAxisGroup = d3.select(svgRef.current).select<SVGGElement>('.x-axis');
        if (!xAxisGroup.empty()) {
          const { innerHeight: axisInnerHeight } = calculateInnerDimensions(chartState.dimensions);
          xAxisGroup.attr('transform', `translate(0,${axisInnerHeight})`);
          xAxisGroup.call(createCustomTimeAxis(calculations.transformedXScale, chartState.allData));
          applyAxisStyling(xAxisGroup);
        }
      }

      // Update Y-axis
      if (svgRef.current) {
        const yAxisGroup = d3.select(svgRef.current).select<SVGGElement>('.y-axis');
        if (!yAxisGroup.empty()) {
          yAxisGroup.call(createYAxis(calculations.transformedYScale));
          applyAxisStyling(yAxisGroup);
        }
      }

      // Update chart content group transform
      if (svgRef.current) {
        const chartContentGroup = d3.select(svgRef.current).select<SVGGElement>('.chart-content');
        if (!chartContentGroup.empty()) {
          chartContentGroup.attr('transform', calculations.transformString);
        }
      }

      // Re-render candlesticks with updated data
      if (svgRef.current) {
        renderCandlestickChartWithCallback(svgRef.current as SVGSVGElement, calculations);
      }

      // Update buffer range
      const bufferSize = BUFFER_SIZE;
      const dataLength = chartState.allData.length;
      const marginSize = MARGIN_SIZE;
      const atDataStart = calculations.viewStart <= marginSize;
      const atDataEnd = calculations.viewEnd >= dataLength - marginSize;

      let actualStart, actualEnd;

      if (atDataStart && atDataEnd) {
        actualStart = 0;
        actualEnd = dataLength - 1;
      } else if (atDataStart) {
        actualStart = 0;
        actualEnd = Math.min(dataLength - 1, Math.ceil(calculations.viewEnd) + bufferSize);
      } else if (atDataEnd) {
        actualStart = Math.max(0, Math.floor(calculations.viewStart) - bufferSize);
        actualEnd = dataLength - 1;
      } else {
        actualStart = Math.max(0, Math.floor(calculations.viewStart) - bufferSize);
        actualEnd = Math.min(dataLength - 1, Math.ceil(calculations.viewEnd) + bufferSize);
      }

      currentBufferRangeRef.current = { start: actualStart, end: actualEnd };

      console.log('✅ Chart re-rendered with updated data:', {
        allDataLength: calculations.allData.length,
        viewRange: `${calculations.viewStart}-${calculations.viewEnd}`,
        bufferRange: `${actualStart}-${actualEnd}`,
      });
    }
  }, [chartState.allData.length]); // Only trigger when data length changes

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
  const loadMoreDataOnBufferedRender = useCallback((): void => {
    if (timeframe === null) {
      console.warn('Cannot auto-load more data: no timeframe selected');
      return;
    }

    // Only load more data if we haven't reached the maximum yet
    if (chartState.allData.length >= 1000) {
      console.log('📊 Max data points reached, skipping auto-load');
      return;
    }

    // Calculate buffer size the same way as in renderCandlestickChart
    const bufferSize = BUFFER_SIZE;

    // Add the same amount of data that we're rendering in the buffer
    const newDataPoints = Math.min(chartState.allData.length + bufferSize, 1000);

    // Calculate endTime based on the oldest data point we currently have
    // Use ref to avoid stale closure issues
    const currentData = currentDataRef.current;
    const oldestDataPoint = currentData[0];
    const endTime = oldestDataPoint ? oldestDataPoint.timestamp : undefined;

    console.log('🔄 Auto-loading more historical data on buffered render (preserving current view):', {
      currentPoints: chartState.allData.length,
      newPoints: newDataPoints,
      bufferSize,
      pointsToAdd: bufferSize,
      symbol,
      timeframe,
      currentDataLength: currentData.length,
      endTime: endTime ? new Date(endTime).toISOString() : 'current time',
      oldestDataTime: oldestDataPoint ? new Date(oldestDataPoint.timestamp).toISOString() : 'none',
    });

    // Use the API service directly with the increased data points
    apiService
      .getChartData(symbol, timeframe, newDataPoints, endTime, 'past')
      .then(response => {
        const { formattedData } = processChartData(response.bars);

        console.log('📊 Auto-load before setAllData (preserving current view):', {
          currentAllDataLength: currentDataRef.current.length,
          newFormattedDataLength: formattedData.length,
        });

        // For auto-load during panning, merge new data with existing data
        // to preserve all previously loaded data points
        const mergedData = mergeHistoricalData(currentDataRef.current, formattedData);
        chartActions.setAllData(mergedData);

        console.log('✅ Successfully auto-loaded more data (view preserved):', {
          newDataLength: formattedData.length,
          limit: newDataPoints,
        });
      })
      .catch(error => {
        console.error('Failed to auto-load more data:', error);
        // No need to revert - data points are managed by allData.length
      });
  }, [timeframe, chartState.allData.length, symbol, chartActions]);

  // Wrapper function that renders candlesticks and triggers data loading for non-panning cases
  const renderCandlestickChartWithCallback = useCallback(
    (svgElement: SVGSVGElement, calculations: ChartCalculations): void => {
      renderCandlestickChart(svgElement, calculations);

      // For non-panning cases, only trigger data loading if viewing historical data
      const totalDataLength = calculations.allData.length;
      // 10 point buffer from right edge
      const isViewingHistoricalData = calculations.viewEnd < totalDataLength - 10;
      const isCurrentlyPanning = isPanningRef.current;

      // Only auto-load for non-panning cases when viewing historical data
      if (!isCurrentlyPanning && isViewingHistoricalData) {
        console.log('🔄 Triggering auto-load for historical data view (non-panning):', {
          viewEnd: calculations.viewEnd,
          totalDataLength,
          isViewingHistoricalData,
          isCurrentlyPanning,
        });
        loadMoreDataOnBufferedRender();
      } else {
        console.log('⏭️ Skipping auto-load (non-panning):', {
          viewEnd: calculations.viewEnd,
          totalDataLength,
          isViewingHistoricalData,
          isCurrentlyPanning,
          reason: isCurrentlyPanning ? 'panning (handled elsewhere)' : 'viewing recent data',
        });
      }
    },
    [loadMoreDataOnBufferedRender]
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

  // Function to load more data to the left (historical data) using buffer size
  const loadMoreDataLeft = (): void => {
    if (timeframe === null) {
      console.warn('Cannot load more data: no timeframe selected');
      return;
    }

    // Only load more data if we haven't reached the maximum yet
    if (chartState.allData.length >= 1000) {
      console.log('📊 Max data points reached, skipping left data load');
      return;
    }

    // Calculate buffer size the same way as in auto-loading
    const bufferSize = BUFFER_SIZE;

    // Add the same amount of data that we're rendering in the buffer
    const newDataPoints = Math.min(chartState.allData.length + bufferSize, 1000);

    // Calculate endTime based on the oldest data point we currently have
    // Use ref to avoid stale closure issues
    const currentData = currentDataRef.current;
    const oldestDataPoint = currentData[0];
    const endTime = oldestDataPoint ? oldestDataPoint.timestamp : undefined;

    console.log('🔄 Loading more data to the LEFT (historical):', {
      currentPoints: chartState.allData.length,
      newPoints: newDataPoints,
      bufferSize,
      pointsToAdd: bufferSize,
      symbol,
      timeframe,
      currentDataLength: currentData.length,
      endTime: endTime ? new Date(endTime).toISOString() : 'current time',
      oldestDataTime: oldestDataPoint ? new Date(oldestDataPoint.timestamp).toISOString() : 'none',
    });

    // Use the API service directly with the increased data points
    apiService
      .getChartData(symbol, timeframe, newDataPoints, endTime, 'past')
      .then(response => {
        const { formattedData: newData } = processChartData(response.bars);

        console.log('📊 Before merging left data:', {
          currentAllDataLength: chartState.allData.length,
          newDataLength: newData.length,
        });

        // Merge new data with existing data instead of replacing it
        const mergedData = mergeHistoricalData(chartState.allData, newData);

        console.log('📊 After merging left data:', {
          originalDataLength: chartState.allData.length,
          newDataLength: newData.length,
          mergedDataLength: mergedData.length,
          dataAdded: mergedData.length - chartState.allData.length,
        });

        chartActions.setAllData(mergedData);

        console.log('✅ Successfully loaded more data to the LEFT:', {
          mergedDataLength: mergedData.length,
          limit: newDataPoints,
          dataAdded: mergedData.length - chartState.allData.length,
        });

        // Force a re-render with the merged data immediately
        if (svgRef.current && chartState.chartLoaded) {
          console.log('🔄 Forcing immediate re-render with left data');

          // Set flag to prevent React effect from overriding
          manualRenderInProgressRef.current = true;

          // Get current transform to preserve the current view position
          const currentZoomTransform = d3.zoomTransform(svgRef.current);

          // Calculate chart state with the MERGED data
          // Use the locked Y-scale domain from ref to prevent price level shifting
          const lockedYScaleDomain = fixedYScaleDomainRef.current;

          const calculations = calculateChartState({
            dimensions: chartState.dimensions,
            allChartData: mergedData, // Use the merged data
            transform: currentZoomTransform, // Preserve current view position
            fixedYScaleDomain: lockedYScaleDomain, // Use the LOCKED domain, never recalculate
          });

          // Update clip-path to accommodate the expanded dataset
          updateClipPath(svgRef.current as SVGSVGElement, mergedData, chartState.dimensions);

          // Update X-axis with the merged data
          const xAxisGroup = d3.select(svgRef.current).select<SVGGElement>('.x-axis');
          if (!xAxisGroup.empty()) {
            const { innerHeight: axisInnerHeight } = calculateInnerDimensions(chartState.dimensions);

            xAxisGroup.attr('transform', `translate(0,${axisInnerHeight})`);
            xAxisGroup.call(createCustomTimeAxis(calculations.transformedXScale, mergedData));
            applyAxisStyling(xAxisGroup);
          }

          // Update Y-axis using the LOCKED Y-scale domain
          const yAxisGroup = d3.select(svgRef.current).select<SVGGElement>('.y-axis');
          if (!yAxisGroup.empty()) {
            const { innerWidth: axisInnerWidth } = calculateInnerDimensions(chartState.dimensions);
            yAxisGroup.attr('transform', `translate(${axisInnerWidth},0)`);

            // Use the SAME Y-scale that the candlesticks use to ensure perfect alignment
            yAxisGroup.call(createYAxis(calculations.baseYScale));
            applyAxisStyling(yAxisGroup);
          }

          // Re-render with merged data (preserving current view position)
          renderCandlestickChartWithCallback(svgRef.current as SVGSVGElement, calculations);

          console.log('✅ Left data re-render completed:', {
            allDataLength: calculations.allData.length,
            viewRange: `${calculations.viewStart}-${calculations.viewEnd}`,
            currentTransformX: currentZoomTransform.x,
            currentTransformY: currentZoomTransform.y,
          });

          // Reset flag after a delay
          setTimeout(() => {
            manualRenderInProgressRef.current = false;
          }, 1000);
        }
      })
      .catch(error => {
        console.error('Failed to load more data to the left:', error);
        // No need to revert - data points are managed by allData.length
      });
  };

  // Function to load more data to the right (future data) using buffer size
  const loadMoreDataRight = (): void => {
    if (timeframe === null) {
      console.warn('Cannot load more data: no timeframe selected');
      return;
    }

    // Only load more data if we haven't reached the maximum yet
    if (chartState.allData.length >= 500) {
      console.log('📊 Max data points reached, skipping right data load');
      return;
    }

    // Calculate buffer size the same way as in auto-loading
    const bufferSize = BUFFER_SIZE;

    // Add the same amount of data that we're rendering in the buffer
    const newDataPoints = Math.min(chartState.allData.length + bufferSize, 500);

    // For right data loading, we want to get data from the newest point forward
    // Use ref to avoid stale closure issues
    const currentData = currentDataRef.current;
    const newestDataPoint = currentData[currentData.length - 1];
    const startTime = newestDataPoint ? newestDataPoint.timestamp : undefined;

    console.log('🔄 Loading more data to the RIGHT (future):', {
      currentPoints: chartState.allData.length,
      newPoints: newDataPoints,
      bufferSize,
      pointsToAdd: bufferSize,
      symbol,
      timeframe,
      currentDataLength: currentData.length,
      startTime: startTime ? new Date(startTime).toISOString() : 'current time',
      newestDataTime: newestDataPoint ? new Date(newestDataPoint.timestamp).toISOString() : 'none',
    });

    // Use the API service directly with the increased data points
    // For right data, we don't specify startTime to get the most recent data
    apiService
      .getChartData(symbol, timeframe, newDataPoints, undefined, 'future')
      .then(response => {
        const { formattedData: newData } = processChartData(response.bars);

        console.log('📊 Before merging right data:', {
          currentAllDataLength: chartState.allData.length,
          newDataLength: newData.length,
        });

        // Merge new data with existing data instead of replacing it
        const mergedData = mergeHistoricalData(chartState.allData, newData);

        console.log('📊 After merging right data:', {
          originalDataLength: chartState.allData.length,
          newDataLength: newData.length,
          mergedDataLength: mergedData.length,
          dataAdded: mergedData.length - chartState.allData.length,
        });

        chartActions.setAllData(mergedData);

        console.log('✅ Successfully loaded more data to the RIGHT:', {
          mergedDataLength: mergedData.length,
          limit: newDataPoints,
          dataAdded: mergedData.length - chartState.allData.length,
        });

        // Force a re-render with the merged data immediately
        if (svgRef.current && chartState.chartLoaded) {
          console.log('🔄 Forcing immediate re-render with right data');

          // Set flag to prevent React effect from overriding
          manualRenderInProgressRef.current = true;

          // Get current transform to preserve the current view position
          const currentZoomTransform = d3.zoomTransform(svgRef.current);

          // Calculate chart state with the MERGED data
          // Use the locked Y-scale domain from ref to prevent price level shifting
          const lockedYScaleDomain = fixedYScaleDomainRef.current;

          const calculations = calculateChartState({
            dimensions: chartState.dimensions,
            allChartData: mergedData, // Use the merged data
            transform: currentZoomTransform, // Preserve current view position
            fixedYScaleDomain: lockedYScaleDomain, // Use the LOCKED domain, never recalculate
          });

          // Update clip-path to accommodate the expanded dataset
          updateClipPath(svgRef.current as SVGSVGElement, mergedData, chartState.dimensions);

          // Update X-axis with the merged data
          const xAxisGroup = d3.select(svgRef.current).select<SVGGElement>('.x-axis');
          if (!xAxisGroup.empty()) {
            const { innerHeight: axisInnerHeight } = calculateInnerDimensions(chartState.dimensions);

            xAxisGroup.attr('transform', `translate(0,${axisInnerHeight})`);
            xAxisGroup.call(createCustomTimeAxis(calculations.transformedXScale, mergedData));
            applyAxisStyling(xAxisGroup);
          }

          // Update Y-axis using the LOCKED Y-scale domain
          const yAxisGroup = d3.select(svgRef.current).select<SVGGElement>('.y-axis');
          if (!yAxisGroup.empty()) {
            const { innerWidth: axisInnerWidth } = calculateInnerDimensions(chartState.dimensions);
            yAxisGroup.attr('transform', `translate(${axisInnerWidth},0)`);

            // Use the SAME Y-scale that the candlesticks use to ensure perfect alignment
            yAxisGroup.call(createYAxis(calculations.baseYScale));
            applyAxisStyling(yAxisGroup);
          }

          // Re-render with merged data (preserving current view position)
          renderCandlestickChartWithCallback(svgRef.current as SVGSVGElement, calculations);

          console.log('✅ Right data re-render completed:', {
            allDataLength: calculations.allData.length,
            viewRange: `${calculations.viewStart}-${calculations.viewEnd}`,
            currentTransformX: currentZoomTransform.x,
            currentTransformY: currentZoomTransform.y,
          });

          // Reset flag after a delay
          setTimeout(() => {
            manualRenderInProgressRef.current = false;
          }, 1000);
        }
      })
      .catch(error => {
        console.error('Failed to load more data to the right:', error);
        // No need to revert - data points are managed by allData.length
      });
  };

  // Function to move chart to rightmost position (newest data)
  const moveToRightmost = (): void => {
    if (!isValidData || chartState.allData.length === 0) {
      return;
    }

    const totalDataLength = chartState.allData.length;
    const newEndIndex = totalDataLength - 1;
    const newStartIndex = Math.max(0, totalDataLength - CHART_DATA_POINTS);

    console.log('🎯 Moving to rightmost position:', {
      totalDataLength,
      newStartIndex,
      newEndIndex,
      rangeSize: newEndIndex - newStartIndex + 1,
    });

    // Calculate the transform needed to show the rightmost data
    const { innerWidth } = calculateInnerDimensions(chartState.dimensions);
    const bandWidth = innerWidth / CHART_DATA_POINTS;

    // Calculate how much we need to pan to the right to show the newest data
    const rightmostDataIndex = totalDataLength - 1;
    const panOffsetPixels = (rightmostDataIndex - newEndIndex) * bandWidth;

    // Create a transform that pans to the rightmost position
    const transform = d3.zoomIdentity.translate(panOffsetPixels, 0);

    // Update the current transform state
    setCurrentTransform(transform);

    // Calculate the new chart state with this transform
    const calculations = calculateChartState({
      dimensions: chartState.dimensions,
      allChartData: chartState.allData,
      transform,
      fixedYScaleDomain: chartState.fixedYScaleDomain,
    });

    // Update view state using centralized calculations
    chartActions.setCurrentViewStart(calculations.viewStart);
    chartActions.setCurrentViewEnd(calculations.viewEnd);

    // Apply transform to the main chart content group
    if (svgRef.current) {
      const svg = d3.select(svgRef.current);

      // Update the D3 zoom behavior's internal transform state
      if (zoomBehaviorRef.current) {
        svg.call(zoomBehaviorRef.current.transform, transform);
      }

      const chartContentGroup = svg.select<SVGGElement>('.chart-content');
      if (!chartContentGroup.empty()) {
        chartContentGroup.attr('transform', calculations.transformString);
      }

      // Update X-axis using time-based scale that aligns with candlesticks
      const xAxisGroup = svg.select<SVGGElement>('.x-axis');
      if (!xAxisGroup.empty()) {
        const { innerHeight: axisInnerHeight } = calculateInnerDimensions(chartState.dimensions);

        xAxisGroup.attr('transform', `translate(0,${axisInnerHeight})`);
        xAxisGroup.call(createCustomTimeAxis(calculations.transformedXScale, chartState.allData));
        applyAxisStyling(xAxisGroup);
      }

      // Update Y-axis using centralized calculations
      const yAxisGroup = svg.select<SVGGElement>('.y-axis');
      if (!yAxisGroup.empty()) {
        yAxisGroup.call(createYAxis(calculations.transformedYScale));
        applyAxisStyling(yAxisGroup);
      }

      // Re-render candlesticks with the new view
      renderCandlestickChartWithCallback(svgRef.current as SVGSVGElement, calculations);

      // Update buffer range with smart boundary-aware buffer
      const bufferSize = BUFFER_SIZE;
      const dataLength = chartState.allData.length;
      const marginSize = MARGIN_SIZE;
      const atDataStart = calculations.viewStart <= marginSize; // Within margin of data start
      const atDataEnd = calculations.viewEnd >= dataLength - marginSize; // Within margin of data end

      let actualStart, actualEnd;

      if (atDataStart && atDataEnd) {
        // At both boundaries - use the full data range
        actualStart = 0;
        actualEnd = dataLength - 1;
      } else if (atDataStart) {
        // At start boundary - only buffer forward
        actualStart = 0;
        actualEnd = Math.min(dataLength - 1, Math.ceil(calculations.viewEnd) + bufferSize);
      } else if (atDataEnd) {
        // At end boundary - only buffer backward
        actualStart = Math.max(0, Math.floor(calculations.viewStart) - bufferSize);
        actualEnd = dataLength - 1;
      } else {
        // In the middle - buffer both ways
        actualStart = Math.max(0, Math.floor(calculations.viewStart) - bufferSize);
        actualEnd = Math.min(dataLength - 1, Math.ceil(calculations.viewEnd) + bufferSize);
      }

      currentBufferRangeRef.current = { start: actualStart, end: actualEnd };

      console.log('🔄 Buffer range updated in moveToRightmost:', {
        newBufferRange: `${actualStart}-${actualEnd}`,
        viewRange: `${calculations.viewStart}-${calculations.viewEnd}`,
        bufferSize,
        dataLength,
      });
    }
  };

  // Centralized calculations will be used instead of useChartScales

  // Define timeframes array
  const timeframes: TimeframeConfig[] = useMemo(
    () => [
      { value: '1m', label: '1m', limit: DEFAULT_CHART_DATA_POINTS },
      { value: '5m', label: '5m', limit: DEFAULT_CHART_DATA_POINTS },
      { value: '30m', label: '30m', limit: DEFAULT_CHART_DATA_POINTS },
      { value: '1h', label: '1h', limit: DEFAULT_CHART_DATA_POINTS },
      { value: '2h', label: '2h', limit: DEFAULT_CHART_DATA_POINTS },
      { value: '4h', label: '4h', limit: DEFAULT_CHART_DATA_POINTS },
      { value: '1d', label: '1d', limit: DEFAULT_CHART_DATA_POINTS },
      { value: '1w', label: '1w', limit: DEFAULT_CHART_DATA_POINTS },
      { value: '1M', label: '1M', limit: DEFAULT_CHART_DATA_POINTS },
    ],
    []
  );

  // Chart data management is now handled by useChartStateManager

  // WebSocket for real-time data
  const chartWebSocket = useChartWebSocket({
    symbol,
    isEnabled: chartState.isWebSocketEnabled,
    onChartData: bar => {
      if (chartState.isLive) {
        // Create a unique key for this data point to prevent duplicate processing
        const dataKey = `${bar.t}-${bar.o}-${bar.h}-${bar.l}-${bar.c}`;

        // Skip if we've already processed this exact data point
        if (lastProcessedDataRef.current === dataKey) {
          return;
        }

        lastProcessedDataRef.current = dataKey;
        console.log('📊 Received WebSocket data:', bar);
        chartActions.updateChartWithLiveData(bar);
      }
    },
  });

  // Update visible data when view changes
  useEffect(() => {
    if (isValidData) {
      const newVisibleData = getVisibleData(chartState.currentViewStart, chartState.currentViewEnd);
      // console.log('Updating visible data:', {
      //   currentViewStart: chartState.currentViewStart,
      //   currentViewEnd: chartState.currentViewEnd,
      //   allChartDataLength: chartState.allData.length,
      //   newVisibleDataLength: newVisibleData.length,
      //   newVisibleDataStart: newVisibleData[0]?.time,
      //   newVisibleDataEnd: newVisibleData[newVisibleData.length - 1]?.time,
      // });
      chartActions.setData(newVisibleData);
    }
  }, [chartState.currentViewStart, chartState.currentViewEnd, chartState.allData, isValidData, getVisibleData]); // Removed chartActions

  // Load saved timeframe from localStorage and load initial data
  useEffect(() => {
    if (isLoadingDataRef.current || initialDataLoadedRef.current) {
      console.log('🔄 Data loading already in progress or completed, skipping duplicate request');
      return;
    }

    const result = safeCall(() => {
      return getLocalStorageItem<ChartTimeframe>('chartTimeframe', '1h');
    });

    if (result.isOk()) {
      const savedTimeframe = result.value;
      setTimeframe(savedTimeframe);

      // Load initial data immediately
      console.log('🔄 Loading initial data for symbol:', {
        symbol,
        timeframe: savedTimeframe,
      });
      isLoadingDataRef.current = true;
      initialDataLoadedRef.current = true;
      chartActions.loadChartData(symbol, savedTimeframe, DEFAULT_CHART_DATA_POINTS, undefined, 'past').finally(() => {
        isLoadingDataRef.current = false;
      });
    } else {
      console.warn('Failed to load chart timeframe from localStorage:', createUserFriendlyMessage(result.error));
      setTimeframe('1h');

      // Load initial data with default timeframe
      console.log('🔄 Loading initial data with default timeframe:', {
        symbol,
        timeframe: '1h',
      });
      isLoadingDataRef.current = true;
      initialDataLoadedRef.current = true;
      chartActions.loadChartData(symbol, '1h', DEFAULT_CHART_DATA_POINTS, undefined, 'past').finally(() => {
        isLoadingDataRef.current = false;
      });
    }
  }, [symbol]); // Removed chartActions to prevent infinite loops

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

  // Load chart data when symbol or timeframe changes (but not on initial mount)
  useEffect(() => {
    // Skip on initial mount - let the initial data loading effect handle it
    // But allow timeframe changes after hot reload
    if (isInitialMountRef.current && timeframe === null) {
      isInitialMountRef.current = false;
      return;
    }

    // Only run if timeframe is not null and not currently loading
    if (timeframe !== null && !isLoadingDataRef.current) {
      chartActions.resetChart(); // Reset chart state for new symbol/timeframe
      chartActions.setTimeframe(timeframe);
      chartCreatedRef.current = false; // Allow chart recreation for new timeframe
      initialRenderCompletedRef.current = false; // Allow initial render for new timeframe
      initialDataLoadedRef.current = false; // Allow data loading for new timeframe
      lastProcessedDataRef.current = null; // Reset WebSocket data tracking

      console.log('🔄 Loading new data for symbol/timeframe:', {
        symbol,
        timeframe,
      });
      isLoadingDataRef.current = true;
      chartActions.loadChartData(symbol, timeframe, DEFAULT_CHART_DATA_POINTS, undefined, 'past').finally(() => {
        isLoadingDataRef.current = false;
      });
    }
  }, [symbol, timeframe]); // Removed chartActions to prevent infinite loops

  // Cleanup refs on unmount
  useEffect(() => {
    return () => {
      isLoadingDataRef.current = false;
      chartCreatedRef.current = false;
    };
  }, []);

  // Reset refs when symbol changes
  useEffect(() => {
    chartCreatedRef.current = false;
    initialViewSetRef.current = false;
    initialRenderCompletedRef.current = false;
    initialDataLoadedRef.current = false;
    isInitialMountRef.current = true; // Reset for new symbol
    lastProcessedDataRef.current = null; // Reset WebSocket data tracking
  }, [symbol]);

  // Subscribe to WebSocket when live mode is enabled and WebSocket is enabled
  useEffect(() => {
    if (chartState.isLive && chartState.isWebSocketEnabled) {
      chartWebSocket.subscribeToChartData();
    } else {
      chartWebSocket.unsubscribeFromChartData();
    }
  }, [chartState.isLive, chartState.isWebSocketEnabled]); // Removed chartWebSocket from dependencies

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

        console.log('🔄 Resize detected:', {
          containerWidth: rect.width,
          containerHeight: rect.height,
          newWidth: newDimensions.width,
          newHeight: newDimensions.height,
          currentWidth: chartState.dimensions.width,
          currentHeight: chartState.dimensions.height,
        });

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

      console.log('🔄 Dimensions changed, re-rendering chart:', {
        width: chartState.dimensions.width,
        height: chartState.dimensions.height,
        innerWidth: calculations.innerWidth,
        innerHeight: calculations.innerHeight,
        bandWidth: calculations.innerWidth / CHART_DATA_POINTS,
        baseXScaleDomain: calculations.baseXScale.domain(),
        baseXScaleRange: calculations.baseXScale.range(),
      });

      // Update clip-path for new dimensions
      updateClipPath(svgRef.current as SVGSVGElement, chartState.allData, chartState.dimensions);

      // Update X-axis with new dimensions
      const xAxisGroup = d3.select(svgRef.current).select<SVGGElement>('.x-axis');
      if (!xAxisGroup.empty()) {
        const { innerHeight: axisInnerHeight } = calculateInnerDimensions(chartState.dimensions);

        // Create time-based scale that maps data indices to screen coordinates
        if (chartState.allData.length > 0) {
          console.log('🔄 Updating X-axis on resize:', {
            innerWidth: calculations.innerWidth,
            bandWidth: calculations.innerWidth / CHART_DATA_POINTS,
            scaleDomain: calculations.baseXScale.domain(),
            scaleRange: calculations.baseXScale.range(),
          });

          xAxisGroup.attr('transform', `translate(0,${axisInnerHeight})`);
          xAxisGroup.call(createCustomTimeAxis(calculations.baseXScale, chartState.allData));
          applyAxisStyling(xAxisGroup);
        }
      }

      // Update Y-axis with new dimensions
      const yAxisGroup = d3.select(svgRef.current).select<SVGGElement>('.y-axis');
      if (!yAxisGroup.empty()) {
        const { innerWidth: axisInnerWidth } = calculateInnerDimensions(chartState.dimensions);
        yAxisGroup.attr('transform', `translate(${axisInnerWidth},0)`);
        // Use base Y scale since the chart content group already has the transform applied
        yAxisGroup.call(createYAxis(calculations.baseYScale));
        applyAxisStyling(yAxisGroup);
      }

      // Update chart content group transform
      const chartContentGroup = d3.select(svgRef.current).select<SVGGElement>('.chart-content');
      if (!chartContentGroup.empty()) {
        chartContentGroup.attr('transform', calculations.transformString);
      }

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

  // Set initial view to show newest data when data loads
  useEffect(() => {
    if (isValidData && !initialViewSetRef.current) {
      const totalDataLength = chartState.allData.length;

      // If this is the first load, show newest data with proper buffer setup
      if (chartState.data.length === 0 && totalDataLength > 0) {
        // Set up initial view to show most recent data with full buffer available
        const newEndIndex = totalDataLength - 1;
        const newStartIndex = Math.max(0, totalDataLength - CHART_DATA_POINTS);

        console.log('Initial load - setting view indices:', {
          totalDataLength,
          CHART_DATA_POINTS,
          newStartIndex,
          newEndIndex,
          rangeSize: newEndIndex - newStartIndex + 1,
        });

        chartActions.setViewport(newStartIndex, newEndIndex);
        initialViewSetRef.current = true;
      }
    }
  }, [chartState.allData.length, isValidData]); // Removed chartState.data.length to prevent re-runs

  // Auto-enable live mode when user pans to the rightmost edge
  const [isAtRightEdge, setIsAtRightEdge] = useState(false);
  const lastRightEdgeCheckRef = useRef<number>(0);
  const RIGHT_EDGE_CHECK_INTERVAL_LOCAL = RIGHT_EDGE_CHECK_INTERVAL; // alias for local usage

  useEffect(() => {
    const dataLength = chartState.allData.length;
    const atRightEdge = chartState.currentViewEnd >= dataLength - 5; // Within 5 points of the end
    const now = Date.now();
    const timeSinceLastCheck = now - lastRightEdgeCheckRef.current;

    // Only check for right edge changes if enough time has passed
    if (timeSinceLastCheck >= RIGHT_EDGE_CHECK_INTERVAL_LOCAL) {
      lastRightEdgeCheckRef.current = now;
      setIsAtRightEdge(atRightEdge);

      if (atRightEdge && !chartState.isLive) {
        console.log('User reached right edge - enabling live mode for real-time data');
        chartActions.setIsLive(true);
      } else if (!atRightEdge && chartState.isLive) {
        console.log('User moved away from right edge - disabling live mode');
        chartActions.setIsLive(false);
      }
    }
  }, [chartState.currentViewEnd, chartState.allData.length, chartState.isLive]); // Removed chartActions

  useEffect((): void => {
    // svgRef.current now points to the <svg> element in the DOM
    console.log('SVG element is ready:', svgRef.current);
  }, []);

  // Reset refs on mount to handle hot reload
  useEffect(() => {
    chartCreatedRef.current = false;
    initialRenderCompletedRef.current = false;
    initialDataLoadedRef.current = false;
    isInitialMountRef.current = true;
    lastProcessedDataRef.current = null;
  }, []); // Only run on mount

  // Data length effect removed - chart creation effect now handles both chart creation and initial rendering

  // Create chart when data is available and view is properly set
  useEffect(() => {
    // Only create chart if it hasn't been created yet and we have valid data
    if (chartCreatedRef.current) {
      return; // Chart already created, skip
    }

    // Debug logging for chart creation conditions
    const gElementExists = svgRef.current ? !d3.select(svgRef.current).select('g').empty() : false;
    const shouldCreate =
      isValidData && chartState.allData.length > 0 && svgRef.current && (!chartState.chartExists || !gElementExists);

    console.log('Chart creation effect conditions:', {
      isValidData,
      currentViewEnd: chartState.currentViewEnd,
      dataLength: chartState.data.length,
      allDataLength: chartState.allData.length,
      isLoading: chartState.isLoading,
      error: chartState.error,
      chartExists: chartState.chartExists,
      chartCreatedRef: chartCreatedRef.current,
      svgElementAvailable: !!svgRef.current,
      gElementExists,
      shouldCreate,
    });

    // Set viewport if it's not set yet
    if (isValidData && chartState.allData.length > 0 && chartState.currentViewEnd === 0) {
      const dataLength = chartState.allData.length;
      const viewStart = Math.max(0, dataLength - CHART_DATA_POINTS);
      const viewEnd = dataLength - 1;
      chartActions.setViewport(viewStart, viewEnd);
    }

    if (shouldCreate) {
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

        createChart({
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
            setHoverData: chartActions.setHoverData,
            setChartLoaded: chartActions.setChartLoaded,
            setFixedYScaleDomain: chartActions.setFixedYScaleDomain,
            setChartExists: chartActions.setChartExists,
            setCurrentTransform: setCurrentTransform,
            setZoomBehavior: (behavior: d3.ZoomBehavior<SVGSVGElement, unknown>) => {
              zoomBehaviorRef.current = behavior;
            },
            getFixedYScaleDomain: () => fixedYScaleDomainRef.current,
            getCurrentData: () => currentDataRef.current,
            getCurrentDimensions: () => currentDimensionsRef.current, // Add this to avoid stale dimensions
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
            // Use centralized Y-scale domain calculation
            fixedYScaleDomain = calculateYScaleDomain(calculationsForRender.visibleData);

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

          // Mark initial render as completed
          initialRenderCompletedRef.current = true;
        }
      }
    }

    return undefined; // Explicit return for linter
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

  return (
    <div className="bg-card rounded-lg border border-border h-full flex flex-col">
      {/* Chart Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            <h3 className="text-lg font-semibold text-foreground">{symbol}</h3>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => chartActions.setIsLive(!chartState.isLive)}
                className={`flex items-center space-x-1 px-3 py-1 rounded-md text-sm transition-colors ${
                  chartState.isLive ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {chartState.isLive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                {chartState.isLive ? 'Live' : 'Paused'}
              </button>
              <button
                onClick={() => chartActions.setIsWebSocketEnabled(!chartState.isWebSocketEnabled)}
                className={`flex items-center space-x-1 px-3 py-1 rounded-md text-sm transition-colors ${
                  chartState.isWebSocketEnabled
                    ? 'bg-blue-500 text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
                title={chartState.isWebSocketEnabled ? 'Disable WebSocket' : 'Enable WebSocket'}
              >
                {chartState.isWebSocketEnabled ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {chartState.isWebSocketEnabled ? 'WebSocket' : 'No WS'}
              </button>
              <button
                onClick={() =>
                  timeframe &&
                  chartActions.loadChartData(symbol, timeframe, DEFAULT_CHART_DATA_POINTS, undefined, 'past')
                }
                className="p-1 text-muted-foreground hover:text-foreground"
                title="Refresh data"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                onClick={moveToRightmost}
                className="p-1 text-muted-foreground hover:text-foreground"
                title="Move to newest data"
                disabled={!isValidData || chartState.allData.length === 0}
              >
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={loadMoreDataLeft}
                className="flex items-center space-x-1 px-3 py-1 rounded-md text-sm transition-colors bg-blue-500 text-white hover:bg-blue-600"
                title="Load more historical data to the left (using buffer size)"
                disabled={!timeframe}
              >
                ← Load Left
              </button>
              <button
                onClick={loadMoreDataRight}
                className="flex items-center space-x-1 px-3 py-1 rounded-md text-sm transition-colors bg-green-500 text-white hover:bg-green-600"
                title="Load more future data to the right (using buffer size)"
                disabled={!timeframe}
              >
                Load Right →
              </button>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button className="p-2 text-muted-foreground hover:text-foreground">
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Controls */}
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

          {/* Chart Type - Always Candlestick */}
          <div className="flex items-center space-x-1 px-3 py-1 text-xs bg-primary text-primary-foreground rounded-md">
            <BarChart3 className="h-4 w-4" />
            <span>Candlestick</span>
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
                    <span className="text-sm text-muted-foreground">
                      {new Date(chartState.hoverData.data.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex gap-3 text-sm">
                    <span className="text-muted-foreground">
                      O:{' '}
                      <span className="font-mono text-foreground">{formatPrice(chartState.hoverData.data.open)}</span>
                    </span>
                    <span className="text-muted-foreground">
                      H:{' '}
                      <span className="font-mono text-foreground">{formatPrice(chartState.hoverData.data.high)}</span>
                    </span>
                    <span className="text-muted-foreground">
                      L: <span className="font-mono text-foreground">{formatPrice(chartState.hoverData.data.low)}</span>
                    </span>
                    <span className="text-muted-foreground">
                      C:{' '}
                      <span className="font-mono text-foreground">{formatPrice(chartState.hoverData.data.close)}</span>
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
            <span>Pan: {Math.round(currentTransform?.x || 0)}px</span>
          </div>
          <div className="flex items-center space-x-4">
            {/* Chart State Information */}
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${chartState.chartLoaded ? 'bg-green-500' : 'bg-gray-500'}`}></div>
              <span>{chartState.chartLoaded ? 'Chart Ready' : 'Loading...'}</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${chartState.isLive ? 'bg-green-500' : 'bg-gray-500'}`}></div>
              <span>{chartState.isLive ? 'Live' : 'Historical'}</span>
            </div>
            {chartState.isZooming && (
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-blue-500">Zooming</span>
              </div>
            )}
            {isAtRightEdge && !chartState.isLive && (
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-yellow-500">Auto-live</span>
              </div>
            )}
            {chartState.allData.length > DEFAULT_CHART_DATA_POINTS && (
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                <span className="text-xs text-orange-500">Extended ({chartState.allData.length} pts)</span>
              </div>
            )}
            <span className="text-xs text-muted-foreground">D3.js</span>
          </div>
        </div>

        {/* Additional Debug Information - Collapsible */}
        <details className="mt-2">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
            Debug Details
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-4 text-xs text-muted-foreground">
            <div>
              <div className="font-medium text-foreground mb-1">Data State</div>
              <div>Valid Data: {isValidData ? '✓' : '✗'}</div>
              <div>Chart Exists: {chartState.chartExists ? '✓' : '✗'}</div>
              <div>Data Length: {chartState.data.length}</div>
              <div>All Data Length: {chartState.allData.length}</div>
            </div>
            <div>
              <div className="font-medium text-foreground mb-1">View State</div>
              <div>View Start: {chartState.currentViewStart}</div>
              <div>View End: {chartState.currentViewEnd}</div>
              <div>At Right Edge: {isAtRightEdge ? '✓' : '✗'}</div>
              <div>Y-Scale Fixed: {chartState.fixedYScaleDomain ? '✓' : '✗'}</div>
            </div>
            <div>
              <div className="font-medium text-foreground mb-1">Rendering System</div>
              <div>Chart Points: {CHART_DATA_POINTS}</div>
              <div>Total Data: {chartState.allData.length}</div>
              <div>Rendering: All Data</div>
              <div>Clipping: Viewport</div>
            </div>
            <div>
              <div className="font-medium text-foreground mb-1">Dimensions</div>
              <div>Width: {Math.round(chartState.dimensions.width)}</div>
              <div>Height: {Math.round(chartState.dimensions.height)}</div>
              <div>
                Inner W:{' '}
                {Math.round(
                  chartState.dimensions.width - chartState.dimensions.margin.left - chartState.dimensions.margin.right
                )}
              </div>
              <div>
                Inner H:{' '}
                {Math.round(
                  chartState.dimensions.height - chartState.dimensions.margin.top - chartState.dimensions.margin.bottom
                )}
              </div>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
};

export default StockChart;
