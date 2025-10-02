/**
 * Multi Technical Indicators Renderer - Clean D3-based rendering for multiple indicator types
 * This module handles rendering multiple technical indicators without polluting the main chart renderer
 */

import * as d3 from 'd3';
import { ChartCalculations } from '../types';
import { createViewportXScale } from '../utils/chartDataUtils';
import { MovingAverageData } from '../utils/movingAverageUtils';
import { MACDData } from '../utils/macdUtils';
import { IndicatorItem } from '../hooks/useTechnicalIndicators';

export interface IndicatorRenderItem {
  data: any[];
  color: string;
  label: string;
  type: 'moving_average' | 'macd';
}

export interface MultiIndicatorRenderOptions {
  strokeWidth?: number;
  opacity?: number;
  dashArray?: string;
}

const DEFAULT_OPTIONS: Required<MultiIndicatorRenderOptions> = {
  strokeWidth: 2,
  opacity: 0.8,
  dashArray: 'none',
};

/**
 * Render multiple technical indicators on the chart
 * @param svgElement - The SVG element containing the chart
 * @param indicatorItems - Array of indicator items to render
 * @param calculations - Chart calculations for positioning
 * @param options - Rendering options
 */
export const renderMultiTechnicalIndicators = (
  svgElement: SVGSVGElement,
  indicatorItems: IndicatorRenderItem[],
  calculations: ChartCalculations,
  options: MultiIndicatorRenderOptions = {}
): void => {
  if (indicatorItems.length === 0) {
    return;
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Find the chart content group
  const chartContent = d3.select(svgElement).select('.chart-content');
  if (chartContent.empty()) {
    return;
  }

  // Create or reuse the indicators layer
  let indicatorsGroup = chartContent.select<SVGGElement>('.technical-indicators');
  if (indicatorsGroup.empty()) {
    indicatorsGroup = chartContent.append('g').attr('class', 'technical-indicators');
  } else {
    indicatorsGroup.selectAll('*').remove();
  }

  // Create X scale for positioning
  const xScale = createViewportXScale(
    calculations.viewStart,
    calculations.viewEnd,
    calculations.allData.length,
    calculations.innerWidth
  );

  // Render each indicator
  indicatorItems.forEach((item, index) => {
    if (item.data.length === 0) return;

    if (item.type === 'moving_average') {
      renderMovingAverageLine(indicatorsGroup, item, xScale, calculations, opts, index);
    } else if (item.type === 'macd') {
      renderMACDLines(indicatorsGroup, item, xScale, calculations, opts, index);
    }
  });
};

/**
 * Render a moving average line
 */
function renderMovingAverageLine(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  item: IndicatorRenderItem,
  xScale: d3.ScaleLinear<number, number>,
  calculations: ChartCalculations,
  opts: Required<MultiIndicatorRenderOptions>,
  index: number
): void {
  const data = item.data as MovingAverageData[];

  // Create line generator
  const line = d3
    .line<MovingAverageData>()
    .x(d => xScale(d.index))
    .y(d => calculations.transformedYScale(d.value))
    .curve(d3.curveLinear);

  // Render the moving average line
  group
    .append('path')
    .datum(data)
    .attr('d', line)
    .attr('fill', 'none')
    .attr('stroke', item.color)
    .attr('stroke-width', opts.strokeWidth)
    .attr('opacity', opts.opacity)
    .attr('stroke-dasharray', opts.dashArray)
    .attr('class', `moving-average-line indicator-${index}`)
    .attr('data-label', item.label);
}

/**
 * Render MACD lines (MACD line, signal line, and histogram)
 */
function renderMACDLines(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  item: IndicatorRenderItem,
  xScale: d3.ScaleLinear<number, number>,
  calculations: ChartCalculations,
  opts: Required<MultiIndicatorRenderOptions>,
  index: number
): void {
  const data = item.data as MACDData[];

  // Create MACD line generator
  const macdLine = d3
    .line<MACDData>()
    .x(d => xScale(d.index))
    .y(d => calculations.transformedYScale(d.macd))
    .curve(d3.curveLinear);

  // Create signal line generator
  const signalLine = d3
    .line<MACDData>()
    .x(d => xScale(d.index))
    .y(d => calculations.transformedYScale(d.signal))
    .curve(d3.curveLinear);

  // Render MACD line
  group
    .append('path')
    .datum(data)
    .attr('d', macdLine)
    .attr('fill', 'none')
    .attr('stroke', item.color)
    .attr('stroke-width', opts.strokeWidth)
    .attr('opacity', opts.opacity)
    .attr('class', `macd-line indicator-${index}`)
    .attr('data-label', `${item.label} - MACD`);

  // Render signal line (with different color)
  const signalColor = adjustColorBrightness(item.color, 0.7);
  group
    .append('path')
    .datum(data)
    .attr('d', signalLine)
    .attr('fill', 'none')
    .attr('stroke', signalColor)
    .attr('stroke-width', opts.strokeWidth)
    .attr('opacity', opts.opacity)
    .attr('stroke-dasharray', '5,5')
    .attr('class', `macd-signal-line indicator-${index}`)
    .attr('data-label', `${item.label} - Signal`);

  // Render histogram bars
  const barWidth = Math.max(1, xScale(1) - xScale(0));
  const histogramGroup = group.append('g').attr('class', `macd-histogram indicator-${index}`);

  histogramGroup
    .selectAll('.histogram-bar')
    .data(data)
    .enter()
    .append('rect')
    .attr('class', 'histogram-bar')
    .attr('x', d => xScale(d.index) - barWidth / 2)
    .attr('y', d => calculations.transformedYScale(Math.max(0, d.histogram)))
    .attr('width', barWidth)
    .attr('height', d => Math.abs(calculations.transformedYScale(d.histogram) - calculations.transformedYScale(0)))
    .attr('fill', d => (d.histogram >= 0 ? item.color : adjustColorBrightness(item.color, 0.5)))
    .attr('opacity', opts.opacity * 0.6);
}

/**
 * Adjust color brightness
 */
function adjustColorBrightness(color: string, factor: number): string {
  // Simple brightness adjustment - in a real implementation, you'd use a proper color library
  const hex = color.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  const newR = Math.round(r * factor);
  const newG = Math.round(g * factor);
  const newB = Math.round(b * factor);

  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB
    .toString(16)
    .padStart(2, '0')}`;
}

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

  const item: IndicatorRenderItem = {
    data: movingAverageData,
    color: options.color || '#3b82f6',
    label: 'Moving Average',
    type: 'moving_average',
  };

  renderMultiTechnicalIndicators(svgElement, [item], calculations, {
    strokeWidth: options.strokeWidth ?? DEFAULT_OPTIONS.strokeWidth,
    opacity: options.opacity ?? DEFAULT_OPTIONS.opacity,
    dashArray: options.dashArray ?? DEFAULT_OPTIONS.dashArray,
  });
};

/**
 * Remove all technical indicators from the chart
 * @param svgElement - The SVG element containing the chart
 */
export const removeTechnicalIndicators = (svgElement: SVGSVGElement): void => {
  const chartContent = d3.select(svgElement).select('.chart-content');
  const indicatorsGroup = chartContent.select('.technical-indicators');

  if (!indicatorsGroup.empty()) {
    indicatorsGroup.remove();
  }
};

/**
 * Update technical indicators visibility
 * @param svgElement - The SVG element containing the chart
 * @param visible - Whether the technical indicators should be visible
 */
export const setTechnicalIndicatorsVisibility = (svgElement: SVGSVGElement, visible: boolean): void => {
  const chartContent = d3.select(svgElement).select('.chart-content');
  const indicatorsGroup = chartContent.select('.technical-indicators');

  if (!indicatorsGroup.empty()) {
    indicatorsGroup.style('opacity', visible ? 1 : 0);
  }
};
