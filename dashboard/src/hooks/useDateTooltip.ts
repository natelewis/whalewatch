import { useEffect, useRef, useCallback } from 'react';

interface UseDateTooltipProps {
  chartRef: HTMLDivElement | null;
  effectiveHeight: number | null;
  effectiveWidth: number | null;
  enabled?: boolean;
}

interface UseDateTooltipReturn {
  tooltipElement: HTMLElement | null;
  showTooltip: (date: string, x: number, y: number) => void;
  hideTooltip: () => void;
}

// Plotly internal padding constant
const PLOTLY_INTERNAL_PADDING = 35;

export const useDateTooltip = ({
  chartRef,
  effectiveHeight,
  effectiveWidth,
  enabled = true,
}: UseDateTooltipProps): UseDateTooltipReturn => {
  const tooltipRef = useRef<HTMLElement | null>(null);

  // Create tooltip element
  const createTooltip = useCallback((): HTMLElement => {
    const tooltip = document.createElement('div');
    tooltip.className = 'persistent-date-tooltip';
    tooltip.style.position = 'fixed';
    tooltip.style.color = '#6b7280';
    tooltip.style.backgroundColor = '#000000';
    tooltip.style.border = '1px solid #6b7280';
    tooltip.style.marginTop = '-8px';
    tooltip.style.padding = '0';
    tooltip.style.borderRadius = '2px';
    tooltip.style.width = 'auto';
    tooltip.style.minWidth = '100px';
    tooltip.style.fontSize = '12px';
    tooltip.style.paddingTop = '1px';
    tooltip.style.setProperty('color', '#d1d5db', 'important');
    tooltip.style.fontWeight = 'normal';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.lineHeight = '1';
    tooltip.style.letterSpacing = '-0.5px';
    tooltip.style.boxSizing = 'border-box';
    tooltip.style.zIndex = '1000';
    tooltip.style.willChange = 'transform';
    tooltip.style.transform = 'translateZ(0)'; // Force hardware acceleration
    tooltip.style.display = 'none';
    tooltip.style.textAlign = 'center';
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

  // Show tooltip with date and position
  const showTooltip = useCallback(
    (date: string, x: number, y: number) => {
      if (!tooltipRef.current || !enabled) {
return;
}

      const tooltip = tooltipRef.current;

      // Only update if the date has changed to reduce jitter
      if (tooltip.textContent !== date) {
        tooltip.textContent = date;
      }

      tooltip.style.display = 'block';

      // Center the tooltip horizontally under the spike line
      // Get the actual width after the text is set
      const tooltipWidth = tooltip.offsetWidth;
      const centeredX = x - tooltipWidth / 2;

      // Position 15 pixels below the bottom of the chart
      tooltip.style.left = `${Math.round(centeredX)}px`;
      tooltip.style.top = `${Math.round(y + 15)}px`;
    },
    [enabled]
  );

  // Hide tooltip
  const hideTooltip = useCallback(() => {
    if (!tooltipRef.current) {
return;
}

    // Hide immediately without delay to prevent flashing
    tooltipRef.current.style.display = 'none';
  }, []);

  // Check if mouse is within chart bounds
  const isMouseInChart = useCallback(
    (mouseX: number, mouseY: number): boolean => {
      if (effectiveWidth === null || effectiveHeight === null) {
return false;
}

      // Adjust Y position to account for Plotly's internal padding
      const adjustedY = Math.max(0, mouseY - PLOTLY_INTERNAL_PADDING / 2);

      return (
        mouseX >= 0 && mouseX <= effectiveWidth && adjustedY >= 0 && adjustedY <= effectiveHeight
      );
    },
    [effectiveWidth, effectiveHeight]
  );

  // Note: The actual mouse move handling is done in the parent component
  // through Plotly's hover events, so we don't need to add event listeners here
  // The parent component will call showTooltip and hideTooltip directly

  return {
    tooltipElement: tooltipRef.current,
    showTooltip,
    hideTooltip,
  };
};
