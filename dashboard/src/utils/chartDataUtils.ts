import { AlpacaBar, ChartTimeframe, DEFAULT_CHART_DATA_POINTS } from '../types';

export interface CandlestickData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface DataRange {
  earliest: string;
  latest: string;
}

export interface TimeframeConfig {
  value: ChartTimeframe;
  label: string;
  dataPoints: number;
}

/**
 * Remove duplicate entries by timestamp and sort by time
 */
export const deduplicateAndSortBars = (bars: AlpacaBar[]): AlpacaBar[] => {
  return bars
    .reduce((acc, bar) => {
      const timestamp = bar.t;
      if (!acc.find((b) => b.t === timestamp)) {
        acc.push(bar);
      }
      return acc;
    }, [] as AlpacaBar[])
    .sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime());
};

/**
 * Convert AlpacaBar data to CandlestickData format
 */
export const formatBarsToCandlestickData = (bars: AlpacaBar[]): CandlestickData[] => {
  return bars.map((bar) => ({
    time: bar.t,
    open: bar.o,
    high: bar.h,
    low: bar.l,
    close: bar.c,
  }));
};

/**
 * Calculate data range from processed bars
 */
export const calculateDataRange = (bars: AlpacaBar[]): DataRange | null => {
  if (bars.length === 0) {
return null;
}

  return {
    earliest: bars[0].t,
    latest: bars[bars.length - 1].t,
  };
};

/**
 * Get data points count for a given timeframe
 */
export const getDataPointsForTimeframe = (
  timeframe: ChartTimeframe,
  timeframes: TimeframeConfig[]
): number => {
  const timeframeConfig = timeframes.find((tf) => tf.value === timeframe);
  return timeframeConfig?.dataPoints || DEFAULT_CHART_DATA_POINTS;
};

/**
 * Process raw chart data into formatted candlestick data
 */
export const processChartData = (bars: AlpacaBar[]): {
  formattedData: CandlestickData[];
  dataRange: DataRange | null;
} => {
  const uniqueBars = deduplicateAndSortBars(bars);
  const formattedData = formatBarsToCandlestickData(uniqueBars);
  const dataRange = calculateDataRange(uniqueBars);

  return {
    formattedData,
    dataRange,
  };
};

/**
 * Fill missing intervals for any timeframe data
 */
export const fillMissingMinutes = (
  data: CandlestickData[],
  timeframe: ChartTimeframe
): CandlestickData[] => {
  if (data.length === 0) {
return data;
}

  const filledData: CandlestickData[] = [];
  
  // Get interval in milliseconds based on timeframe
  const getIntervalMs = (tf: ChartTimeframe): number => {
    const intervalMap: Record<ChartTimeframe, number> = {
      '1m': 60 * 1000,        // 1 minute
      '5m': 5 * 60 * 1000,    // 5 minutes
      '30m': 30 * 60 * 1000,  // 30 minutes
      '1h': 60 * 60 * 1000,   // 1 hour
      '2h': 2 * 60 * 60 * 1000, // 2 hours
      '4h': 4 * 60 * 60 * 1000, // 4 hours
      '1d': 24 * 60 * 60 * 1000, // 1 day
      '1w': 7 * 24 * 60 * 60 * 1000, // 1 week
      '1M': 30 * 24 * 60 * 60 * 1000, // 1 month (30 days)
    };
    return intervalMap[tf] || 60 * 60 * 1000; // Default to 1 hour
  };

  const intervalMs = getIntervalMs(timeframe);
  const maxGapMultiplier = 3; // Only fill gaps up to 3x the interval

  for (let i = 0; i < data.length; i++) {
    filledData.push(data[i]);

    // Check if there's a gap to the next data point
    if (i < data.length - 1) {
      const currentTime = new Date(data[i].time).getTime();
      const nextTime = new Date(data[i + 1].time).getTime();
      const gapMs = nextTime - currentTime;

      // If gap is more than 2 intervals but less than maxGapMultiplier, fill with last known price
      if (gapMs > intervalMs * 2 && gapMs < intervalMs * maxGapMultiplier) {
        const missingIntervals = Math.floor(gapMs / intervalMs) - 1;
        const lastPrice = data[i].close;

        for (let j = 1; j <= missingIntervals; j++) {
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
