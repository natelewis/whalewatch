import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import Plot from 'react-plotly.js';

// Extend window to include Plotly
declare global {
  interface Window {
    Plotly: any;
  }
}
import { ChartTimeframe, ChartType, DEFAULT_CHART_DATA_POINTS } from '../types';
import { getLocalStorageItem, setLocalStorageItem } from '../utils/localStorage';
import { usePriceTooltip } from '../hooks/usePriceTooltip';
import { useDateTooltip } from '../hooks/useDateTooltip';
import { useMouseHover } from '../hooks/useMouseHover';
import { useChartData } from '../hooks/useChartData';
import { useChartWebSocket } from '../hooks/useChartWebSocket';
import { TimeframeConfig } from '../utils/chartDataUtils';
import {
  BarChart3,
  LineChart,
  Activity,
  Square,
  Settings,
  Play,
  Pause,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface StockChartProps {
  symbol: string;
  onSymbolChange: (symbol: string) => void;
  onPanLeft?: (newRange: [number, number], previousRange: [number, number]) => void;
  onPanRight?: (newRange: [number, number], previousRange: [number, number]) => void;
}

// Helper function to get interval minutes for a timeframe
const getIntervalMinutes = (timeframe: ChartTimeframe): number => {
  const intervalMap: Record<ChartTimeframe, number> = {
    '1m': 1,
    '5m': 5,
    '30m': 30,
    '1h': 60,
    '2h': 120,
    '4h': 240,
    '1d': 1440,
    '1w': 10080,
    '1M': 43200, // 30 days
  };
  return intervalMap[timeframe] || 60;
};

// Plotly internal padding constant
const PLOTLY_INTERNAL_PADDING = 35;

// Manual offset adjustments for spike line positioning
const SPIKE_LINE_OFFSET_X = 0; // Adjust horizontal positioning
const SPIKE_LINE_OFFSET_Y = 0; // Adjust vertical positioning
const SPIKE_LINE_SCALE_X = 1.0; // Adjust horizontal scaling
const SPIKE_LINE_SCALE_Y = 1.0; // Adjust vertical scaling

// Virtual bounding box expansion for spike line calculations
const VIRTUAL_BOX_EXPAND_X = 0; // Expand virtual box horizontally (pixels)
const VIRTUAL_BOX_EXPAND_Y = 0; // Expand virtual box vertically (pixels)

const StockChartComponent: React.FC<StockChartProps> = ({
  symbol,
  onSymbolChange,
  onPanLeft,
  onPanRight,
}) => {
  const [timeframe, setTimeframe] = useState<ChartTimeframe | null>(null);
  const [chartType, setChartType] = useState<ChartType>('candlestick');
  const [isLive, setIsLive] = useState(false);

  const [topPrice, setTopPrice] = useState<number | null>(null);
  const [minPrice, setMinPrice] = useState<number | null>(null);
  const [effectiveHeight, setEffectiveHeight] = useState<number | null>(null);
  const [effectiveWidth, setEffectiveWidth] = useState<number | null>(null);
  const [chartRef, setChartRef] = useState<HTMLDivElement | null>(null);

  // Hover state for spike lines and data point tracking
  const [mouseX, setMouseX] = useState<number | null>(null);
  const [mouseY, setMouseY] = useState<number | null>(null);
  const [dataPointIndex, setDataPointIndex] = useState<number | null>(null);

  // Hover state for OHLC data in title
  const [hoveredOHLC, setHoveredOHLC] = useState<{
    open: number;
    high: number;
    low: number;
    close: number;
  } | null>(null);

  // Chart interaction state
  const [currentRange, setCurrentRange] = useState<[number, number] | null>(null);
  const initialRangeSet = useRef(false);

  // Continuous data loading state
  const [lastScrollTime, setLastScrollTime] = useState<number>(0);
  const [lastPanDataLoadTime, setLastPanDataLoadTime] = useState<number>(0);
  const [isNearLeftBoundary, setIsNearLeftBoundary] = useState(false);
  const [isNearRightBoundary, setIsNearRightBoundary] = useState(false);
  const BUFFER_THRESHOLD = 0.1; // 10% from the edge triggers loading
  const SCROLL_DEBOUNCE_MS = 100; // Debounce scroll events
  const PAN_DATA_LOAD_COOLDOWN_MS = 2000; // 2 second cooldown for pan data loading

  // Reset pan
  const resetZoomAndPan = useCallback(() => {
    setCurrentRange(null);
    initialRangeSet.current = false;
  }, []);

  // Define timeframes array early - memoized to prevent unnecessary re-renders
  const timeframes: TimeframeConfig[] = useMemo(
    () => [
      { value: '1m', label: '1m', dataPoints: DEFAULT_CHART_DATA_POINTS },
      { value: '5m', label: '5m', dataPoints: DEFAULT_CHART_DATA_POINTS },
      { value: '30m', label: '30m', dataPoints: DEFAULT_CHART_DATA_POINTS },
      { value: '1h', label: '1h', dataPoints: DEFAULT_CHART_DATA_POINTS },
      { value: '2h', label: '2h', dataPoints: DEFAULT_CHART_DATA_POINTS },
      { value: '4h', label: '4h', dataPoints: DEFAULT_CHART_DATA_POINTS },
      { value: '1d', label: '1d', dataPoints: DEFAULT_CHART_DATA_POINTS },
      { value: '1w', label: '1w', dataPoints: DEFAULT_CHART_DATA_POINTS },
      { value: '1M', label: '1M', dataPoints: DEFAULT_CHART_DATA_POINTS },
    ],
    []
  );

  // Chart data management
  const chartDataHook = useChartData({
    timeframes,
    bufferPoints: 100, // Load 100 buffer points on each side
    enableViewBasedLoading: false, // Disable view-based loading for now
    onDataLoaded: (data, range) => {
      // Data loaded callback - could be used for additional processing
    },
    onError: (error) => {
      // Error callback - could be used for additional error handling
    },
  });

  // Check if we're near boundaries and trigger data loading
  const checkBoundariesAndLoadData = useCallback(() => {
    if (!chartDataHook.chartData.length || !timeframe || !symbol) return;

    // Don't check if already loading
    if (chartDataHook.isLeftLoading || chartDataHook.isRightLoading) return;

    // Get current range from Plotly or use full range
    const totalPoints = chartDataHook.chartData.length;
    if (totalPoints === 0) return;

    const currentXRange = currentRange || [0, totalPoints - 1];
    const leftPosition = Math.max(0, currentXRange[0]);
    const rightPosition = Math.min(totalPoints - 1, currentXRange[1]);

    // Check if we're near the left boundary (need more historical data)
    const leftThreshold = totalPoints * 0.1; // 10% threshold
    const nearLeft = leftPosition <= leftThreshold;

    // Check if we're near the right boundary (need more recent data)
    const rightThreshold = totalPoints * 0.9; // 90% threshold
    const nearRight = rightPosition >= rightThreshold;

    // Update boundary states
    setIsNearLeftBoundary(nearLeft);
    setIsNearRightBoundary(nearRight);

    // Only trigger loading if we're near boundaries and haven't loaded recently
    const now = Date.now();
    const cooldownTime = 3000; // 3 second cooldown to prevent rapid loading

    if (nearLeft && now - lastScrollTime > cooldownTime && !chartDataHook.isLeftLoading) {
      console.log('Loading more data to the left...', {
        leftPosition,
        leftThreshold,
        totalPoints,
      });
      chartDataHook.loadMoreDataLeft(symbol, timeframe);
      setLastScrollTime(now);
    }

    if (nearRight && now - lastScrollTime > cooldownTime && !chartDataHook.isRightLoading) {
      console.log('Loading more data to the right...', {
        rightPosition,
        rightThreshold,
        totalPoints,
      });
      chartDataHook.loadMoreDataRight(symbol, timeframe);
      setLastScrollTime(now);
    }
  }, [chartDataHook, timeframe, symbol, currentRange, lastScrollTime]);

  // Load more data after panning to ensure we always have 2x data available
  const loadMoreDataAfterPan = useCallback(() => {
    console.log('loadMoreDataAfterPan called');

    if (!chartDataHook.chartData.length || !timeframe || !symbol) {
      console.log('loadMoreDataAfterPan: Missing requirements', {
        hasData: !!chartDataHook.chartData.length,
        timeframe,
        symbol,
      });
      return;
    }

    // Don't load if already loading
    if (chartDataHook.isLeftLoading || chartDataHook.isRightLoading) {
      console.log('loadMoreDataAfterPan: Already loading, skipping', {
        isLeftLoading: chartDataHook.isLeftLoading,
        isRightLoading: chartDataHook.isRightLoading,
      });
      return;
    }

    // Check cooldown to prevent too many API calls
    const now = Date.now();
    if (now - lastPanDataLoadTime < PAN_DATA_LOAD_COOLDOWN_MS) {
      console.log('Pan data load cooldown active, skipping...', {
        timeSinceLastLoad: now - lastPanDataLoadTime,
        cooldownMs: PAN_DATA_LOAD_COOLDOWN_MS,
      });
      return;
    }

    const totalPoints = chartDataHook.chartData.length;
    const currentXRange = currentRange || [0, totalPoints - 1];
    const viewportSize = currentXRange[1] - currentXRange[0] + 1;

    // Calculate how much data we have on each side of the current view
    const leftDataPoints = currentXRange[0];
    const rightDataPoints = totalPoints - currentXRange[1] - 1;

    // Target: have at least 2x the current data amount, with buffer on both sides
    const targetTotalPoints = Math.max(totalPoints * 2, totalPoints + viewportSize * 2);
    const additionalPointsNeeded = targetTotalPoints - totalPoints;

    // Ensure we have at least 1 viewport worth of data on each side
    const minBufferSize = Math.max(viewportSize, 50); // At least 50 points or 1 viewport

    console.log('loadMoreDataAfterPan:', {
      totalPoints,
      currentRange: currentXRange,
      viewportSize,
      leftDataPoints,
      rightDataPoints,
      targetTotalPoints,
      additionalPointsNeeded,
      minBufferSize,
    });

    // Load more data if we need it
    if (additionalPointsNeeded > 0) {
      console.log('Additional points needed, checking buffer requirements...');
      let shouldLoadLeft = false;
      let shouldLoadRight = false;

      // Load more historical data (left side) if we don't have enough buffer
      if (leftDataPoints < minBufferSize) {
        console.log('Loading more historical data after pan...', {
          leftDataPoints,
          minBufferSize,
          needed: minBufferSize - leftDataPoints,
        });
        shouldLoadLeft = true;
      } else {
        console.log('Left side has enough buffer, skipping left load', {
          leftDataPoints,
          minBufferSize,
        });
      }

      // Load more recent data (right side) if we don't have enough buffer
      if (rightDataPoints < minBufferSize) {
        console.log('Loading more recent data after pan...', {
          rightDataPoints,
          minBufferSize,
          needed: minBufferSize - rightDataPoints,
        });
        shouldLoadRight = true;
      } else {
        console.log('Right side has enough buffer, skipping right load', {
          rightDataPoints,
          minBufferSize,
        });
      }

      // Update the last load time and trigger loading
      if (shouldLoadLeft || shouldLoadRight) {
        console.log('Triggering data load...', { shouldLoadLeft, shouldLoadRight });
        setLastPanDataLoadTime(now);

        if (shouldLoadLeft) {
          console.log('Calling loadMoreDataLeft...');
          chartDataHook.loadMoreDataLeft(symbol, timeframe);
        }

        if (shouldLoadRight) {
          console.log('Calling loadMoreDataRight...');
          chartDataHook.loadMoreDataRight(symbol, timeframe);
        }
      } else {
        console.log('No data loading needed - both sides have sufficient buffer');
      }
    } else {
      console.log('No additional points needed, skipping data load', {
        additionalPointsNeeded,
        totalPoints,
        targetTotalPoints,
      });
    }
  }, [
    chartDataHook,
    timeframe,
    symbol,
    currentRange,
    lastPanDataLoadTime,
    PAN_DATA_LOAD_COOLDOWN_MS,
  ]);

  // Load saved timeframe from localStorage on component mount
  useEffect(() => {
    try {
      const savedTimeframe = getLocalStorageItem<ChartTimeframe>('chartTimeframe', '1h');
      setTimeframe(savedTimeframe);
    } catch (error) {
      console.warn('Failed to load chart timeframe from localStorage:', error);
      setTimeframe('1h'); // Fallback to default if localStorage fails
    }
  }, []);

  // Save timeframe to localStorage whenever it changes (but only after initial load)
  useEffect(() => {
    if (timeframe !== null) {
      try {
        setLocalStorageItem('chartTimeframe', timeframe);
      } catch (error) {
        console.warn('Failed to save chart timeframe to localStorage:', error);
      }
    }
  }, [timeframe]);

  // Calculate topPrice and minPrice whenever chart data changes
  useEffect(() => {
    if (chartDataHook.chartData.length === 0) {
      setTopPrice(null);
      setMinPrice(null);
      return;
    }

    // Find the highest and lowest prices from the chart data
    let highest = -Infinity;
    let lowest = Infinity;

    chartDataHook.chartData.forEach((candle) => {
      // Check high and low values for each candle
      if (candle.high > highest) highest = candle.high;
      if (candle.low < lowest) lowest = candle.low;
    });

    // Only update if we found valid values
    if (highest !== -Infinity && lowest !== Infinity) {
      setTopPrice(highest);
      setMinPrice(lowest);
    }

    // Reset pan data load indicator when new data arrives
    if (lastPanDataLoadTime > 0) {
      setLastPanDataLoadTime(0);
    }
  }, [chartDataHook.chartData, lastPanDataLoadTime]);

  // Update effective dimensions when chart ref or chart data changes
  useEffect(() => {
    if (!chartRef) {
      setEffectiveHeight(null);
      setEffectiveWidth(null);
      return;
    }

    // Add a small delay to ensure Plotly has rendered
    const timeoutId = setTimeout(() => {
      const plotArea = chartRef.querySelector('.nsewdrag.drag');

      if (!plotArea) {
        setEffectiveHeight(null);
        setEffectiveWidth(null);
        return;
      }

      const rect = plotArea.getBoundingClientRect();

      // Calculate the actual visible chart area height by accounting for Plotly's internal padding
      // The plot area includes some internal padding, so we need to subtract it
      const actualPlotHeight = Math.max(0, (rect.height || 0) - PLOTLY_INTERNAL_PADDING);
      const actualPlotWidth = rect.width || null;

      setEffectiveHeight(actualPlotHeight);
      setEffectiveWidth(actualPlotWidth);
    }, 100); // 100ms delay to ensure Plotly has rendered

    return () => clearTimeout(timeoutId);
  }, [chartRef, chartDataHook.chartData]);

  // Use the price tooltip hook
  const priceTooltip = usePriceTooltip({
    chartRef,
    topPrice,
    minPrice,
    effectiveHeight,
    effectiveWidth,
    enabled: true,
  });

  // Use the date tooltip hook
  const dateTooltip = useDateTooltip({
    chartRef,
    effectiveHeight,
    effectiveWidth,
    enabled: true,
  });

  const mouseHover = useMouseHover({
    chartRef,
    enabled: true,
  });

  // Handle Plotly hover events for time tooltip at bottom
  const handlePlotlyHover = useCallback(
    (event: any) => {
      if (event.points && event.points.length > 0) {
        const point = event.points[0];
        const xIndex = point.pointIndex;
        const xValue = point.x;

        // Handle date and x positioning
        if (xIndex !== undefined && chartDataHook.chartData.length > 0) {
          const sortedData = [...chartDataHook.chartData].sort(
            (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
          );

          if (xIndex < sortedData.length) {
            const hoveredTime = sortedData[xIndex].time;
            const date = new Date(hoveredTime);

            // Format date to show full date and time like "01-02-2003 10:11"
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const year = date.getFullYear();
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const formattedDate = `${month}-${day}-${year} ${hours}:${minutes}`;

            // Show the date tooltip using the hook
            if (chartRef && event.event) {
              const plotArea = chartRef.querySelector('.nsewdrag.drag');
              if (plotArea) {
                const rect = plotArea.getBoundingClientRect();
                const mouseXPos = event.event.clientX - rect.left;
                dateTooltip.showTooltip(formattedDate, rect.left + mouseXPos, rect.bottom);
              }
            }

            // Capture OHLC data for the hovered bar
            const hoveredCandle = sortedData[xIndex];
            setHoveredOHLC({
              open: hoveredCandle.open,
              high: hoveredCandle.high,
              low: hoveredCandle.low,
              close: hoveredCandle.close,
            });

            // Set the data point index for spike line positioning
            setDataPointIndex(xIndex);
          }
        }
      }

      // Handle mouse positioning for tooltips using Plotly's controlled events
      if (chartRef && event.event) {
        const plotArea = chartRef.querySelector('.nsewdrag.drag');
        if (plotArea) {
          const rect = plotArea.getBoundingClientRect();
          const containerRect = chartRef.getBoundingClientRect();

          // Calculate mouse position relative to the plot area
          const mouseXPos = event.event.clientX - rect.left;
          const mouseYPos = event.event.clientY - rect.top;

          // Convert plot area coordinates to container coordinates
          const plotAreaLeft = rect.left - containerRect.left;
          const plotAreaTop = rect.top - containerRect.top;

          // Create virtual bounding box for calculations (expanded from actual plot area)
          const virtualBoxLeft = plotAreaLeft - VIRTUAL_BOX_EXPAND_X;
          const virtualBoxTop = plotAreaTop - VIRTUAL_BOX_EXPAND_Y;
          const virtualBoxWidth = rect.width + VIRTUAL_BOX_EXPAND_X * 2;
          const virtualBoxHeight = rect.height + VIRTUAL_BOX_EXPAND_Y * 2;

          // Convert to relative coordinates (0-1) within the virtual box
          const relativeX = (plotAreaLeft + mouseXPos - virtualBoxLeft) / virtualBoxWidth;
          const relativeY = (plotAreaTop + mouseYPos - virtualBoxTop) / virtualBoxHeight;

          // Always set coordinates if they're finite, clamp them to 0-1 range
          if (isFinite(relativeX) && isFinite(relativeY)) {
            const clampedX = Math.max(0, Math.min(1, relativeX));
            const clampedY = Math.max(0, Math.min(1, relativeY));
            setMouseX(clampedX);
            setMouseY(clampedY);
          }
        }
      }
    },
    [chartRef, chartDataHook.chartData, timeframe, dateTooltip]
  );

  const handlePlotlyUnhover = useCallback(() => {
    setMouseX(null);
    setMouseY(null);
    setDataPointIndex(null);
    setHoveredOHLC(null);
    dateTooltip.hideTooltip();
  }, [dateTooltip]);

  // Handle mouse move on chart container to keep tooltip visible and update spike lines
  const handleChartMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!chartRef || !chartDataHook.chartData.length) return;

      const plotArea = chartRef.querySelector('.nsewdrag.drag');
      if (!plotArea) return;

      const rect = plotArea.getBoundingClientRect();
      const containerRect = chartRef.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      // Check if mouse is within chart bounds
      if (mouseX >= 0 && mouseX <= rect.width && mouseY >= 0 && mouseY <= rect.height) {
        // Update spike line positions for smooth vertical tracking
        const plotAreaLeft = rect.left - containerRect.left;
        const plotAreaTop = rect.top - containerRect.top;

        // Create virtual bounding box for calculations (expanded from actual plot area)
        const virtualBoxLeft = plotAreaLeft - VIRTUAL_BOX_EXPAND_X;
        const virtualBoxTop = plotAreaTop - VIRTUAL_BOX_EXPAND_Y;
        const virtualBoxWidth = rect.width + VIRTUAL_BOX_EXPAND_X * 2;
        const virtualBoxHeight = rect.height + VIRTUAL_BOX_EXPAND_Y * 2;

        // Convert to relative coordinates (0-1) within the virtual box
        const relativeX = (plotAreaLeft + mouseX - virtualBoxLeft) / virtualBoxWidth;
        const relativeY = (plotAreaTop + mouseY - virtualBoxTop) / virtualBoxHeight;

        // Update spike line positions
        if (isFinite(relativeX) && isFinite(relativeY)) {
          const clampedX = Math.max(0, Math.min(1, relativeX));
          const clampedY = Math.max(0, Math.min(1, relativeY));
          setMouseX(clampedX);
          setMouseY(clampedY);
        }

        // Calculate which data point we're hovering over
        const sortedData = [...chartDataHook.chartData].sort(
          (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
        );

        // Convert mouse X position to data point index with better precision
        const relativeXForData = Math.max(0, Math.min(1, mouseX / rect.width));
        const dataIndex = Math.round(relativeXForData * (sortedData.length - 1));

        if (dataIndex >= 0 && dataIndex < sortedData.length) {
          const hoveredTime = sortedData[dataIndex].time;
          const date = new Date(hoveredTime);

          // Format date to show full date and time like "01-02-2003 10:11"
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const year = date.getFullYear();
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          const formattedDate = `${month}-${day}-${year} ${hours}:${minutes}`;

          // Show the date tooltip with smooth positioning
          dateTooltip.showTooltip(formattedDate, event.clientX, rect.bottom);
        }
      }
    },
    [chartRef, chartDataHook.chartData, dateTooltip]
  );

  const handleChartMouseLeave = useCallback(() => {
    setMouseX(null);
    setMouseY(null);
    dateTooltip.hideTooltip();
  }, [dateTooltip]);

  // Add mouse event listeners to chart container for persistent tooltip
  useEffect(() => {
    if (!chartRef) return;

    chartRef.addEventListener('mousemove', handleChartMouseMove);
    chartRef.addEventListener('mouseleave', handleChartMouseLeave);

    return () => {
      chartRef.removeEventListener('mousemove', handleChartMouseMove);
      chartRef.removeEventListener('mouseleave', handleChartMouseLeave);
    };
  }, [chartRef, handleChartMouseMove, handleChartMouseLeave]);

  // Handle Plotly relayout events - keep it simple
  const handlePlotlyRelayout = useCallback(
    (event: any) => {
      console.log('handlePlotlyRelayout called with event:', event);

      let newRange;
      if (event['xaxis.range']) {
        newRange = event['xaxis.range'];
      } else if (event['xaxis.range[0]'] !== undefined && event['xaxis.range[1]'] !== undefined) {
        newRange = [event['xaxis.range[0]'], event['xaxis.range[1]']];
      }

      if (newRange) {
        initialRangeSet.current = true;
        setCurrentRange((previousRange) => {
          console.log('Range change detected:', {
            previousRange,
            newRange,
            chartDataLength: chartDataHook.chartData.length,
            timeframe,
            symbol,
          });

          // Detect pan direction if we have a previous range
          if (previousRange) {
            const rangeDiff = newRange[0] - previousRange[0];
            if (rangeDiff > 0) {
              // Panned left (moved to earlier data)
              console.log('Panned LEFT - moved to earlier data', { rangeDiff });
              onPanLeft?.(newRange, previousRange);
            } else if (rangeDiff < 0) {
              // Panned right (moved to later data)
              console.log('Panned RIGHT - moved to later data', { rangeDiff });
              onPanRight?.(newRange, previousRange);
            }
          }
          return [newRange[0], newRange[1]];
        });

        // Trigger data loading after panning ends to ensure we always have 2x data available
        console.log('Setting timeout to call loadMoreDataAfterPan in 500ms...');
        setTimeout(() => {
          console.log('Timeout fired, calling loadMoreDataAfterPan...');
          loadMoreDataAfterPan();
        }, 500);
      } else {
        console.log('No xaxis.range in event, ignoring');
      }
    },
    [loadMoreDataAfterPan, onPanLeft, onPanRight, chartDataHook.chartData.length, timeframe, symbol]
  );

  // Calculate chart area bounds for spike line positioning
  const [chartBounds, setChartBounds] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    if (!chartRef) return;

    const calculateBounds = () => {
      // Try multiple selectors to find the plot area
      const plotArea =
        chartRef.querySelector('.nsewdrag.drag') ||
        chartRef.querySelector('.plotly .plot') ||
        chartRef.querySelector('.js-plotly-plot .plot');

      if (!plotArea) {
        return null;
      }

      const rect = plotArea.getBoundingClientRect();
      const containerRect = chartRef.getBoundingClientRect();

      const bounds = {
        left: rect.left - containerRect.left,
        top: rect.top - containerRect.top,
        width: rect.width,
        height: rect.height,
      };

      return bounds;
    };

    // Add a longer delay and only calculate when chart data changes significantly
    const timeoutId = setTimeout(() => {
      const bounds = calculateBounds();
      if (bounds) {
        setChartBounds(bounds);
      }
    }, 300); // Increased delay

    return () => clearTimeout(timeoutId);
  }, [chartRef]); // Removed chartDataHook.chartData dependency

  // WebSocket for real-time chart data
  const chartWebSocket = useChartWebSocket({
    symbol,
    onChartData: chartDataHook.updateChartWithLiveData,
  });

  useEffect(() => {
    if (timeframe !== null) {
      chartDataHook.loadChartData(symbol, timeframe);
    }
  }, [symbol, timeframe]);

  // Subscribe to WebSocket when live mode is enabled
  useEffect(() => {
    if (isLive) {
      chartWebSocket.subscribeToChartData();
    } else {
      chartWebSocket.unsubscribeFromChartData();
    }
  }, [isLive]);

  // Check boundaries when range changes (debounced) - only when user actually scrolls
  useEffect(() => {
    // Only check boundaries if we have a current range (user has scrolled)
    if (currentRange) {
      const timeoutId = setTimeout(() => {
        checkBoundariesAndLoadData();
      }, SCROLL_DEBOUNCE_MS);

      return () => clearTimeout(timeoutId);
    }
    return undefined;
  }, [currentRange, checkBoundariesAndLoadData, SCROLL_DEBOUNCE_MS]);

  useEffect(() => {
    if (chartDataHook.chartData.length > 0 && !initialRangeSet.current) {
      setCurrentRange([
        Math.max(0, chartDataHook.chartData.length - 80),
        chartDataHook.chartData.length - 1,
      ]);
      initialRangeSet.current = true;
    }
  }, [chartDataHook.chartData]);

  const prevChartData = useRef(chartDataHook.chartData);

  useEffect(() => {
    const newChartData = chartDataHook.chartData;
    const oldChartData = prevChartData.current;

    console.log('[DEBUG] Data changed:', {
      oldLength: oldChartData.length,
      newLength: newChartData.length,
    });

    if (oldChartData.length > 0 && newChartData.length > oldChartData.length) {
      const diff = newChartData.length - oldChartData.length;
      console.log('[DEBUG] Data added:', { diff });

      // Check if the new data was added to the left
      if (
        newChartData[diff] &&
        oldChartData[0] &&
        newChartData[diff].time === oldChartData[0].time
      ) {
        console.log('[DEBUG] Data added to the left. Shifting range.');
        // Data was added to the left
        setCurrentRange((prevRange) => {
          if (prevRange) {
            const newRange: [number, number] = [prevRange[0] + diff, prevRange[1] + diff];
            console.log('[DEBUG] New range:', newRange);
            return newRange;
          }
          return prevRange;
        });
      } else {
        console.log('[DEBUG] Data added to the right or in the middle.');
      }
    }

    prevChartData.current = newChartData;
  }, [chartDataHook.chartData]);

  // Skip view-based boundary checking for now

  // Handle data changes and update range accordingly
  useEffect(() => {
    if (chartDataHook.chartData.length > 0 && currentRange) {
      const sortedData = [...chartDataHook.chartData].sort(
        (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
      );
      const totalPoints = sortedData.length;

      // If current range is outside the new data bounds, reset it
      if (currentRange[0] >= totalPoints || currentRange[1] >= totalPoints) {
        setCurrentRange(null); // Reset to show full data
      }
    }
  }, [chartDataHook.chartData, currentRange]);

  const plotlyData = useMemo(() => {
    if (chartDataHook.chartData.length === 0) {
      return [];
    }

    // Ensure data is sorted by time and convert to proper format for Plotly
    const sortedData = [...chartDataHook.chartData].sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );
    const x = sortedData.map((_, index) => index); // Use indices for x-axis to eliminate gaps

    console.log('plotlyData generation:', {
      chartDataLength: chartDataHook.chartData.length,
      sortedDataLength: sortedData.length,
      xLength: x.length,
      firstTime: sortedData[0]?.time,
      lastTime: sortedData[sortedData.length - 1]?.time,
    });

    switch (chartType) {
      case 'candlestick':
        return [
          {
            type: 'candlestick' as const,
            x: x,
            open: sortedData.map((d) => d.open),
            high: sortedData.map((d) => d.high),
            low: sortedData.map((d) => d.low),
            close: sortedData.map((d) => d.close),
            increasing: {
              line: { color: '#26a69a', width: 1 },
              fillcolor: '#26a69a',
            },
            decreasing: {
              line: { color: '#ef5350', width: 1 },
              fillcolor: '#ef5350',
            },
            name: symbol,
            line: { width: 1 },
            whiskerwidth: 0.8,
            showlegend: false,
            hoverinfo: 'none' as const,
            customdata: sortedData.map((d) => new Date(d.time).toLocaleString()),
          },
          // Add invisible scatter overlay for hover detection on candlestick charts
          // This is a known workaround for Plotly candlestick hover issues
          {
            type: 'scatter' as const,
            mode: 'lines' as const,
            x: x,
            y: sortedData.map((d) => d.close),
            line: {
              width: 0,
              color: 'transparent',
              shape: 'linear' as const,
            },
            opacity: 0,
            showlegend: false,
            // Enable hover detection but don't show tooltip for this trace
            hoveron: 'points' as const,
            hoverinfo: 'none' as const,
            connectgaps: true, // Connect gaps to ensure continuous hover detection
            // This invisible line enables hover detection across the entire chart
            name: `${symbol}_hover_overlay`,
          },
        ];

      case 'line':
        return [
          {
            type: 'scatter' as const,
            mode: 'lines' as const,
            x: x,
            y: sortedData.map((d) => d.close),
            line: { color: '#26a69a', width: 2 },
            name: symbol,
            hoverinfo: 'none' as const,
            customdata: sortedData.map((d) => new Date(d.time).toLocaleString()),
          },
        ];

      case 'bar':
        return [
          {
            type: 'bar' as const,
            x: x,
            y: sortedData.map((d) => d.close),
            marker: { color: '#26a69a' },
            name: symbol,
            hoverinfo: 'none' as const,
            customdata: sortedData.map((d) => new Date(d.time).toLocaleString()),
          },
        ];

      case 'area':
        return [
          {
            type: 'scatter' as const,
            mode: 'lines' as const,
            x: x,
            y: sortedData.map((d) => d.close),
            fill: 'tonexty' as const,
            line: { color: '#26a69a', width: 2 },
            fillcolor: 'rgba(38, 166, 154, 0.2)',
            name: symbol,
            hoverinfo: 'none' as const,
            customdata: sortedData.map((d) => new Date(d.time).toLocaleString()),
          },
        ];

      default:
        return [];
    }
  }, [chartDataHook.chartData, chartType, symbol]);

  // Memoized time axis calculations
  const timeAxisTicks = useMemo(() => {
    if (chartDataHook.chartData.length === 0) return [];

    const sortedData = [...chartDataHook.chartData].sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );
    const totalPoints = sortedData.length;

    // Calculate number of ticks based on timeframe and data length
    let numTicks: number;

    if (timeframe && ['1m', '5m'].includes(timeframe)) {
      // For smaller intervals, show more ticks (8-12) to provide better time reference
      numTicks = Math.min(12, Math.max(8, Math.floor(totalPoints / 5)));
    } else if (timeframe && ['30m', '1h', '2h', '4h'].includes(timeframe)) {
      // For medium intervals, show moderate number of ticks (6-10)
      numTicks = Math.min(10, Math.max(6, Math.floor(totalPoints / 8)));
    } else {
      // For daily and longer intervals, show fewer ticks (5-8)
      numTicks = Math.min(8, Math.max(5, Math.floor(totalPoints / 10)));
    }

    const step = Math.max(1, Math.floor(totalPoints / (numTicks - 1)));

    const ticks: number[] = [];
    for (let i = 0; i < numTicks; i++) {
      const index = Math.min(i * step, totalPoints - 1);
      ticks.push(index);
    }

    return ticks;
  }, [chartDataHook.chartData, timeframe]);

  const timeAxisLabels = useMemo(() => {
    if (chartDataHook.chartData.length === 0) return [];

    const sortedData = [...chartDataHook.chartData].sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );

    // Determine if we should show only time (for intervals < 1 day)
    const isTimeOnly = timeframe && ['1m', '5m', '30m', '1h', '2h', '4h'].includes(timeframe);

    return timeAxisTicks.map((index: number) => {
      const time = new Date(sortedData[index].time);

      if (isTimeOnly) {
        // Show only time for intervals less than 1 day
        return time.toLocaleString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
      } else {
        // Show date and time for daily and longer intervals
        return time.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
      }
    });
  }, [chartDataHook.chartData, timeframe, timeAxisTicks]);

  // Function to get title data for custom title component
  const getTitleData = useCallback(() => {
    if (hoveredOHLC) {
      const formatPrice = (price: number) => price.toFixed(2);

      // Determine if the bar is bullish (green) or bearish (red)
      const isBullish = hoveredOHLC.close >= hoveredOHLC.open;
      const priceColor = isBullish ? '#26a69a' : '#ef5350'; // Green for bullish, red for bearish

      return {
        symbol: symbol,
        ohlc: {
          open: { value: formatPrice(hoveredOHLC.open), color: priceColor },
          high: { value: formatPrice(hoveredOHLC.high), color: priceColor },
          low: { value: formatPrice(hoveredOHLC.low), color: priceColor },
          close: { value: formatPrice(hoveredOHLC.close), color: priceColor },
        },
      };
    }
    return {
      symbol: symbol,
      timeframe: timeframe || 'Loading...',
    };
  }, [symbol, timeframe, hoveredOHLC]);

  const plotlyLayout = useMemo(() => {
    const layout: any = {
      title: {
        text: '', // Remove Plotly title - we'll use custom title above
        font: { color: '#d1d5db', size: 16 },
      },
      // Disable all zooming globally
      zoom: false,
      // Completely disable selection and zoom interactions
      select2d: false,
      lasso2d: false,
      // Enable native panning for smooth user experience
      dragmode: 'pan',
      xaxis: {
        type: 'linear' as const,
        color: '#d1d5db',
        title: { text: '', font: { color: '#d1d5db' } },
        rangeslider: { visible: false },
        showgrid: false,
        tickmode: 'array',
        tickvals: timeAxisTicks,
        ticktext: timeAxisLabels,
        tickangle: 0,
        showspikes: false,
        showticklabels: true,
        ticklen: 4, // Length of tick marks extending outward
        tickwidth: 1,
        tickcolor: '#6b7280',
        zeroline: false,
        mirror: false, // Don't mirror ticks on opposite side
        // Set initial range only once to prevent resetting during hover
        range: currentRange,
      },
      yaxis: {
        color: '#d1d5db',
        title: { text: '', font: { color: '#d1d5db' } },
        side: 'right',
        showgrid: false,
        showspikes: false,
        showticklabels: true,
        ticklen: 4, // Length of tick marks extending outward
        tickwidth: 1,
        tickcolor: '#6b7280',
        zeroline: false,
        mirror: false, // Don't mirror ticks on opposite side
        tickformat: '.4f', // Format y-axis labels to show 4 decimal places
        fixedrange: true, // Disable vertical zoom
      },
      plot_bgcolor: 'transparent',
      paper_bgcolor: 'transparent',
      font: { color: '#d1d5db' },
      margin: { l: 50, r: 50, t: 50, b: 50 },
      showlegend: false,
      hovermode: 'x unified' as const,
      // Configure hover line and spike appearance
      shapes: [
        // Bottom border line
        {
          type: 'line',
          x0: 0,
          y0: 0,
          x1: 1,
          y1: 0,
          xref: 'paper',
          yref: 'paper',
          line: {
            color: '#6b7280',
            width: 1,
          },
        },
        // Right border line
        {
          type: 'line',
          x0: 1,
          y0: 0,
          x1: 1,
          y1: 1,
          xref: 'paper',
          yref: 'paper',
          line: {
            color: '#6b7280',
            width: 1,
          },
        },
      ],
      annotations: [
        // Temporarily removed hover annotations to prevent snap-back
      ],
      hoverdistance: 20,
      spikedistance: -1, // Use -1 for better spike line behavior
    };

    // Let Plotly auto-scale to show the actual data points with natural gaps
    // No need to force ranges since we want to show the true time distribution

    return layout;
  }, [
    symbol,
    timeframe,
    chartDataHook.dataRange,
    chartDataHook.viewState,
    chartDataHook.chartData,
    currentRange,
  ]);
  const chartTypes: { value: ChartType; label: string; icon: React.ReactNode }[] = [
    { value: 'candlestick', label: 'Candlestick', icon: <BarChart3 className="h-4 w-4" /> },
    { value: 'line', label: 'Line', icon: <LineChart className="h-4 w-4" /> },
    { value: 'bar', label: 'Bar', icon: <Activity className="h-4 w-4" /> },
    { value: 'area', label: 'Area', icon: <Square className="h-4 w-4" /> },
  ];

  return (
    <div className="bg-card rounded-lg border border-border h-full flex flex-col">
      {/* Chart Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            <h3 className="text-lg font-semibold text-foreground">{symbol}</h3>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsLive(!isLive)}
                className={`flex items-center space-x-1 px-3 py-1 rounded-md text-sm transition-colors ${
                  isLive
                    ? 'bg-green-500 text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {isLive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                {isLive ? 'Live' : 'Paused'}
              </button>
              <button
                onClick={() => timeframe && chartDataHook.loadChartData(symbol, timeframe)}
                className="p-1 text-muted-foreground hover:text-foreground"
                title="Refresh data"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                onClick={resetZoomAndPan}
                className="p-1 text-muted-foreground hover:text-foreground"
                title="Reset pan"
              >
                <Square className="h-4 w-4" />
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
            {timeframes.map((tf) => (
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

          {/* Chart Type Selector */}
          <div className="flex space-x-1">
            {chartTypes.map((type) => (
              <button
                key={type.value}
                onClick={() => setChartType(type.value)}
                className={`flex items-center space-x-1 px-3 py-1 text-xs rounded-md transition-colors ${
                  chartType === type.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {type.icon}
                <span>{type.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart Container */}
      <div className="flex-1 p-4">
        {chartDataHook.isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading chart data...</p>
            </div>
          </div>
        ) : chartDataHook.error ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <p className="text-destructive mb-4">{chartDataHook.error}</p>
              <button
                onClick={() => timeframe && chartDataHook.loadChartData(symbol, timeframe)}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              >
                Retry
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full h-full relative" style={{ minHeight: '400px' }}>
            {/* Custom Title Component */}
            <div className="mb-4 px-2 h-12 flex items-center">
              {(() => {
                const titleData = getTitleData();
                if ('ohlc' in titleData) {
                  // Show OHLC data when hovering
                  return (
                    <div className="flex justify-between items-center w-full">
                      <span className="font-bold text-foreground text-lg">{titleData.symbol}</span>
                      <div className="flex gap-3 text-sm">
                        <span className="text-muted-foreground">
                          O:{' '}
                          <span style={{ color: titleData.ohlc.open.color }} className="font-mono">
                            {titleData.ohlc.open.value}
                          </span>
                        </span>
                        <span className="text-muted-foreground">
                          H:{' '}
                          <span style={{ color: titleData.ohlc.high.color }} className="font-mono">
                            {titleData.ohlc.high.value}
                          </span>
                        </span>
                        <span className="text-muted-foreground">
                          L:{' '}
                          <span style={{ color: titleData.ohlc.low.color }} className="font-mono">
                            {titleData.ohlc.low.value}
                          </span>
                        </span>
                        <span className="text-muted-foreground">
                          C:{' '}
                          <span style={{ color: titleData.ohlc.close.color }} className="font-mono">
                            {titleData.ohlc.close.value}
                          </span>
                        </span>
                      </div>
                    </div>
                  );
                } else {
                  // Show symbol only when not hovering
                  return (
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-foreground text-lg">{titleData.symbol}</span>
                    </div>
                  );
                }
              })()}
            </div>

            <div ref={setChartRef} className="w-full relative" style={{ height: '500px' }}>
              <Plot
                data={plotlyData}
                layout={plotlyLayout}
                config={{
                  displayModeBar: false, // Hide the entire mode bar to remove all zoom controls
                  displaylogo: false,
                  responsive: true,
                  // Enable hover behavior
                  showTips: false,
                  showLink: false,
                  // Disable ALL zooming features to prevent interference with panning
                  scrollZoom: false,
                  doubleClick: false,
                  // Disable any trim zoom or selection behavior
                  editable: false,
                  // Additional zoom disabling options
                  staticPlot: false, // Keep interactive but disable zoom
                  // Disable specific zoom interactions
                  modeBarButtonsToRemove: [
                    'zoom2d',
                    'pan2d',
                    'select2d',
                    'lasso2d',
                    'zoomIn2d',
                    'zoomOut2d',
                    'autoScale2d',
                    'resetScale2d',
                    'hoverClosestCartesian',
                    'hoverCompareCartesian',
                  ],
                  toImageButtonOptions: {
                    format: 'png',
                    filename: 'chart',
                    height: 500,
                    width: 700,
                    scale: 1,
                  },
                }}
                style={{ width: '100%', height: '100%' }}
                useResizeHandler={true}
                onHover={handlePlotlyHover}
                onUnhover={handlePlotlyUnhover}
                onRelayout={handlePlotlyRelayout}
                onUpdate={() => {
                  // Let Plotly handle updates natively
                }}
                onInitialized={(figure, graphDiv) => {
                  // Add CSS to make spike lines thinner
                  const style = document.createElement('style');
                  style.textContent = `
                  .plotly .hoverlayer .hovertext {
                    display: none !important;
                  }
                  .plotly .hoverlayer .hoverlabel {
                    display: none !important;
                  }
                  .plotly .hoverlayer .hovertext .hovertext {
                    display: none !important;
                  }
                  .plotly .hoverlayer .hovertext .hovertext .hovertext {
                    display: none !important;
                  }
                `;
                  document.head.appendChild(style);
                  return undefined;
                }}
              />

              {/* Custom Spike Lines */}
              {mouseX !== null && mouseY !== null && (
                <svg
                  className="absolute pointer-events-none"
                  style={{
                    zIndex: 10,
                    left: (chartBounds?.left || 0) - VIRTUAL_BOX_EXPAND_X,
                    top: (chartBounds?.top || 0) - VIRTUAL_BOX_EXPAND_Y,
                    width: (chartBounds?.width || 0) + VIRTUAL_BOX_EXPAND_X * 2,
                    height: (chartBounds?.height || 0) + VIRTUAL_BOX_EXPAND_Y * 2,
                  }}
                >
                  {/* Vertical spike line - follows mouse X position */}
                  <line
                    x1={`${(mouseX * SPIKE_LINE_SCALE_X + SPIKE_LINE_OFFSET_X) * 100}%`}
                    y1="0%"
                    x2={`${(mouseX * SPIKE_LINE_SCALE_X + SPIKE_LINE_OFFSET_X) * 100}%`}
                    y2="100%"
                    stroke="#6b7280"
                    strokeWidth="0.5"
                    strokeDasharray="4,2"
                    opacity="0.8"
                  />
                  {/* Horizontal spike line - follows mouse Y position */}
                  <line
                    x1="0%"
                    y1={`${(mouseY * SPIKE_LINE_SCALE_Y + SPIKE_LINE_OFFSET_Y) * 100}%`}
                    x2="100%"
                    y2={`${(mouseY * SPIKE_LINE_SCALE_Y + SPIKE_LINE_OFFSET_Y) * 100}%`}
                    stroke="#6b7280"
                    strokeWidth="0.5"
                    strokeDasharray="4,2"
                    opacity="0.8"
                  />
                </svg>
              )}

              {/* Tooltip components are now handled by the hooks */}
            </div>
          </div>
        )}
      </div>

      {/* Chart Footer */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center space-x-4">
            <span>Data points: {chartDataHook.chartData.length}</span>
            <span>Interval: {timeframe || 'Loading...'}</span>
            {chartDataHook.viewState && (
              <span>
                View: {chartDataHook.viewState.currentViewStart + 1}-
                {chartDataHook.viewState.currentViewEnd + 1} of{' '}
                {chartDataHook.viewState.totalDataPoints} | Pan: L
                {chartDataHook.canPanLeft ? '✓' : '✗'} R{chartDataHook.canPanRight ? '✓' : '✗'}
              </span>
            )}
            {(chartDataHook.isLeftLoading || chartDataHook.isRightLoading) && (
              <span className="text-blue-500 text-xs">
                {chartDataHook.isLeftLoading && 'Loading historical data...'}
                {chartDataHook.isRightLoading && 'Loading recent data...'}
              </span>
            )}
            {lastPanDataLoadTime > 0 && (
              <span className="text-green-500 text-xs">Auto-loading data after pan...</span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <div
              className={`w-2 h-2 rounded-full ${isLive ? 'bg-green-500' : 'bg-gray-500'}`}
            ></div>
            <span>{isLive ? 'Live data' : 'Historical data'}</span>
            <span className="text-xs text-muted-foreground">(Chart shows local time)</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// Memoize the component to prevent unnecessary re-renders
export const StockChart = React.memo(StockChartComponent);
