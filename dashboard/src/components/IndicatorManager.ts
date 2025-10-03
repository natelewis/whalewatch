/**
 * Indicator Manager - A robust, D3-based class for managing technical indicators on a chart.
 * This class provides a reliable and reusable pattern for rendering and updating indicators,
 * addressing issues like flashing and inconsistent rendering. It uses D3's data join pattern
 * for efficient DOM manipulation.
 */

import * as d3 from 'd3';
import { ChartCalculations, MovingAverageData, MACDData, CandlestickData } from '../types';
import { createViewportXScale } from '../utils/chartDataUtils';
import { logger } from '../utils/logger';

export interface IndicatorRenderItem {
  id: string; // Unique ID for each indicator instance
  data: MovingAverageData[] | MACDData[];
  color: string;
  label: string;
  type: 'moving_average' | 'macd';
}

export interface IndicatorManagerOptions {
  strokeWidth?: number;
  opacity?: number;
}

const DEFAULT_OPTIONS: Required<IndicatorManagerOptions> = {
  strokeWidth: 2,
  opacity: 0.8,
};

export class IndicatorManager {
  private indicatorsGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
  private options: Required<IndicatorManagerOptions>;

  constructor(
    chartContent: d3.Selection<SVGGElement, unknown, null, undefined>,
    options: IndicatorManagerOptions = {}
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };

    // Create or select the main group for all indicators
    const existingGroup = chartContent.select<SVGGElement>('.technical-indicators');
    if (existingGroup.empty()) {
      this.indicatorsGroup = chartContent.append('g').attr('class', 'technical-indicators');
      logger.chart.data('IndicatorManager created a new group.');
    } else {
      this.indicatorsGroup = existingGroup;
      logger.chart.data('IndicatorManager attached to an existing group.');
    }
  }

  /**
   * Updates the indicators on the chart based on the provided data.
   * Uses D3's data join pattern for efficient rendering.
   * @param indicatorItems - An array of indicator items to render.
   * @param calculations - The current chart calculations for positioning.
   */
  public update(indicatorItems: IndicatorRenderItem[], calculations: ChartCalculations): void {
    const xScale = createViewportXScale(
      calculations.viewStart,
      calculations.viewEnd,
      calculations.allData.length,
      calculations.innerWidth
    );

    // Data join for indicator groups
    const indicatorGroups = this.indicatorsGroup
      .selectAll<SVGGElement, IndicatorRenderItem>('g.indicator')
      .data(indicatorItems, d => d.id);

    // Exit phase: remove old indicators
    indicatorGroups.exit().remove();

    // Enter phase: create new groups for new indicators
    const enterGroups = indicatorGroups
      .enter()
      .append('g')
      .attr('class', 'indicator')
      .attr('data-indicator-id', d => d.id);

    // Update phase: merge enter and update selections
    const allGroups = enterGroups.merge(indicatorGroups);

    // Render each indicator within its group
    allGroups.each((d, i, nodes) => {
      const group = d3.select(nodes[i]);
      this.renderIndicator(group, d, xScale, calculations);
    });
  }

  /**
   * Removes all indicators from the chart.
   */
  public removeAll(): void {
    this.indicatorsGroup.selectAll('*').remove();
    logger.chart.data('All indicators removed by IndicatorManager.');
  }

  /**
   * Sets the visibility of all indicators.
   * @param visible - A boolean to set the visibility.
   */
  public setVisibility(visible: boolean): void {
    this.indicatorsGroup.style('opacity', visible ? 1 : 0);
    logger.chart.data(`Indicators visibility set to ${visible}.`);
  }

  /**
   * Renders a single indicator based on its type.
   */
  private renderIndicator(
    group: d3.Selection<SVGGElement, IndicatorRenderItem, null, undefined>,
    item: IndicatorRenderItem,
    xScale: d3.ScaleLinear<number, number>,
    calculations: ChartCalculations
  ): void {
    if (item.type === 'moving_average') {
      this.renderMovingAverage(group, item, xScale, calculations);
    } else if (item.type === 'macd') {
      // Future implementation for MACD or other indicators
      logger.warn(`Indicator type "${item.type}" is not yet implemented in IndicatorManager.`);
    }
  }

  /**
   * Renders a moving average line.
   */
  private renderMovingAverage(
    group: d3.Selection<SVGGElement, IndicatorRenderItem, null, undefined>,
    item: IndicatorRenderItem,
    xScale: d3.ScaleLinear<number, number>,
    calculations: ChartCalculations
  ): void {
    const data = item.data as MovingAverageData[];

    const line = d3
      .line<MovingAverageData>()
      .x(d => xScale(d.index))
      .y(d => calculations.transformedYScale(d.value))
      .curve(d3.curveLinear);

    // Data join for the path element
    const path = group.selectAll<SVGPathElement, MovingAverageData[]>('path.moving-average-line').data([data]);

    // Enter + Update
    path
      .enter()
      .append('path')
      .attr('class', 'moving-average-line')
      .attr('fill', 'none')
      .attr('stroke', item.color)
      .attr('stroke-width', this.options.strokeWidth)
      .attr('opacity', this.options.opacity)
      .merge(path)
      .attr('d', line); // Update path data

    // Exit
    path.exit().remove();
  }
}
