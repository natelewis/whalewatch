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

const StockChartComponent: React.FC<StockChartProps> = ({ symbol, onSymbolChange }) => {
  const [timeframe, setTimeframe] = useState<ChartTimeframe | null>(null);
  const [chartType, setChartType] = useState<ChartType>('candlestick');
  const [isLive, setIsLive] = useState(false);

  const [topPrice, setTopPrice] = useState<number | null>(null);
  const [minPrice, setMinPrice] = useState<number | null>(null);
  const [effectiveHeight, setEffectiveHeight] = useState<number | null>(null);
  const [effectiveWidth, setEffectiveWidth] = useState<number | null>(null);
  const [chartRef, setChartRef] = useState<HTMLDivElement | null>(null);

  // Hover state for time tooltip at bottom
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
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

  // Continuous data loading state
  const [lastScrollTime, setLastScrollTime] = useState<number>(0);
  const [isNearLeftBoundary, setIsNearLeftBoundary] = useState(false);
  const [isNearRightBoundary, setIsNearRightBoundary] = useState(false);
  const BUFFER_THRESHOLD = 0.1; // 10% from the edge triggers loading
  const SCROLL_DEBOUNCE_MS = 100; // Debounce scroll events

  // Reset pan
  const resetZoomAndPan = useCallback(() => {
    setCurrentRange(null);
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
    bufferPoints: 20, // Load 20 buffer points on each side
    enableViewBasedLoading: true, // Enable view-based preloading
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

    // In view-based mode, check view state instead of scroll position
    if (chartDataHook.viewState) {
      const { currentViewStart, currentViewEnd, totalDataPoints, hasDataBefore, hasDataAfter } =
        chartDataHook.viewState;

      // Check if we need to load more data based on view position
      const nearLeft = currentViewStart <= 1 && hasDataBefore; // Near left edge and more data available
      const nearRight = currentViewEnd >= totalDataPoints - 2 && hasDataAfter; // Near right edge and more data available

      // Update boundary states
      setIsNearLeftBoundary(nearLeft);
      setIsNearRightBoundary(nearRight);

      console.log('View-based boundary check:', {
        currentViewStart,
        currentViewEnd,
        totalDataPoints,
        hasDataBefore,
        hasDataAfter,
        nearLeft,
        nearRight,
      });

      // Only trigger loading if we're near boundaries and haven't loaded recently
      const now = Date.now();
      if (nearLeft && now - lastScrollTime > 2000) {
        console.log('Loading more data to the left...');
        chartDataHook.loadMoreDataLeft(symbol, timeframe);
        setLastScrollTime(now);
      }

      if (nearRight && now - lastScrollTime > 2000) {
        console.log('Loading more data to the right...');
        chartDataHook.loadMoreDataRight(symbol, timeframe);
        setLastScrollTime(now);
      }

      return;
    }

    // Traditional mode - check scroll position
    const sortedData = [...chartDataHook.chartData].sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );
    const totalPoints = sortedData.length;

    if (totalPoints === 0) return;

    // Get current range or use full range
    const currentXRange = currentRange || [0, totalPoints - 1];
    const leftPosition = currentXRange[0];
    const rightPosition = currentXRange[1];

    // Check if we're near the left boundary (need more historical data)
    const leftThreshold = totalPoints * BUFFER_THRESHOLD;
    const nearLeft = leftPosition <= leftThreshold;

    // Check if we're near the right boundary (need more recent data)
    const rightThreshold = totalPoints - totalPoints * BUFFER_THRESHOLD;
    const nearRight = rightPosition >= rightThreshold;

    // Update boundary states
    setIsNearLeftBoundary(nearLeft);
    setIsNearRightBoundary(nearRight);

    // Add debugging
    console.log('Traditional boundary check:', {
      totalPoints,
      currentXRange,
      leftPosition,
      rightPosition,
      leftThreshold,
      rightThreshold,
      nearLeft,
      nearRight,
      isLeftLoading: chartDataHook.isLeftLoading,
      isRightLoading: chartDataHook.isRightLoading,
    });

    // Only trigger loading if we're near boundaries and haven't loaded recently
    const now = Date.now();
    if (nearLeft && now - lastScrollTime > 2000) {
      // 2 second cooldown and not already near left boundary
      console.log('Loading more data to the left...');
      chartDataHook.loadMoreDataLeft(symbol, timeframe);
      setLastScrollTime(now); // Update scroll time to prevent immediate re-trigger
    }

    if (nearRight && now - lastScrollTime > 2000) {
      // 2 second cooldown and not already near right boundary
      console.log('Loading more data to the right...');
      chartDataHook.loadMoreDataRight(symbol, timeframe);
      setLastScrollTime(now); // Update scroll time to prevent immediate re-trigger
    }
  }, [chartDataHook, timeframe, symbol, currentRange, BUFFER_THRESHOLD, lastScrollTime]);

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
  }, [chartDataHook.chartData]);

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

            setHoveredDate(formattedDate);

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
    [chartRef, chartDataHook.chartData, timeframe]
  );

  const handlePlotlyUnhover = useCallback(() => {
    setHoveredDate(null);
    setMouseX(null);
    setMouseY(null);
    setDataPointIndex(null);
    setHoveredOHLC(null);
  }, []);

  // Handle Plotly relayout events for zoom and pan
  const handlePlotlyRelayout = useCallback(
    (event: any) => {
      console.log('Plotly relayout event:', event);

      // Handle view-based loading panning
      if (chartDataHook.viewState && event['xaxis.range']) {
        const newRange = event['xaxis.range'];
        const dataLength = chartDataHook.chartData.length;

        console.log('View-based panning detected:', {
          newRange,
          dataLength,
          viewState: chartDataHook.viewState,
        });

        // For view-based loading, we need to detect pan direction differently
        // The range should always be [0, dataLength-1], so we need to detect
        // if the user is trying to pan beyond the current view boundaries

        const currentViewStart = chartDataHook.viewState.currentViewStart;
        const currentViewEnd = chartDataHook.viewState.currentViewEnd;
        const viewSize = chartDataHook.viewState.viewSize;

        // Detect pan direction based on range position
        // If range[0] < 0, user is trying to pan left
        // If range[1] > dataLength-1, user is trying to pan right
        let panDirection = 0;

        if (newRange[0] < 0 && chartDataHook.canPanLeft) {
          panDirection = -1; // Pan left
        } else if (newRange[1] > dataLength - 1 && chartDataHook.canPanRight) {
          panDirection = 1; // Pan right
        }

        if (panDirection !== 0) {
          // Calculate pan step (half the view size for smooth panning)
          const panStep = Math.max(1, Math.floor(viewSize / 2));

          let newViewStart = currentViewStart;
          let newViewEnd = currentViewEnd;

          if (panDirection === -1) {
            // Pan left
            newViewStart = Math.max(0, currentViewStart - panStep);
            newViewEnd = newViewStart + viewSize - 1;
          } else if (panDirection === 1) {
            // Pan right
            newViewStart = Math.min(
              chartDataHook.viewState.totalDataPoints - viewSize,
              currentViewStart + panStep
            );
            newViewEnd = newViewStart + viewSize - 1;
          }

          console.log('Updating view state from panning:', {
            panDirection,
            panStep,
            newViewStart,
            newViewEnd,
            canPanLeft: chartDataHook.canPanLeft,
            canPanRight: chartDataHook.canPanRight,
          });

          // Update the view state
          const newViewState = {
            ...chartDataHook.viewState,
            currentViewStart: newViewStart,
            currentViewEnd: newViewEnd,
            hasDataBefore: newViewStart > 0,
            hasDataAfter: newViewEnd < chartDataHook.viewState.totalDataPoints - 1,
          };

          // Update the view state in the hook
          chartDataHook.updateViewState?.(newViewState);
        }

        return;
      }

      if (event['xaxis.range'] && chartDataHook.chartData.length > 0) {
        const newRange = event['xaxis.range'];
        const totalPoints = chartDataHook.chartData.length;

        console.log('Range update check:', {
          newRange,
          totalPoints,
          currentRange,
          dataLength: chartDataHook.chartData.length,
          rangeDifferent: newRange[0] !== currentRange?.[0] || newRange[1] !== currentRange?.[1],
          withinBounds:
            newRange[0] >= 0 && newRange[1] <= totalPoints - 1 && newRange[0] <= newRange[1],
        });

        // Only update if the range is different and within bounds
        if (
          totalPoints > 0 &&
          (newRange[0] !== currentRange?.[0] || newRange[1] !== currentRange?.[1]) &&
          newRange[0] >= 0 &&
          newRange[1] <= totalPoints - 1 &&
          newRange[0] <= newRange[1] // Ensure valid range
        ) {
          console.log('Updating current range and triggering boundary check');
          setCurrentRange([Math.floor(newRange[0]), Math.floor(newRange[1])]);
          setLastScrollTime(Date.now());
        }
      }
    },
    [chartDataHook.chartData, chartDataHook.viewState, currentRange]
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

    // Show 5-8 ticks depending on data length
    const numTicks = Math.min(8, Math.max(5, Math.floor(totalPoints / 10)));
    const step = Math.max(1, Math.floor(totalPoints / (numTicks - 1)));

    const ticks: number[] = [];
    for (let i = 0; i < numTicks; i++) {
      const index = Math.min(i * step, totalPoints - 1);
      ticks.push(index);
    }

    return ticks;
  }, [chartDataHook.chartData]);

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
      // Force pan mode when using view-based loading
      dragmode: chartDataHook.viewState ? 'pan' : false,
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
        // Apply current range if available, ensuring it's within bounds
        // For view-based loading, always show the full range of current data
        // For traditional loading, use the currentRange from user interaction
        ...(chartDataHook.viewState
          ? chartDataHook.chartData.length > 0 && {
              range: [0, chartDataHook.chartData.length - 1],
            }
          : currentRange &&
            chartDataHook.chartData.length > 0 && {
              range: [
                Math.max(0, Math.min(currentRange[0], chartDataHook.chartData.length - 1)),
                Math.max(0, Math.min(currentRange[1], chartDataHook.chartData.length - 1)),
              ],
            }),
        fixedrange: false, // Allow pan but disable zoom
        // Disable any selection or trim zoom behavior
        selectdirection: false,
        // Disable zooming completely
        autorange: false,
        // Disable all zoom interactions
        zoom: false,
        // Disable selection and lasso interactions
        select2d: false,
        lasso2d: false,
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
        // Date annotation (bottom of chart)
        ...(hoveredDate && mouseX !== null
          ? [
              {
                x: mouseX,
                y: 0.002,
                xref: 'paper',
                yref: 'paper',
                text: hoveredDate,
                showarrow: true,
                arrowhead: 0,
                arrowcolor: '#6b7280',
                arrowwidth: 0.5,
                ax: 0,
                ay: 6,
                bgcolor: 'rgba(0, 0, 0, 0.8)',
                bordercolor: '#374151',
                borderwidth: 1,
                font: { color: '#d1d5db', size: 12 },
                xanchor: 'center',
                yanchor: 'top',
              },
            ]
          : []),
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
    hoveredDate,
    mouseX,
    currentRange,
    chartDataHook.viewState,
    chartDataHook.chartData,
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
            {/* Pan Controls */}
            <div className="flex items-center space-x-1 border border-border rounded-md p-1 bg-blue-100">
              <div className="text-xs text-muted-foreground mr-2">
                Pan: L{chartDataHook.canPanLeft ? '✓' : '✗'} R
                {chartDataHook.canPanRight ? '✓' : '✗'}
              </div>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  chartDataHook.panLeft();
                }}
                disabled={!chartDataHook.canPanLeft}
                className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                title="Pan left"
                style={{ pointerEvents: 'auto' }}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  chartDataHook.panRight();
                }}
                disabled={!chartDataHook.canPanRight}
                className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                title="Pan right"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
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
            <div className="mb-4 px-2">
              {(() => {
                const titleData = getTitleData();
                if ('ohlc' in titleData) {
                  // Show OHLC data when hovering
                  return (
                    <div className="flex justify-between items-center">
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

            <div ref={setChartRef} className="w-full h-full relative">
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
                onUpdate={(figure, graphDiv) => {
                  // Capture range changes from user interaction (slider, zoom, pan)
                  if (figure.layout.xaxis && figure.layout.xaxis.range) {
                    const newRange = figure.layout.xaxis.range;
                    const totalPoints = chartDataHook.chartData.length;

                    // Only update if the range is different and within bounds
                    if (
                      totalPoints > 0 &&
                      (newRange[0] !== currentRange?.[0] || newRange[1] !== currentRange?.[1]) &&
                      newRange[0] >= 0 &&
                      newRange[1] <= totalPoints - 1 &&
                      newRange[0] <= newRange[1] // Ensure valid range
                    ) {
                      console.log('Range update:', {
                        newRange,
                        totalPoints,
                        currentRange,
                        dataLength: chartDataHook.chartData.length,
                      });
                      setCurrentRange([Math.floor(newRange[0]), Math.floor(newRange[1])]);
                      setLastScrollTime(Date.now());
                    }
                  }
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
