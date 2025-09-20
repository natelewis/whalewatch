// Centralized constants for the dashboard

export const BUFFER_SIZE = 80; // Buffer size in data points used for chart rendering

// Candlestick colors
// Use these to change the up/down candle colors in one place
export const CANDLE_UP_COLOR = '#26a69a';
export const CANDLE_DOWN_COLOR = '#ef5350';

// API / WebSocket base URLs
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
export const WS_BASE_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';

// Chart viewport configuration
export const CHART_DATA_POINTS = 80; // Number of data points to display on chart
export const MARGIN_SIZE = 2; // Fixed margin size in data points for re-render detection

// Zoom configuration
export const ZOOM_SCALE_MIN = 0.5;
export const ZOOM_SCALE_MAX = 10;

// Price padding configuration
export const PRICE_PADDING_MULTIPLIER = 0.2; // 20% padding on min/max

// Layout configuration
export const MIN_CHART_HEIGHT = 400; // Minimum chart height in pixels
export const CHART_HEIGHT_OFFSET = 100; // Height offset for chart container

// Timing configuration
export const RIGHT_EDGE_CHECK_INTERVAL = 1000; // ms

// Defaults sourced from environment
export const DEFAULT_CHART_DATA_POINTS = parseInt(
  import.meta.env.VITE_DEFAULT_CHART_DATA_POINTS || '500',
  10
);
