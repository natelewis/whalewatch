/**
 * Moving Average Renderer - Clean D3-based moving average line rendering
 * This module handles rendering moving average lines without polluting the main chart renderer
 */

import * as d3 from 'd3';
import { MovingAverageData } from '../utils/movingAverageUtils';
import { ChartCalculations } from '../types';
import { createViewportXScale } from '../utils/chartDataUtils';

export interface MovingAverageRenderOptions {
  color?: string;
  strokeWidth?: number;
  opacity?: number;
  dashArray?: string;
}

const DEFAULT_OPTIONS: Required<MovingAverageRenderOptions> = {
  color: '#3b82f6', // Blue color
  strokeWidth: 2,
  opacity: 0.8,
  dashArray: 'none',
};

/**
 * Render moving average line on the chart
 * @param svgElement - The SVG element containing the chart
 * @param movingAverageData - The calculated moving average data
 * @param calculations - Chart calculations for positioning
 * @param options - Rendering options
 */
export const renderMovingAverage = (
  svgElement: SVGSVGElement,
  movingAverageData: MovingAverageData[],
  calculations: ChartCalculations,
  options: MovingAverageRenderOptions = {}
): void => {
  if (movingAverageData.length === 0) {
    return;
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Find the chart content group
  const chartContent = d3.select(svgElement).select('.chart-content');
  if (chartContent.empty()) {
    return;
  }

  // Create or reuse the moving average layer
  let movingAverageGroup = chartContent.select<SVGGElement>('.moving-average');
  if (movingAverageGroup.empty()) {
    movingAverageGroup = chartContent.append('g').attr('class', 'moving-average');
  } else {
    movingAverageGroup.selectAll('*').remove();
  }

  // Create X scale for positioning
  const xScale = createViewportXScale(
    calculations.viewStart,
    calculations.viewEnd,
    calculations.allData.length,
    calculations.innerWidth
  );

  // Create line generator
  const line = d3
    .line<MovingAverageData>()
    .x(d => xScale(d.index))
    .y(d => calculations.transformedYScale(d.value))
    .curve(d3.curveLinear);

  // Render the moving average line
  movingAverageGroup
    .append('path')
    .datum(movingAverageData)
    .attr('d', line)
    .attr('fill', 'none')
    .attr('stroke', opts.color)
    .attr('stroke-width', opts.strokeWidth)
    .attr('opacity', opts.opacity)
    .attr('stroke-dasharray', opts.dashArray)
    .attr('class', 'moving-average-line');
};

/**
 * Remove moving average from the chart
 * @param svgElement - The SVG element containing the chart
 */
export const removeMovingAverage = (svgElement: SVGSVGElement): void => {
  const chartContent = d3.select(svgElement).select('.chart-content');
  const movingAverageGroup = chartContent.select('.moving-average');

  if (!movingAverageGroup.empty()) {
    movingAverageGroup.remove();
  }
};

/**
 * Update moving average visibility
 * @param svgElement - The SVG element containing the chart
 * @param visible - Whether the moving average should be visible
 */
export const setMovingAverageVisibility = (svgElement: SVGSVGElement, visible: boolean): void => {
  const chartContent = d3.select(svgElement).select('.chart-content');
  const movingAverageGroup = chartContent.select('.moving-average');

  if (!movingAverageGroup.empty()) {
    movingAverageGroup.style('opacity', visible ? 1 : 0);
  }
};
