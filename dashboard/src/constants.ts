// Centralized constants for the dashboard

// Candlestick colors
// Use these to change the up/down candle colors in one place
export const CANDLE_UP_COLOR = '#26a69a';
export const CANDLE_DOWN_COLOR = '#ef5350';

// Axis styling constants
// Use these to change axis appearance in one place
export const AXIS_DOMAIN_AND_TICKS = {
  // STROKE_COLOR: '#666',
  STROKE_WIDTH: 3,
  STROKE_COLOR: '#666',
} as const;

export const AXIS_LABELS = {
  FONT_SIZE: '12px',
  FONT_FAMILY: 'ui-monospace, "SF Mono", "Monaco", "Inconsolata", "Roboto Mono", "Source Code Pro", monospace',
  FILL_COLOR: '#ccc',
} as const;

// Hover display constants
export const HOVER_DISPLAY = {
  FONT_SIZE: '12px',
  FONT_FAMILY: 'ui-monospace, "SF Mono", "Monaco", "Inconsolata", "Roboto Mono", "Source Code Pro", monospace',
  FILL_COLOR: 'white',
  PRICE_BOX_WIDTH: 55,
  PRICE_BOX_HEIGHT: 14,
  PRICE_BOX_PADDING: 4,
  DATE_BOX_PADDING: 2,
  DATE_BOX_HEIGHT: 14,
} as const;

// API / WebSocket base URLs
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
export const WS_BASE_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';

// it should be divisible by 10 + 1. this will keep 1 minute ticks aligned with the 10 minute boundaries.
export const BUFFER_SIZE = 600; // Fixed fetch/prune chunk size
export const FIRST_LOAD_BUFFER_SIZE = BUFFER_SIZE * 2; // Initial load size to prevent glitchy behavior

// Chart viewport configuration
export const CHART_DATA_POINTS = 195; // 80; // Number of data points to display on chart
export const MARGIN_SIZE = 2; // Fixed margin size in data points for re-render detection
// Pan-end load trigger: distance from edge (in points) to request more data
export const LOAD_EDGE_TRIGGER = 400;
// Maximum total data points that can be loaded in memory
export const MAX_DATA_POINTS = 20000;

// Zoom configuration
export const ZOOM_SCALE_MIN = 0.5;
export const ZOOM_SCALE_MAX = 10;

// Price padding configuration
export const PRICE_PADDING_MULTIPLIER = 0.2; // 20% padding on min/max

// Y-scale domain calculation configuration
export const Y_SCALE_REPRESENTATIVE_DATA_LENGTH = 80; // Number of recent data points to use for Y-scale domain calculation

// Layout configuration
export const MIN_CHART_HEIGHT = 400; // Minimum chart height in pixels
export const CHART_HEIGHT_OFFSET = 100; // Height offset for chart container
export const CHART_RIGHT_PADDING = 8; // Right padding to prevent overlap with domain line

// Timing configuration
export const RIGHT_EDGE_CHECK_INTERVAL = 1000; // ms

// X-axis marker configuration
// To change marker intervals, modify these values:
// X_AXIS_MARKER_INTERVAL: Minutes between major markers (30 = every 30 minutes, 15 = every 15 minutes, etc.)
// X_AXIS_MARKER_DATA_POINT_INTERVAL: Data points to check between markers (20 = check every 20 data points)
export const X_AXIS_MARKER_INTERVAL = 30; // Show 1-minute markers every 30 minutes (3:30, 4:00, etc.)
export const X_AXIS_MARKER_DATA_POINT_INTERVAL = 20; // Data points between major markers (for 1m data, 20 = 20 minutes)

// X-axis label configuration based on time intervals
export interface XAxisLabelConfig {
  markerIntervalMinutes: number; // Minutes between markers
  labelFormat: 'time-only' | 'date-only' | 'date-time' | 'short' | 'medium' | 'long';
  showSeconds?: boolean;
  timezone?: string;
  maxVisibleLabels?: number; // Maximum number of visible labels on the X-axis
}

export const X_AXIS_LABEL_CONFIGS: Record<string, XAxisLabelConfig> = {
  '1m': {
    markerIntervalMinutes: 15, // Show labels every 15 minutes
    labelFormat: 'time-only',
    showSeconds: false,
  },
  '5m': {
    markerIntervalMinutes: 60, // Show labels every 60 minutes
    labelFormat: 'time-only',
    showSeconds: false,
  },
  '15m': {
    markerIntervalMinutes: 60 * 8, // Show labels every hour and a half
    labelFormat: 'date-time',
    showSeconds: false,
  },
  '1h': {
    markerIntervalMinutes: 60 * 24 * 2, // Show labels every 2 days
    labelFormat: 'date-only',
    showSeconds: false,
  },
  '1d': {
    markerIntervalMinutes: 60 * 24 * 31, // Show labels once a month
    labelFormat: 'date-only',
    showSeconds: false,
    maxVisibleLabels: 9,
  },
} as const;

// Defaults sourced from environment
export const DEFAULT_CHART_DATA_POINTS = parseInt(import.meta.env.VITE_DEFAULT_CHART_DATA_POINTS || '500', 10);
