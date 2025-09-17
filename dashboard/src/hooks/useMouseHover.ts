import { useEffect, useRef, useCallback } from 'react';

interface MousePosition {
  x: number;
  y: number;
}

interface UseMouseHoverProps {
  chartRef: HTMLDivElement | null;
  enabled?: boolean;
  onMouseMove?: (position: MousePosition, event: MouseEvent) => void;
  onMouseLeave?: () => void;
  onMouseEnter?: (position: MousePosition, event: MouseEvent) => void;
}

interface UseMouseHoverReturn {
  mousePosition: MousePosition | null;
  isHovering: boolean;
  getRelativePosition: (event: MouseEvent) => MousePosition | null;
}

export const useMouseHover = ({
  chartRef,
  enabled = true,
  onMouseMove,
  onMouseLeave,
  onMouseEnter,
}: UseMouseHoverProps): UseMouseHoverReturn => {
  const mousePositionRef = useRef<MousePosition | null>(null);
  const isHoveringRef = useRef<boolean>(false);

  // Get relative position within the chart area
  const getRelativePosition = useCallback((event: MouseEvent): MousePosition | null => {
    if (!chartRef) {
return null;
}

    const plotArea = chartRef.querySelector('.nsewdrag.drag');
    if (!plotArea) {
return null;
}

    const rect = plotArea.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }, [chartRef]);

  // Check if mouse is within chart bounds
  const isWithinChartBounds = useCallback((position: MousePosition, chartWidth: number, chartHeight: number): boolean => {
    return (
      position.x >= 0 &&
      position.x <= chartWidth &&
      position.y >= 0 &&
      position.y <= chartHeight
    );
  }, []);

  // Handle mouse move events
  useEffect(() => {
    if (!chartRef || !enabled) {
return;
}

    const handleMouseMove = (event: MouseEvent) => {
      const position = getRelativePosition(event);
      if (!position) {
return;
}

      const plotArea = chartRef.querySelector('.nsewdrag.drag');
      if (!plotArea) {
return;
}

      const rect = plotArea.getBoundingClientRect();
      const isWithinBounds = isWithinChartBounds(position, rect.width, rect.height);

      // Update position tracking
      mousePositionRef.current = position;
      
      // Update hovering state
      const wasHovering = isHoveringRef.current;
      isHoveringRef.current = isWithinBounds;

      // Call onMouseEnter if we just started hovering
      if (!wasHovering && isWithinBounds && onMouseEnter) {
        onMouseEnter(position, event);
      }

      // Call onMouseMove if we're hovering
      if (isWithinBounds && onMouseMove) {
        onMouseMove(position, event);
      }
    };

    const handleMouseLeave = () => {
      isHoveringRef.current = false;
      mousePositionRef.current = null;
      
      if (onMouseLeave) {
        onMouseLeave();
      }
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
    getRelativePosition,
    isWithinChartBounds,
    onMouseMove,
    onMouseLeave,
    onMouseEnter,
  ]);

  return {
    mousePosition: mousePositionRef.current,
    isHovering: isHoveringRef.current,
    getRelativePosition,
  };
};
