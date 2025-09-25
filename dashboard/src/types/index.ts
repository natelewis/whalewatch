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
  WebSocketMessage,
} from '@whalewatch/shared';

// Re-export shared: types-only and value(s)
export type * from '@whalewatch/shared';
export { DEFAULT_CHART_DATA_POINTS } from '@whalewatch/shared';

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

export interface DateDisplayData {
  x: number;
  y: number;
  timestamp: string;
  visible: boolean;
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
  isZooming: boolean;
  isLoading: boolean;
  error: string | null;
  chartLoaded: boolean;
  chartExists: boolean;

  // Hover state
  hoverData: HoverData | null;
  dateDisplay: DateDisplayData | null;

  // Configuration
  timeframe: ChartTimeframe | null;
  symbol: string;

  // Y-scale management
  fixedYScaleDomain: [number, number] | null;

  // Transform state for vertical panning
  currentTransformY?: number;
  currentTransformK?: number;
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
  getCurrentViewStart?: () => number;
  getCurrentViewEnd?: () => number;
  setHoverData?: (data: HoverData | null) => void;
  setDateDisplay?: (data: DateDisplayData | null) => void;
  setFixedYScaleDomain?: (domain: [number, number] | null) => void;
  setChartExists?: (value: boolean) => void;
  setZoomBehavior?: (behavior: d3.ZoomBehavior<SVGSVGElement, unknown>) => void;
  setCurrentTransform?: (transform: d3.ZoomTransform) => void;
  getFixedYScaleDomain?: () => [number, number] | null;
  getCurrentData?: () => CandlestickData[];
  getCurrentDimensions?: () => ChartDimensions;
  setChartLoaded?: (value: boolean) => void;
  setCurrentVerticalPan?: (y: number, k: number) => void;
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
// CHART API RESPONSE TYPES (Dashboard specific)
// ============================================================================

export interface ChartDataResponse {
  symbol: string;
  interval: string;
  limit: number;
  direction: 'past' | 'future' | 'centered';
  view_based_loading?: boolean;
  view_size?: number;
  bars: AlpacaBar[];
  data_source: string;
  success: boolean;
  query_params: {
    start_time: string;
    direction: 'past' | 'future' | 'centered';
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
