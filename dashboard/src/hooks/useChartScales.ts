import { useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import { CandlestickData } from '../utils/chartDataUtils';
import { useChartDimensions, ChartDimensions } from './useChartDimensions';
import { useChartDataProcessor } from './useChartDataProcessor';

/**
 * Hook for creating and managing D3 scales
 * Centralizes scale creation and transformation logic
 */
export const useChartScales = (
  data: CandlestickData[],
  dimensions: ChartDimensions,
  dataPointsToShow: number = 80
) => {
  const { innerWidth, innerHeight, bandWidth } = useChartDimensions(dimensions);
  const { processedData, isValidData, getPriceRange } = useChartDataProcessor(data);

  // Base X scale - maps data indices to screen coordinates
  const baseXScale = useMemo(() => {
    if (!isValidData) {
      return d3.scaleLinear().domain([0, 1]).range([0, innerWidth]);
    }

    return d3
      .scaleLinear()
      .domain([0, processedData.length - 1])
      .range([0, innerWidth]);
  }, [processedData.length, innerWidth, isValidData]);

  // Base Y scale - maps price values to screen coordinates
  const baseYScale = useMemo(() => {
    if (!isValidData) {
      return d3.scaleLinear().domain([0, 1]).range([innerHeight, 0]);
    }

    const priceRange = getPriceRange();
    if (!priceRange) {
      return d3.scaleLinear().domain([0, 1]).range([innerHeight, 0]);
    }

    const { minPrice, maxPrice } = priceRange;
    const padding = (maxPrice - minPrice) * 0.1; // 10% padding

    return d3
      .scaleLinear()
      .domain([minPrice - padding, maxPrice + padding])
      .range([innerHeight, 0]);
  }, [processedData, isValidData, getPriceRange, innerHeight]);

  // Create transformed scales from a D3 zoom transform
  const createTransformedScales = useCallback(
    (transform: d3.ZoomTransform) => {
      return {
        xScale: transform.rescaleX(baseXScale),
        yScale: transform.rescaleY(baseYScale),
      };
    },
    [baseXScale, baseYScale]
  );

  // Create scales for a specific data range
  const createRangeScales = useCallback(
    (startIndex: number, endIndex: number) => {
      if (!isValidData) {
        return {
          xScale: d3.scaleLinear().domain([0, 1]).range([0, innerWidth]),
          yScale: d3.scaleLinear().domain([0, 1]).range([innerHeight, 0]),
        };
      }

      const rangeData = processedData.slice(startIndex, endIndex + 1);
      const priceRange = getPriceRange();

      const xScale = d3.scaleLinear().domain([startIndex, endIndex]).range([0, innerWidth]);

      let yScale: d3.ScaleLinear<number, number>;
      if (priceRange) {
        const { minPrice, maxPrice } = priceRange;
        const padding = (maxPrice - minPrice) * 0.1;
        yScale = d3
          .scaleLinear()
          .domain([minPrice - padding, maxPrice + padding])
          .range([innerHeight, 0]);
      } else {
        yScale = d3.scaleLinear().domain([0, 1]).range([innerHeight, 0]);
      }

      return { xScale, yScale };
    },
    [processedData, isValidData, getPriceRange, innerWidth, innerHeight]
  );

  // Get scale info for debugging
  const getScaleInfo = useCallback(() => {
    return {
      xScale: {
        domain: baseXScale.domain(),
        range: baseXScale.range(),
      },
      yScale: {
        domain: baseYScale.domain(),
        range: baseYScale.range(),
      },
      bandWidth,
      innerWidth,
      innerHeight,
    };
  }, [baseXScale, baseYScale, bandWidth, innerWidth, innerHeight]);

  return {
    baseXScale,
    baseYScale,
    createTransformedScales,
    createRangeScales,
    getScaleInfo,
    isValidData,
  };
};

