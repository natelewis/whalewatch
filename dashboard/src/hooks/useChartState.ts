import { useState, useCallback, useRef, useEffect } from 'react';
import * as d3 from 'd3';
import { ChartTimeframe, ChartDimensions } from '../types';

export interface ChartDataPoint {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ChartTransform {
  x: number;
  y: number;
  k: number; // scale factor
}

export interface ChartViewport {
  startIndex: number;
  endIndex: number;
  visibleData: ChartDataPoint[];
}

export interface ChartState {
  // Data
  data: ChartDataPoint[];
  sortedData: ChartDataPoint[];

  // Dimensions
  dimensions: ChartDimensions;

  // Transform and viewport
  transform: ChartTransform;
  viewport: ChartViewport;

  // Predictive loading state
  currentViewStart: number;
  currentViewEnd: number;
  isLoadingMoreData: boolean;
  hasUserPanned: boolean;
  isAtRightEdge: boolean;

  // UI state
  isLive: boolean;
  isZooming: boolean;
  isPanning: boolean;
  isLoading: boolean;
  error: string | null;

  // Hover state
  hoverData: {
    x: number;
    y: number;
    data: ChartDataPoint | null;
  } | null;

  // Configuration
  timeframe: ChartTimeframe | null;
  symbol: string;
  dataPointsToShow: number;
}

export interface ChartActions {
  // Data actions
  setData: (data: ChartDataPoint[]) => void;
  addDataPoint: (point: ChartDataPoint) => void;
  prependData: (points: ChartDataPoint[]) => void;
  appendData: (points: ChartDataPoint[]) => void;

  // Transform actions
  setTransform: (transform: ChartTransform) => void;
  updateTransform: (updates: Partial<ChartTransform>) => void;
  resetTransform: () => void;

  // Viewport actions
  setViewport: (viewport: ChartViewport) => void;
  updateViewport: (updates: Partial<ChartViewport>) => void;
  panToIndex: (index: number) => void;
  panBy: (deltaX: number, deltaY: number) => void;
  zoomToScale: (scale: number, centerX?: number, centerY?: number) => void;

  // Predictive loading actions
  setCurrentViewStart: (start: number) => void;
  setCurrentViewEnd: (end: number) => void;
  setIsLoadingMoreData: (loading: boolean) => void;
  setHasUserPanned: (panned: boolean) => void;
  setIsAtRightEdge: (atEdge: boolean) => void;

  // UI actions
  setIsLive: (isLive: boolean) => void;
  setIsZooming: (isZooming: boolean) => void;
  setIsPanning: (isPanning: boolean) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  setHoverData: (hoverData: ChartState['hoverData']) => void;

  // Configuration actions
  setTimeframe: (timeframe: ChartTimeframe) => void;
  setSymbol: (symbol: string) => void;
  setDimensions: (dimensions: ChartDimensions) => void;

  // Computed values
  getVisibleData: () => ChartDataPoint[];
  getXScale: () => d3.ScaleLinear<number, number>;
  getYScale: () => d3.ScaleLinear<number, number>;
  getTransformedXScale: () => d3.ScaleLinear<number, number>;
  getTransformedYScale: () => d3.ScaleLinear<number, number>;
}

const DEFAULT_DATA_POINTS = 80;
const DEFAULT_DIMENSIONS: ChartDimensions = {
  width: 800,
  height: 400,
  margin: { top: 20, right: 30, bottom: 40, left: 60 },
};

const DEFAULT_TRANSFORM: ChartTransform = {
  x: 0,
  y: 0,
  k: 1,
};

export const useChartState = (
  initialSymbol: string,
  initialTimeframe: ChartTimeframe | null = null
) => {
  const [state, setState] = useState<ChartState>({
    data: [],
    sortedData: [],
    dimensions: DEFAULT_DIMENSIONS,
    transform: DEFAULT_TRANSFORM,
    viewport: {
      startIndex: 0,
      endIndex: 0,
      visibleData: [],
    },
    currentViewStart: 0,
    currentViewEnd: 0,
    isLoadingMoreData: false,
    hasUserPanned: false,
    isAtRightEdge: false,
    isLive: false,
    isZooming: false,
    isPanning: false,
    isLoading: false,
    error: null,
    hoverData: null,
    timeframe: initialTimeframe,
    symbol: initialSymbol,
    dataPointsToShow: DEFAULT_DATA_POINTS,
  });

  // Refs for tracking previous values
  const prevDataLengthRef = useRef(0);
  const isInitialLoadRef = useRef(true);

  // Update sorted data whenever data changes
  useEffect(() => {
    const sortedData = [...state.data].sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );

    if (JSON.stringify(sortedData) !== JSON.stringify(state.sortedData)) {
      setState((prev) => ({ ...prev, sortedData }));
    }
  }, [state.data, state.sortedData]);

  // Update viewport when data or transform changes
  useEffect(() => {
    if (state.sortedData.length === 0) {
      return;
    }

    const { width, height, margin } = state.dimensions;
    const innerWidth = width - margin.left - margin.right;
    const bandWidth = innerWidth / state.dataPointsToShow;

    // Calculate visible range based on transform
    const xScale = d3
      .scaleLinear()
      .domain([0, state.sortedData.length - 1])
      .range([0, (state.sortedData.length - 1) * bandWidth]);

    const transformedXScale =
      state.transform.k === 1 && state.transform.x === 0
        ? xScale
        : d3.zoomIdentity
            .translate(state.transform.x, state.transform.y)
            .scale(state.transform.k)
            .rescaleX(xScale);

    const visibleDomain = transformedXScale.domain();
    const startIndex = Math.max(0, Math.floor(visibleDomain[0]));
    const endIndex = Math.min(state.sortedData.length - 1, Math.ceil(visibleDomain[1]));

    const visibleData = state.sortedData.slice(startIndex, endIndex + 1);

    setState((prev) => ({
      ...prev,
      viewport: {
        startIndex,
        endIndex,
        visibleData,
      },
      currentViewStart: startIndex,
      currentViewEnd: endIndex,
    }));
  }, [state.sortedData, state.transform, state.dimensions, state.dataPointsToShow]);

  // Handle initial data load
  useEffect(() => {
    if (state.sortedData.length > 0 && isInitialLoadRef.current) {
      const totalDataLength = state.sortedData.length;
      const newEndIndex = totalDataLength - 1;
      const newStartIndex = Math.max(0, newEndIndex - state.dataPointsToShow + 1);

      // Set initial transform to show the most recent data
      const { width, margin } = state.dimensions;
      const innerWidth = width - margin.left - margin.right;
      const bandWidth = innerWidth / state.dataPointsToShow;
      const xScale = d3
        .scaleLinear()
        .domain([0, totalDataLength - 1])
        .range([0, (totalDataLength - 1) * bandWidth]);

      const startOfViewIndex = totalDataLength - state.dataPointsToShow;
      const initialTranslateX = startOfViewIndex > 0 ? -xScale(startOfViewIndex) : 0;

      setState((prev) => ({
        ...prev,
        transform: {
          x: initialTranslateX,
          y: 0,
          k: 1,
        },
      }));

      isInitialLoadRef.current = false;
    }
  }, [state.sortedData.length, state.dataPointsToShow, state.dimensions]);

  // Data actions
  const setData = useCallback((data: ChartDataPoint[]) => {
    setState((prev) => ({ ...prev, data }));
    prevDataLengthRef.current = data.length;
  }, []);

  const addDataPoint = useCallback((point: ChartDataPoint) => {
    setState((prev) => ({
      ...prev,
      data: [...prev.data, point],
    }));
  }, []);

  const prependData = useCallback((points: ChartDataPoint[]) => {
    setState((prev) => ({
      ...prev,
      data: [...points, ...prev.data],
    }));
  }, []);

  const appendData = useCallback((points: ChartDataPoint[]) => {
    setState((prev) => ({
      ...prev,
      data: [...prev.data, ...points],
    }));
  }, []);

  // Transform actions
  const setTransform = useCallback((transform: ChartTransform) => {
    setState((prev) => ({ ...prev, transform }));
  }, []);

  const updateTransform = useCallback((updates: Partial<ChartTransform>) => {
    setState((prev) => ({
      ...prev,
      transform: { ...prev.transform, ...updates },
    }));
  }, []);

  const resetTransform = useCallback(() => {
    setState((prev) => ({
      ...prev,
      transform: DEFAULT_TRANSFORM,
    }));
  }, []);

  // Viewport actions
  const setViewport = useCallback((viewport: ChartViewport) => {
    setState((prev) => ({ ...prev, viewport }));
  }, []);

  const updateViewport = useCallback((updates: Partial<ChartViewport>) => {
    setState((prev) => ({
      ...prev,
      viewport: { ...prev.viewport, ...updates },
    }));
  }, []);

  const panToIndex = useCallback(
    (index: number) => {
      if (state.sortedData.length === 0) {
        return;
      }

      const { width, margin } = state.dimensions;
      const innerWidth = width - margin.left - margin.right;
      const bandWidth = innerWidth / state.dataPointsToShow;
      const xScale = d3
        .scaleLinear()
        .domain([0, state.sortedData.length - 1])
        .range([0, (state.sortedData.length - 1) * bandWidth]);

      const targetX = -xScale(index);
      setState((prev) => ({
        ...prev,
        transform: { ...prev.transform, x: targetX },
      }));
    },
    [state.sortedData.length, state.dimensions, state.dataPointsToShow]
  );

  const panBy = useCallback((deltaX: number, deltaY: number) => {
    setState((prev) => ({
      ...prev,
      transform: {
        ...prev.transform,
        x: prev.transform.x + deltaX,
        y: prev.transform.y + deltaY,
      },
    }));
  }, []);

  const zoomToScale = useCallback((scale: number, centerX?: number, centerY?: number) => {
    const clampedScale = Math.max(0.5, Math.min(10, scale));
    setState((prev) => ({
      ...prev,
      transform: {
        ...prev.transform,
        k: clampedScale,
        x: centerX !== undefined ? centerX : prev.transform.x,
        y: centerY !== undefined ? centerY : prev.transform.y,
      },
    }));
  }, []);

  // UI actions
  const setIsLive = useCallback((isLive: boolean) => {
    setState((prev) => ({ ...prev, isLive }));
  }, []);

  const setIsZooming = useCallback((isZooming: boolean) => {
    setState((prev) => ({ ...prev, isZooming }));
  }, []);

  const setIsPanning = useCallback((isPanning: boolean) => {
    setState((prev) => ({ ...prev, isPanning }));
  }, []);

  const setIsLoading = useCallback((isLoading: boolean) => {
    setState((prev) => ({ ...prev, isLoading }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState((prev) => ({ ...prev, error }));
  }, []);

  const setHoverData = useCallback((hoverData: ChartState['hoverData']) => {
    setState((prev) => ({ ...prev, hoverData }));
  }, []);

  // Predictive loading actions
  const setCurrentViewStart = useCallback((start: number) => {
    setState((prev) => ({ ...prev, currentViewStart: start }));
  }, []);

  const setCurrentViewEnd = useCallback((end: number) => {
    setState((prev) => ({ ...prev, currentViewEnd: end }));
  }, []);

  const setIsLoadingMoreData = useCallback((loading: boolean) => {
    setState((prev) => ({ ...prev, isLoadingMoreData: loading }));
  }, []);

  const setHasUserPanned = useCallback((panned: boolean) => {
    setState((prev) => ({ ...prev, hasUserPanned: panned }));
  }, []);

  const setIsAtRightEdge = useCallback((atEdge: boolean) => {
    setState((prev) => ({ ...prev, isAtRightEdge: atEdge }));
  }, []);

  // Configuration actions
  const setTimeframe = useCallback((timeframe: ChartTimeframe) => {
    setState((prev) => ({ ...prev, timeframe }));
  }, []);

  const setSymbol = useCallback((symbol: string) => {
    setState((prev) => ({ ...prev, symbol }));
  }, []);

  const setDimensions = useCallback((dimensions: ChartDimensions) => {
    setState((prev) => ({ ...prev, dimensions }));
  }, []);

  // Computed values
  const getVisibleData = useCallback(() => {
    return state.viewport.visibleData;
  }, [state.viewport.visibleData]);

  const getXScale = useCallback(() => {
    if (state.sortedData.length === 0) {
      return d3.scaleLinear().domain([0, 1]).range([0, 1]);
    }

    const { width, margin } = state.dimensions;
    const innerWidth = width - margin.left - margin.right;
    const bandWidth = innerWidth / state.dataPointsToShow;

    return d3
      .scaleLinear()
      .domain([0, state.sortedData.length - 1])
      .range([0, (state.sortedData.length - 1) * bandWidth]);
  }, [state.sortedData.length, state.dimensions, state.dataPointsToShow]);

  const getYScale = useCallback(() => {
    if (state.viewport.visibleData.length === 0) {
      return d3.scaleLinear().domain([0, 1]).range([0, 1]);
    }

    const { height, margin } = state.dimensions;
    const innerHeight = height - margin.top - margin.bottom;

    return d3
      .scaleLinear()
      .domain([
        d3.min(state.viewport.visibleData, (d) => d.low) as number,
        d3.max(state.viewport.visibleData, (d) => d.high) as number,
      ])
      .nice()
      .range([innerHeight, 0]);
  }, [state.viewport.visibleData, state.dimensions]);

  const getTransformedXScale = useCallback(() => {
    const baseXScale = getXScale();
    if (state.transform.k === 1 && state.transform.x === 0) {
      return baseXScale;
    }

    return d3.zoomIdentity
      .translate(state.transform.x, state.transform.y)
      .scale(state.transform.k)
      .rescaleX(baseXScale);
  }, [getXScale, state.transform]);

  const getTransformedYScale = useCallback(() => {
    const baseYScale = getYScale();
    if (state.transform.k === 1 && state.transform.y === 0) {
      return baseYScale;
    }

    return d3.zoomIdentity
      .translate(state.transform.x, state.transform.y)
      .scale(state.transform.k)
      .rescaleY(baseYScale);
  }, [getYScale, state.transform]);

  const actions: ChartActions = {
    setData,
    addDataPoint,
    prependData,
    appendData,
    setTransform,
    updateTransform,
    resetTransform,
    setViewport,
    updateViewport,
    panToIndex,
    panBy,
    zoomToScale,
    setCurrentViewStart,
    setCurrentViewEnd,
    setIsLoadingMoreData,
    setHasUserPanned,
    setIsAtRightEdge,
    setIsLive,
    setIsZooming,
    setIsPanning,
    setIsLoading,
    setError,
    setHoverData,
    setTimeframe,
    setSymbol,
    setDimensions,
    getVisibleData,
    getXScale,
    getYScale,
    getTransformedXScale,
    getTransformedYScale,
  };

  return { state, actions };
};
