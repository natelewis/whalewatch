import { useMemo } from 'react';
import { calculateInnerDimensions } from '../utils/chartDataUtils';

export interface ChartDimensions {
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
}

export interface InnerDimensions {
  innerWidth: number;
  innerHeight: number;
}

/**
 * Hook for calculating and memoizing chart dimensions
 * Centralizes dimension calculations to avoid duplication
 */
export const useChartDimensions = (dimensions: ChartDimensions) => {
  const innerDimensions = useMemo(() => {
    return calculateInnerDimensions(dimensions);
  }, [
    dimensions.width,
    dimensions.height,
    dimensions.margin.top,
    dimensions.margin.right,
    dimensions.margin.bottom,
    dimensions.margin.left,
  ]);

  const bandWidth = useMemo(() => {
    return innerDimensions.innerWidth / 80; // Default CHART_DATA_POINTS
  }, [innerDimensions.innerWidth]);

  return {
    ...innerDimensions,
    bandWidth,
    originalDimensions: dimensions,
  };
};

