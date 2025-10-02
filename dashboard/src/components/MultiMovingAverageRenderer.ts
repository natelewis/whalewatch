/**
 * Multi Moving Average Renderer - Clean D3-based rendering for multiple moving average lines
 * This module handles rendering multiple moving average lines without polluting the main chart renderer
 */

import * as d3 from 'd3';
import { MovingAverageData } from '../utils/movingAverageUtils';
import { ChartCalculations } from '../types';
import { createViewportXScale } from '../utils/chartDataUtils';

export interface MovingAverageRenderItem {
  data: MovingAverageData[];
  color: string;
  label: string;
}

export interface MultiMovingAverageRenderOptions {
  strokeWidth?: number;
  opacity?: number;
  dashArray?: string;
}

const DEFAULT_OPTIONS: Required<MultiMovingAverageRenderOptions> = {
  strokeWidth: 2,
  opacity: 0.8,
  dashArray: 'none',
};

/**
 * Render multiple moving average lines on the chart
 * @param svgElement - The SVG element containing the chart
 * @param movingAverageItems - Array of moving average items to render
 * @param calculations - Chart calculations for positioning
 * @param options - Rendering options
 */
export const renderMultiMovingAverages = (
  svgElement: SVGSVGElement,
  movingAverageItems: MovingAverageRenderItem[],
  calculations: ChartCalculations,
  options: MultiMovingAverageRenderOptions = {}
): void => {
  if (movingAverageItems.length === 0) {
    return;
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Find the chart content group
  const chartContent = d3.select(svgElement).select('.chart-content');
  if (chartContent.empty()) {
    return;
  }

  // Create or reuse the moving averages layer
  let movingAveragesGroup = chartContent.select<SVGGElement>('.moving-averages');
  if (movingAveragesGroup.empty()) {
    movingAveragesGroup = chartContent.append('g').attr('class', 'moving-averages');
  } else {
    movingAveragesGroup.selectAll('*').remove();
  }

  // Create X scale for positioning
  const xScale = createViewportXScale(
    calculations.viewStart,
    calculations.viewEnd,
    calculations.allData.length,
    calculations.innerWidth
  );

  // Render each moving average line
  movingAverageItems.forEach((item, index) => {
    if (item.data.length === 0) return;

    // Create line generator
    const line = d3
      .line<MovingAverageData>()
      .x(d => xScale(d.index))
      .y(d => calculations.transformedYScale(d.value))
      .curve(d3.curveLinear);

    // Render the moving average line
    movingAveragesGroup
      .append('path')
      .datum(item.data)
      .attr('d', line)
      .attr('fill', 'none')
      .attr('stroke', item.color)
      .attr('stroke-width', opts.strokeWidth)
      .attr('opacity', opts.opacity)
      .attr('stroke-dasharray', opts.dashArray)
      .attr('class', `moving-average-line moving-average-${index}`)
      .attr('data-label', item.label);
  });
};

/**
 * Render single moving average line (backward compatibility)
 * @param svgElement - The SVG element containing the chart
 * @param movingAverageData - The calculated moving average data
 * @param calculations - Chart calculations for positioning
 * @param options - Rendering options
 */
export const renderMovingAverage = (
  svgElement: SVGSVGElement,
  movingAverageData: MovingAverageData[],
  calculations: ChartCalculations,
  options: { color?: string; strokeWidth?: number; opacity?: number; dashArray?: string } = {}
): void => {
  if (movingAverageData.length === 0) {
    return;
  }

  const item: MovingAverageRenderItem = {
    data: movingAverageData,
    color: options.color || '#3b82f6',
    label: 'Moving Average',
  };

  renderMultiMovingAverages(svgElement, [item], calculations, {
    strokeWidth: options.strokeWidth ?? DEFAULT_OPTIONS.strokeWidth,
    opacity: options.opacity ?? DEFAULT_OPTIONS.opacity,
    dashArray: options.dashArray ?? DEFAULT_OPTIONS.dashArray,
  });
};

/**
 * Remove all moving averages from the chart
 * @param svgElement - The SVG element containing the chart
 */
export const removeMovingAverage = (svgElement: SVGSVGElement): void => {
  const chartContent = d3.select(svgElement).select('.chart-content');
  const movingAveragesGroup = chartContent.select('.moving-averages');

  if (!movingAveragesGroup.empty()) {
    movingAveragesGroup.remove();
  }
};

/**
 * Update moving averages visibility
 * @param svgElement - The SVG element containing the chart
 * @param visible - Whether the moving averages should be visible
 */
export const setMovingAverageVisibility = (svgElement: SVGSVGElement, visible: boolean): void => {
  const chartContent = d3.select(svgElement).select('.chart-content');
  const movingAveragesGroup = chartContent.select('.moving-averages');

  if (!movingAveragesGroup.empty()) {
    movingAveragesGroup.style('opacity', visible ? 1 : 0);
  }
};
