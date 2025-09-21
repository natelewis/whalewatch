// ============================================================================
// DASHBOARD-SPECIFIC TYPES
// ============================================================================

// Import shared types for local usage
import type {
  AlpacaBar,
  ChartTimeframe,
  ChartDimensions,
  CandlestickData,
  User,
  ChartType,
  WebSocketMessage,
} from '@shared';

// Re-export shared: types-only and value(s)
export type * from '@shared';
export { DEFAULT_CHART_DATA_POINTS } from '@shared';

// ============================================================================
// CHART STATE MANAGEMENT TYPES
// ============================================================================

export interface ChartTransform {
  x: number;
  y: number;
  k: number; // scale factor
}

export interface HoverData {
  x: number;
  y: number;
  data: CandlestickData | null;
}

export interface ChartState {
  // Data
  data: CandlestickData[];
  allData: CandlestickData[];

  // Dimensions
  dimensions: ChartDimensions;

  // Transform and viewport
  transform: ChartTransform;
  currentViewStart: number;
  currentViewEnd: number;

  // UI state
  isLive: boolean;
  isWebSocketEnabled: boolean;
  isZooming: boolean;
  isLoading: boolean;
  error: string | null;
  chartLoaded: boolean;
  chartExists: boolean;

  // Hover state
  hoverData: HoverData | null;

  // Configuration
  timeframe: ChartTimeframe | null;
  symbol: string;

  // Y-scale management
  fixedYScaleDomain: [number, number] | null;
}

// ChartActions is defined in useChartStateManager.ts

// ============================================================================
// CHART RENDERER TYPES
// ============================================================================

import * as d3 from 'd3';

export interface ChartCalculations {
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

export interface ChartStateCallbacks {
  setIsZooming?: (value: boolean) => void;
  setCurrentViewStart?: (value: number) => void;
  setCurrentViewEnd?: (value: number) => void;
  setHoverData?: (data: HoverData | null) => void;
  setFixedYScaleDomain?: (domain: [number, number] | null) => void;
  setChartExists?: (value: boolean) => void;
  setZoomBehavior?: (behavior: d3.ZoomBehavior<SVGSVGElement, unknown>) => void;
  setCurrentTransform?: (transform: d3.ZoomTransform) => void;
  getFixedYScaleDomain?: () => [number, number] | null;
  getCurrentData?: () => CandlestickData[];
  getCurrentDimensions?: () => ChartDimensions;
  setChartLoaded?: (value: boolean) => void;
}

// ============================================================================
// TECHNICAL INDICATORS TYPES
// ============================================================================

export interface MovingAverage {
  id: string;
  type: 'SMA' | 'EMA';
  period: number;
  color: string;
  visible: boolean;
}

export interface RSI {
  id: string;
  period: number;
  overbought: number;
  oversold: number;
  color: string;
  visible: boolean;
}

export interface MACD {
  id: string;
  fastPeriod: number;
  slowPeriod: number;
  signalPeriod: number;
  visible: boolean;
}

export interface BollingerBands {
  id: string;
  period: number;
  standardDeviation: number;
  color: string;
  visible: boolean;
}

// ============================================================================
// DRAWING TOOLS TYPES
// ============================================================================

export interface TrendLine {
  id: string;
  type: 'trendline';
  points: { x: number; y: number }[];
  color: string;
  style: 'solid' | 'dashed' | 'dotted';
}

export interface HorizontalLine {
  id: string;
  type: 'horizontal';
  price: number;
  color: string;
  style: 'solid' | 'dashed' | 'dotted';
}

export interface FibonacciRetracement {
  id: string;
  type: 'fibonacci';
  start: { x: number; y: number };
  end: { x: number; y: number };
  levels: number[];
  color: string;
}

// ============================================================================
// AUTH CONTEXT TYPES
// ============================================================================

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginWithGoogle: () => void;
  handleOAuthCallback: (token: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

// ============================================================================
// CHART CONFIGURATION TYPES
// ============================================================================

export interface ChartConfig {
  symbol: string;
  timeframe: ChartTimeframe;
  chartType: ChartType;
  indicators: {
    movingAverages: MovingAverage[];
    rsi: RSI | null;
    macd: MACD | null;
    bollingerBands: BollingerBands | null;
  };
  drawings: {
    trendLines: TrendLine[];
    horizontalLines: HorizontalLine[];
    fibonacci: FibonacciRetracement[];
  };
  showVolume: boolean;
  showCrosshair: boolean;
}

// ============================================================================
// WEBSOCKET HOOK TYPES
// ============================================================================

export interface UseWebSocketOptions {
  url?: string;
  onMessage?: (message: WebSocketMessage) => void;
}

// ============================================================================
// OAuth TYPES
// ============================================================================

export interface OAuthUser {
  id: string;
  googleId: string;
  email: string;
  name: string;
  picture?: string;
}

export interface OAuthResponse {
  token: string;
  user: OAuthUser;
}

// ============================================================================
// LEGACY TYPES (for backward compatibility)
// ============================================================================

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

// ============================================================================
// CHART API RESPONSE TYPES (Dashboard specific)
// ============================================================================

export interface ChartDataResponse {
  symbol: string;
  interval: string;
  limit: number;
  direction: 'past' | 'future';
  view_based_loading?: boolean;
  view_size?: number;
  bars: AlpacaBar[];
  data_source: string;
  success: boolean;
  query_params: {
    start_time: string;
    direction: 'past' | 'future';
    interval: string;
    requested_limit: number;
    view_based_loading?: boolean;
    view_size?: number;
  };
  actual_data_range?: {
    earliest: string;
    latest: string;
  } | null;
}
