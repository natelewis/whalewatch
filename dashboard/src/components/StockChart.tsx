import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import Plot from 'react-plotly.js';

// Extend window to include Plotly
declare global {
  interface Window {
    Plotly: any;
  }
}
import {
  AlpacaBar,
  ChartTimeframe,
  ChartType,
  ChartDataResponse,
  DEFAULT_CHART_DATA_POINTS,
} from '../types';
import { apiService } from '../services/apiService';
import { useWebSocket } from '../hooks/useWebSocket';
import { getLocalStorageItem, setLocalStorageItem } from '../utils/localStorage';
import {
  BarChart3,
  LineChart,
  Activity,
  Square,
  Settings,
  Play,
  Pause,
  RotateCcw,
} from 'lucide-react';

interface StockChartProps {
  symbol: string;
  onSymbolChange: (symbol: string) => void;
}

interface CandlestickData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
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
const PLOTLY_INTERNAL_PADDING = 35; // 15px top + 15px bottom

const StockChartComponent: React.FC<StockChartProps> = ({ symbol, onSymbolChange }) => {
  const [chartData, setChartData] = useState<CandlestickData[]>([]);
  const [timeframe, setTimeframe] = useState<ChartTimeframe | null>(null);
  const [chartType, setChartType] = useState<ChartType>('candlestick');
  const [isLoading, setIsLoading] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataRange, setDataRange] = useState<{ earliest: string; latest: string } | null>(null);

  // Removed hoveredPrice state - tooltip is now completely DOM-based

  const [topPrice, setTopPrice] = useState<number | null>(null);
  const [minPrice, setMinPrice] = useState<number | null>(null);
  const [effectiveHeight, setEffectiveHeight] = useState<number | null>(null);
  const [effectiveWidth, setEffectiveWidth] = useState<number | null>(null);
  const [chartRef, setChartRef] = useState<HTMLDivElement | null>(null);

  // Removed hoveredPrice state - tooltip is now completely DOM-based

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
    if (chartData.length === 0) {
      setTopPrice(null);
      setMinPrice(null);
      return;
    }

    // Find the highest and lowest prices from the chart data
    let highest = -Infinity;
    let lowest = Infinity;

    chartData.forEach((candle) => {
      // Check high and low values for each candle
      if (candle.high > highest) highest = candle.high;
      if (candle.low < lowest) lowest = candle.low;
    });

    // Only update if we found valid values
    if (highest !== -Infinity && lowest !== Infinity) {
      setTopPrice(highest);
      setMinPrice(lowest);
    }
  }, [chartData]);

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
  }, [chartRef, chartData]);

  const handlePlotlyUnhover = useCallback(() => {
    // Don't clear everything on unhover - let the mouse leave handler handle it
  }, []);

  // Optimized mouse move handler for spike line hover detection
  useEffect(() => {
    if (!chartRef) {
      return;
    }

    let plotArea: Element | null = null;
    let tooltip: HTMLElement | null = null;
    let lastMouseY = -1;
    let lastMouseX = -1;
    let lastPrice = -1;
    // Removed throttling - DOM updates are fast enough without it

    // Cache DOM elements once
    const initializeElements = () => {
      if (!plotArea) {
        plotArea = chartRef.querySelector('.nsewdrag.drag');
      }

      if (!tooltip) {
        tooltip = document.querySelector('.persistent-price-tooltip') as HTMLElement;
        if (!tooltip) {
          tooltip = document.createElement('div');
          tooltip.className = 'persistent-price-tooltip';
          tooltip.style.position = 'fixed';
          tooltip.style.backgroundColor = '#6b7280';
          tooltip.style.border = 'none';
          tooltip.style.marginTop = '3px';
          tooltip.style.padding = '0 0 0 8px ';
          tooltip.style.borderRadius = '0px';
          tooltip.style.width = '60px';
          tooltip.style.fontSize = '12px';
          tooltip.style.setProperty('color', 'white', 'important');
          tooltip.style.fontWeight = 'normal';
          tooltip.style.pointerEvents = 'none';
          tooltip.style.zIndex = '1000';
          tooltip.style.willChange = 'transform';
          tooltip.style.transform = 'translateZ(0)'; // Force hardware acceleration
          document.body.appendChild(tooltip);
        }
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      // Initialize elements only once
      initializeElements();

      if (!plotArea) {
        return;
      }

      const rect = plotArea.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      // Update position tracking
      lastMouseY = y;
      lastMouseX = x;

      // Adjust Y position to account for Plotly's internal padding
      const adjustedY = Math.max(0, y - PLOTLY_INTERNAL_PADDING / 2);

      // Check if mouse is within the plot area and we have valid dimensions
      if (
        effectiveHeight !== null &&
        effectiveWidth !== null &&
        x >= 0 &&
        x <= effectiveWidth &&
        adjustedY >= 0 &&
        adjustedY <= effectiveHeight
      ) {
        // Calculate the actual price at the mouse Y position on the spike line
        if (topPrice !== null && minPrice !== null) {
          // Convert mouse Y position to actual price value using the proper formula
          // Price = topPrice - (adjustedY / effectiveHeight) * (topPrice - minPrice)
          const mousePrice =
            topPrice - (adjustedY / (effectiveHeight || 1)) * (topPrice - minPrice);

          // Update price and tooltip for every mouse move
          lastPrice = mousePrice;

          // Update tooltip content and position in one go
          if (tooltip) {
            tooltip.textContent = `${mousePrice.toFixed(2)}`;
            tooltip.style.display = 'block';
            tooltip.style.left = `${rect.right}px`;
            tooltip.style.top = `${event.clientY - 12}px`;
          }
        }
      }
    };

    const handleMouseLeave = () => {
      // Add a small delay before clearing to prevent flickering
      setTimeout(() => {
        // Hide the persistent tooltip
        if (tooltip) {
          tooltip.style.display = 'none';
        }
      }, 100);
    };
    chartRef.addEventListener('mousemove', handleMouseMove);
    chartRef.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      chartRef.removeEventListener('mousemove', handleMouseMove);
      chartRef.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [chartRef, chartData, topPrice, minPrice, effectiveHeight, effectiveWidth]);

  // WebSocket for real-time chart data
  const { lastMessage, sendMessage } = useWebSocket();

  useEffect(() => {
    if (timeframe !== null) {
      loadChartData(symbol, timeframe);
    }
  }, [symbol, timeframe]);

  useEffect(() => {
    if (lastMessage?.type === 'chart_quote' && lastMessage.data.symbol === symbol) {
      updateChartWithLiveData(lastMessage.data.bar);
    }
  }, [lastMessage, symbol]);

  const fillMissingMinutes = (
    data: CandlestickData[],
    timeframe: ChartTimeframe
  ): CandlestickData[] => {
    if (data.length === 0) return data;

    // Only fill for 1m timeframe to avoid over-filling
    if (timeframe !== '1m') return data;

    const filledData: CandlestickData[] = [];
    const intervalMs = 60 * 1000; // 1 minute in milliseconds

    for (let i = 0; i < data.length; i++) {
      filledData.push(data[i]);

      // Check if there's a gap to the next data point
      if (i < data.length - 1) {
        const currentTime = new Date(data[i].time).getTime();
        const nextTime = new Date(data[i + 1].time).getTime();
        const gapMs = nextTime - currentTime;

        // If gap is more than 2 minutes, fill with last known price
        if (gapMs > intervalMs * 2) {
          const missingMinutes = Math.floor(gapMs / intervalMs) - 1;
          const lastPrice = data[i].close;

          for (let j = 1; j <= missingMinutes; j++) {
            const fillTime = new Date(currentTime + j * intervalMs).toISOString();
            filledData.push({
              time: fillTime,
              open: lastPrice,
              high: lastPrice,
              low: lastPrice,
              close: lastPrice,
            });
          }
        }
      }
    }

    return filledData;
  };

  const loadChartData = async (symbol: string, timeframe: ChartTimeframe) => {
    try {
      setIsLoading(true);
      setError(null);

      // Find the timeframe configuration to get the appropriate data points
      const timeframeConfig = timeframes.find((tf) => tf.value === timeframe);
      const dataPoints = timeframeConfig?.dataPoints || DEFAULT_CHART_DATA_POINTS;

      const response: ChartDataResponse = await apiService.getChartData(
        symbol,
        timeframe,
        dataPoints
      );
      const bars = response.bars;

      // Remove duplicate entries by timestamp and sort by time
      const uniqueBars = bars
        .reduce((acc, bar) => {
          const timestamp = bar.t;
          if (!acc.find((b) => b.t === timestamp)) {
            acc.push(bar);
          }
          return acc;
        }, [] as typeof bars)
        .sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime());

      const formattedData: CandlestickData[] = uniqueBars.map((bar) => ({
        time: bar.t,
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
      }));

      // Use the data as-is to show natural gaps in time series
      setChartData(formattedData);

      // Set data range from actual data returned (no time restrictions)
      if (uniqueBars.length > 0) {
        setDataRange({
          earliest: uniqueBars[0].t,
          latest: uniqueBars[uniqueBars.length - 1].t,
        });
      } else {
        setDataRange(null);
      }

      // Subscribe to real-time chart data
      sendMessage({
        type: 'subscribe',
        data: { channel: 'chart_quote', symbol },
      });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load chart data');
    } finally {
      setIsLoading(false);
    }
  };

  const updateChartWithLiveData = (bar: AlpacaBar) => {
    const newCandle: CandlestickData = {
      time: bar.t,
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
    };

    // Update the last candle or add a new one
    setChartData((prevData) => {
      const lastCandle = prevData[prevData.length - 1];
      if (lastCandle && lastCandle.time === newCandle.time) {
        // Update existing candle
        const updatedData = [...prevData];
        updatedData[updatedData.length - 1] = newCandle;
        return updatedData;
      } else {
        // Add new candle
        return [...prevData, newCandle];
      }
    });
  };

  const plotlyData = useMemo(() => {
    if (chartData.length === 0) {
      return [];
    }

    // Ensure data is sorted by time and convert to proper format for Plotly
    const sortedData = [...chartData].sort(
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
            hovertemplate:
              '<b>%{fullData.name}</b><br>' +
              '<b>Time: %{customdata}</b><br>' +
              'Open: $%{open:.4f}<br>' +
              'High: $%{high:.4f}<br>' +
              'Low: $%{low:.4f}<br>' +
              'Close: $%{close:.4f}<extra></extra>',
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
            hovertemplate:
              '<b>%{fullData.name}</b><br>' +
              '<b>Time: %{customdata}</b><br>' +
              'Price: $%{y:.4f}<extra></extra>',
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
            hovertemplate:
              '<b>%{fullData.name}</b><br>' +
              '<b>Time: %{customdata}</b><br>' +
              'Price: $%{y:.4f}<extra></extra>',
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
            hovertemplate:
              '<b>%{fullData.name}</b><br>' +
              '<b>Time: %{customdata}</b><br>' +
              'Price: $%{y:.4f}<extra></extra>',
            customdata: sortedData.map((d) => new Date(d.time).toLocaleString()),
          },
        ];

      default:
        return [];
    }
  }, [chartData, chartType, symbol]);

  // Memoized time axis calculations
  const timeAxisTicks = useMemo(() => {
    if (chartData.length === 0) return [];

    const sortedData = [...chartData].sort(
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
  }, [chartData]);

  const timeAxisLabels = useMemo(() => {
    if (chartData.length === 0) return [];

    const sortedData = [...chartData].sort(
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
  }, [chartData, timeframe, timeAxisTicks]);

  const plotlyLayout = useMemo(() => {
    const layout: any = {
      title: {
        text: `${symbol} - ${timeframe || 'Loading...'}`,
        font: { color: '#d1d5db', size: 16 },
      },
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
        showspikes: true,
        spikecolor: '#6b7280',
        spikesnap: 'cursor',
        spikemode: 'across',
        spikethickness: 0.5,
        spikedash: [2, 2],
        showticklabels: true,
        ticklen: 4, // Length of tick marks extending outward
        tickwidth: 1,
        tickcolor: '#6b7280',
        zeroline: false,
        mirror: false, // Don't mirror ticks on opposite side
      },
      yaxis: {
        color: '#d1d5db',
        title: { text: '', font: { color: '#d1d5db' } },
        showspikes: true,
        spikecolor: '#6b7280',
        spikesnap: 'cursor',
        spikemode: 'across',
        spikethickness: 0.5,
        spikedash: [2, 2],
        side: 'right',
        showgrid: false,
        showticklabels: true,
        ticklen: 4, // Length of tick marks extending outward
        tickwidth: 1,
        tickcolor: '#6b7280',
        zeroline: false,
        mirror: false, // Don't mirror ticks on opposite side
        tickformat: '.4f', // Format y-axis labels to show 4 decimal places
      },
      plot_bgcolor: 'transparent',
      paper_bgcolor: 'transparent',
      font: { color: '#d1d5db' },
      margin: { l: 50, r: 50, t: 50, b: 50 },
      showlegend: false,
      hovermode: 'x unified' as const,
      hoverlabel: {
        bgcolor: 'rgba(0, 0, 0, 0.8)',
        bordercolor: '#374151',
        font: { color: '#d1d5db', size: 12 },
        namelength: -1,
        align: 'left',
      },
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
        // Price annotation removed - using spike line tooltip instead
      ],
      hoverdistance: 20,
      spikedistance: -1, // Use -1 for better spike line behavior
    };

    // Let Plotly auto-scale to show the actual data points with natural gaps
    // No need to force ranges since we want to show the true time distribution

    return layout;
  }, [symbol, timeframe, dataRange]);

  const timeframes: { value: ChartTimeframe; label: string; dataPoints: number }[] = [
    { value: '1m', label: '1m', dataPoints: DEFAULT_CHART_DATA_POINTS }, // 1-minute data
    { value: '5m', label: '5m', dataPoints: DEFAULT_CHART_DATA_POINTS }, // 5-minute intervals
    { value: '30m', label: '30m', dataPoints: DEFAULT_CHART_DATA_POINTS }, // 30-minute intervals
    { value: '1h', label: '1h', dataPoints: DEFAULT_CHART_DATA_POINTS }, // hourly data
    { value: '2h', label: '2h', dataPoints: DEFAULT_CHART_DATA_POINTS }, // 2-hour intervals
    { value: '4h', label: '4h', dataPoints: DEFAULT_CHART_DATA_POINTS }, // 4-hour intervals
    { value: '1d', label: '1d', dataPoints: DEFAULT_CHART_DATA_POINTS }, // daily data
    { value: '1w', label: '1w', dataPoints: DEFAULT_CHART_DATA_POINTS }, // weekly data
    { value: '1M', label: '1M', dataPoints: DEFAULT_CHART_DATA_POINTS }, // monthly data
  ];

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
                onClick={() => timeframe && loadChartData(symbol, timeframe)}
                className="p-1 text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>
          </div>
          <button className="p-2 text-muted-foreground hover:text-foreground">
            <Settings className="h-4 w-4" />
          </button>
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
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading chart data...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <p className="text-destructive mb-4">{error}</p>
              <button
                onClick={() => timeframe && loadChartData(symbol, timeframe)}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              >
                Retry
              </button>
            </div>
          </div>
        ) : (
          <div ref={setChartRef} className="w-full h-full relative" style={{ minHeight: '400px' }}>
            <Plot
              data={plotlyData}
              layout={plotlyLayout}
              config={{
                displayModeBar: true,
                displaylogo: false,
                modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d'],
                responsive: true,
                // Enable hover behavior
                showTips: true,
                showLink: false,
                // Ensure hover mode works properly
                doubleClick: 'reset+autosize',
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
              onHover={undefined}
              onUnhover={undefined}
              onInitialized={(figure, graphDiv) => {
                // Add CSS to make spike lines thinner
                const style = document.createElement('style');
                style.textContent = `
                  .plotly .hoverlayer .spikeline {
                    stroke-width: 0.5px !important;
                    stroke: #d1d5db !important;
                    stroke-dasharray: 4,2 !important;
                  }
                  .plotly .hoverlayer .spikeline:hover {
                    stroke-width: 0.5px !important;
                  }
                `;
                document.head.appendChild(style);
                return undefined;
              }}
            />
            <div className="price-tooltip" style={{ display: 'none' }}></div>
          </div>
        )}
      </div>

      {/* Chart Footer */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center space-x-4">
            <span>Data points: {chartData.length}</span>
            <span>Interval: {timeframe || 'Loading...'}</span>
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
