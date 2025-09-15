import { useEffect, useRef, useCallback, useMemo } from 'react';
import { ChartTimeframe } from '../types';

interface CandlestickData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface UseDateTooltipProps {
  chartRef: HTMLDivElement | null;
  chartData: CandlestickData[];
  timeframe: ChartTimeframe | null;
  enabled?: boolean;
}

interface UseDateTooltipReturn {
  tooltipElement: HTMLElement | null;
  showTooltip: (dataIndex: number, x: number, y: number) => void;
  hideTooltip: () => void;
  getFormattedTime: (dataIndex: number) => string;
}

export const useDateTooltip = ({
  chartRef,
  chartData,
  timeframe,
  enabled = true,
}: UseDateTooltipProps): UseDateTooltipReturn => {
  const tooltipRef = useRef<HTMLElement | null>(null);

  // Create tooltip element
  const createTooltip = useCallback((): HTMLElement => {
    const tooltip = document.createElement('div');
    tooltip.className = 'persistent-date-tooltip';
    tooltip.style.position = 'fixed';
    tooltip.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    tooltip.style.border = '1px solid #374151';
    tooltip.style.borderRadius = '4px';
    tooltip.style.padding = '8px 12px';
    tooltip.style.fontSize = '12px';
    tooltip.style.color = '#d1d5db';
    tooltip.style.fontWeight = 'normal';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.zIndex = '1000';
    tooltip.style.willChange = 'transform';
    tooltip.style.transform = 'translateZ(0)'; // Force hardware acceleration
    tooltip.style.display = 'none';
    tooltip.style.maxWidth = '200px';
    tooltip.style.whiteSpace = 'nowrap';
    document.body.appendChild(tooltip);
    return tooltip;
  }, []);

  // Initialize tooltip element
  useEffect(() => {
    if (!tooltipRef.current) {
      tooltipRef.current = createTooltip();
    }

    return () => {
      if (tooltipRef.current) {
        tooltipRef.current.remove();
        tooltipRef.current = null;
      }
    };
  }, [createTooltip]);

  // Format time based on timeframe
  const getFormattedTime = useCallback((dataIndex: number): string => {
    if (dataIndex < 0 || dataIndex >= chartData.length) return '';

    const time = new Date(chartData[dataIndex].time);

    // Determine if we should show only time (for intervals < 1 day)
    const isTimeOnly = timeframe && ['1m', '5m', '30m', '1h', '2h', '4h'].includes(timeframe);

    if (isTimeOnly) {
      // Show only time for intervals less than 1 day
      return time.toLocaleString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    } else {
      // Show date and time for daily and longer intervals
      return time.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    }
  }, [chartData, timeframe]);

  // Get data point info for tooltip
  const getDataPointInfo = useCallback((dataIndex: number): string => {
    if (dataIndex < 0 || dataIndex >= chartData.length) return '';

    const data = chartData[dataIndex];
    const time = getFormattedTime(dataIndex);

    return `Time: ${time}\nOpen: $${data.open.toFixed(4)}\nHigh: $${data.high.toFixed(4)}\nLow: $${data.low.toFixed(4)}\nClose: $${data.close.toFixed(4)}`;
  }, [chartData, getFormattedTime]);

  // Show tooltip with data point info
  const showTooltip = useCallback((dataIndex: number, x: number, y: number) => {
    if (!tooltipRef.current || !enabled) return;

    const tooltip = tooltipRef.current;
    const info = getDataPointInfo(dataIndex);
    
    // Split by newlines and create HTML content
    const lines = info.split('\n');
    const htmlContent = lines.map(line => {
      if (line.startsWith('Time:')) {
        return `<div style="font-weight: bold; color: #f3f4f6;">${line}</div>`;
      }
      return `<div>${line}</div>`;
    }).join('');

    tooltip.innerHTML = htmlContent;
    tooltip.style.display = 'block';
    
    // Position tooltip to avoid going off-screen
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let left = x + 10;
    let top = y - 10;
    
    // Adjust if tooltip would go off the right edge
    if (left + tooltipRect.width > viewportWidth) {
      left = x - tooltipRect.width - 10;
    }
    
    // Adjust if tooltip would go off the bottom edge
    if (top + tooltipRect.height > viewportHeight) {
      top = y - tooltipRect.height - 10;
    }
    
    // Ensure tooltip doesn't go off the left or top edges
    left = Math.max(10, left);
    top = Math.max(10, top);
    
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }, [enabled, getDataPointInfo]);

  // Hide tooltip
  const hideTooltip = useCallback(() => {
    if (!tooltipRef.current) return;

    // Add a small delay before hiding to prevent flickering
    setTimeout(() => {
      if (tooltipRef.current) {
        tooltipRef.current.style.display = 'none';
      }
    }, 100);
  }, []);

  // Calculate data index from mouse X position
  const calculateDataIndexFromX = useCallback((mouseX: number, chartWidth: number): number => {
    if (chartData.length === 0 || chartWidth <= 0) return -1;

    // Convert mouse X position to data index
    // Assuming data points are evenly distributed across the chart width
    const dataIndex = Math.round((mouseX / chartWidth) * (chartData.length - 1));
    
    // Clamp to valid range
    return Math.max(0, Math.min(dataIndex, chartData.length - 1));
  }, [chartData]);

  // Handle mouse move events for date tooltip
  useEffect(() => {
    if (!chartRef || !enabled || chartData.length === 0) return;

    const handleMouseMove = (event: MouseEvent) => {
      const plotArea = chartRef.querySelector('.nsewdrag.drag');
      if (!plotArea) return;

      const rect = plotArea.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      // Check if mouse is within the plot area
      if (mouseX >= 0 && mouseX <= rect.width && mouseY >= 0 && mouseY <= rect.height) {
        const dataIndex = calculateDataIndexFromX(mouseX, rect.width);
        if (dataIndex >= 0) {
          showTooltip(dataIndex, event.clientX, event.clientY);
        }
      }
    };

    const handleMouseLeave = () => {
      hideTooltip();
    };

    chartRef.addEventListener('mousemove', handleMouseMove);
    chartRef.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      chartRef.removeEventListener('mousemove', handleMouseMove);
      chartRef.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [
    chartRef,
    enabled,
    chartData,
    calculateDataIndexFromX,
    showTooltip,
    hideTooltip,
  ]);

  return {
    tooltipElement: tooltipRef.current,
    showTooltip,
    hideTooltip,
    getFormattedTime,
  };
};
