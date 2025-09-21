// Centralized constants for the dashboard

// it should be divisible by 10 + 1. this will keep 1 minute ticks aligned with the 10 minute boundaries.
export const BUFFER_SIZE = 300; // Fixed fetch/prune chunk size

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

// X-axis marker configuration
// To change marker intervals, modify these values:
// X_AXIS_MARKER_INTERVAL: Minutes between major markers (30 = every 30 minutes, 15 = every 15 minutes, etc.)
// X_AXIS_MARKER_DATA_POINT_INTERVAL: Data points to check between markers (20 = check every 20 data points)
export const X_AXIS_MARKER_INTERVAL = 30; // Show 1-minute markers every 30 minutes (3:30, 4:00, etc.)
export const X_AXIS_MARKER_DATA_POINT_INTERVAL = 20; // Data points between major markers (for 1m data, 20 = 20 minutes)

// Defaults sourced from environment
export const DEFAULT_CHART_DATA_POINTS = parseInt(import.meta.env.VITE_DEFAULT_CHART_DATA_POINTS || '500', 10);
