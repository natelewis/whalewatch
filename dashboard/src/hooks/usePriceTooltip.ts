import { useEffect, useRef, useCallback } from 'react';

interface UsePriceTooltipProps {
  chartRef: HTMLDivElement | null;
  topPrice: number | null;
  minPrice: number | null;
  effectiveHeight: number | null;
  effectiveWidth: number | null;
  enabled?: boolean;
}

interface UsePriceTooltipReturn {
  tooltipElement: HTMLElement | null;
  showTooltip: (price: number, x: number, y: number) => void;
  hideTooltip: () => void;
}

// Plotly internal padding constant
const PLOTLY_INTERNAL_PADDING = 35; // 15px top + 15px bottom

export const usePriceTooltip = ({
  chartRef,
  topPrice,
  minPrice,
  effectiveHeight,
  effectiveWidth,
  enabled = true,
}: UsePriceTooltipProps): UsePriceTooltipReturn => {
  const tooltipRef = useRef<HTMLElement | null>(null);

  // Create tooltip element
  const createTooltip = useCallback((): HTMLElement => {
    const tooltip = document.createElement('div');
    tooltip.className = 'persistent-price-tooltip';
    tooltip.style.position = 'fixed';
    tooltip.style.backgroundColor = '#6b7280';
    tooltip.style.border = 'none';
    tooltip.style.marginTop = '3px';
    tooltip.style.padding = '0 0 0 8px';
    tooltip.style.borderRadius = '0px';
    tooltip.style.width = '60px';
    tooltip.style.fontSize = '12px';
    tooltip.style.setProperty('color', 'white', 'important');
    tooltip.style.fontWeight = 'normal';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.zIndex = '1000';
    tooltip.style.willChange = 'transform';
    tooltip.style.transform = 'translateZ(0)'; // Force hardware acceleration
    tooltip.style.display = 'none';
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

  // Show tooltip with price and position
  const showTooltip = useCallback((price: number, x: number, y: number) => {
    if (!tooltipRef.current || !enabled) return;

    const tooltip = tooltipRef.current;
    tooltip.textContent = `${price.toFixed(2)}`;
    tooltip.style.display = 'block';
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y - 12}px`;
  }, [enabled]);

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

  // Calculate price from mouse Y position
  const calculatePriceFromY = useCallback((mouseY: number): number | null => {
    if (
      topPrice === null ||
      minPrice === null ||
      effectiveHeight === null ||
      effectiveHeight <= 0
    ) {
      return null;
    }

    // Adjust Y position to account for Plotly's internal padding
    const adjustedY = Math.max(0, mouseY - PLOTLY_INTERNAL_PADDING / 2);

    // Convert mouse Y position to actual price value
    // Price = topPrice - (adjustedY / effectiveHeight) * (topPrice - minPrice)
    return topPrice - (adjustedY / effectiveHeight) * (topPrice - minPrice);
  }, [topPrice, minPrice, effectiveHeight]);

  // Check if mouse is within chart bounds
  const isMouseInChart = useCallback((mouseX: number, mouseY: number): boolean => {
    if (effectiveWidth === null || effectiveHeight === null) return false;

    // Adjust Y position to account for Plotly's internal padding
    const adjustedY = Math.max(0, mouseY - PLOTLY_INTERNAL_PADDING / 2);

    return (
      mouseX >= 0 &&
      mouseX <= effectiveWidth &&
      adjustedY >= 0 &&
      adjustedY <= effectiveHeight
    );
  }, [effectiveWidth, effectiveHeight]);

  // Handle mouse move events
  useEffect(() => {
    if (!chartRef || !enabled) return;

    const handleMouseMove = (event: MouseEvent) => {
      const plotArea = chartRef.querySelector('.nsewdrag.drag');
      if (!plotArea) return;

      const rect = plotArea.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      if (isMouseInChart(mouseX, mouseY)) {
        const price = calculatePriceFromY(mouseY);
        if (price !== null) {
          showTooltip(price, rect.right, event.clientY);
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
    isMouseInChart,
    calculatePriceFromY,
    showTooltip,
    hideTooltip,
  ]);

  return {
    tooltipElement: tooltipRef.current,
    showTooltip,
    hideTooltip,
  };
};
