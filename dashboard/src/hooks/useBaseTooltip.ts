import { useRef, useCallback, useEffect } from 'react';

export interface TooltipConfig {
  className: string;
  baseStyles: React.CSSProperties;
  enabled?: boolean;
}

export interface TooltipPosition {
  x: number;
  y: number;
}

/**
 * Base hook for creating and managing tooltips
 * Centralizes tooltip creation, positioning, and lifecycle management
 */
export const useBaseTooltip = (config: TooltipConfig) => {
  const tooltipRef = useRef<HTMLElement | null>(null);
  const { className, baseStyles, enabled = true } = config;

  // Create tooltip element with base styles
  const createTooltip = useCallback((): HTMLElement => {
    const tooltip = document.createElement('div');
    tooltip.className = className;

    // Apply base styles
    Object.assign(tooltip.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '1000',
      willChange: 'transform',
      transform: 'translateZ(0)', // Force hardware acceleration
      display: 'none',
      ...baseStyles,
    });

    document.body.appendChild(tooltip);
    return tooltip;
  }, [className, baseStyles]);

  // Initialize tooltip element
  useEffect(() => {
    if (!tooltipRef.current && enabled) {
      tooltipRef.current = createTooltip();
    }

    return () => {
      if (tooltipRef.current) {
        tooltipRef.current.remove();
        tooltipRef.current = null;
      }
    };
  }, [createTooltip, enabled]);

  // Show tooltip with content and position
  const showTooltip = useCallback(
    (content: string, position: TooltipPosition) => {
      if (!tooltipRef.current || !enabled) return;

      const tooltip = tooltipRef.current;

      // Only update content if it has changed to reduce jitter
      if (tooltip.textContent !== content) {
        tooltip.textContent = content;
      }

      tooltip.style.display = 'block';
      tooltip.style.left = `${position.x}px`;
      tooltip.style.top = `${position.y}px`;
    },
    [enabled]
  );

  // Hide tooltip
  const hideTooltip = useCallback(() => {
    if (!tooltipRef.current) return;
    tooltipRef.current.style.display = 'none';
  }, []);

  // Update tooltip position without changing content
  const updatePosition = useCallback(
    (position: TooltipPosition) => {
      if (!tooltipRef.current || !enabled) return;

      tooltipRef.current.style.left = `${position.x}px`;
      tooltipRef.current.style.top = `${position.y}px`;
    },
    [enabled]
  );

  // Check if tooltip is currently visible
  const isVisible = useCallback(() => {
    return tooltipRef.current?.style.display === 'block';
  }, []);

  // Get current tooltip element
  const getTooltipElement = useCallback(() => {
    return tooltipRef.current;
  }, []);

  return {
    tooltipElement: tooltipRef.current,
    showTooltip,
    hideTooltip,
    updatePosition,
    isVisible,
    getTooltipElement,
  };
};

