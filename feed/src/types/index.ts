// ============================================================================
// FEED MODULE TYPES
// ============================================================================

// Re-export shared types (excluding conflicting ones)
export {
  AlpacaAccount,
  AlpacaPosition,
  AlpacaActivity,
  AlpacaOptionsTrade,
  ContractType,
  AlpacaOptionsContract,
  CreateOrderRequest,
  OrderLeg,
  CreateOrderResponse,
  AccountInfoResponse,
  PositionsResponse,
  ActivityResponse,
  OptionsTradesResponse,
  ApiResponse,
  WebSocketMessageData,
  WebSocketMessage,
  OptionsWhaleMessage,
  OptionsContractMessage,
  AccountQuoteMessage,
  ChartQuoteMessage,
  ChartTimeframe,
  ChartType,
  ChartDimensions,
  DEFAULT_CHART_DATA_POINTS,
  TimeframeConfig,
  CandlestickData,
  DataRange,
  User,
  JWTPayload,
  Auth0User,
  ApiError,
  ErrorContext,
  ParsedError,
  AxiosErrorResponse,
  AxiosError,
  ErrorSeverity,
} from '@whalewatch/shared';

// Re-export feed-specific types (these take precedence over shared types)
export * from './alpaca';
export * from './database';
export * from './polygon';
