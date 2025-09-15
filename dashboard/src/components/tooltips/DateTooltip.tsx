import React from 'react';

interface CandlestickData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface DateTooltipProps {
  data: CandlestickData | null;
  visible: boolean;
  x: number;
  y: number;
  className?: string;
}

export const DateTooltip: React.FC<DateTooltipProps> = ({
  data,
  visible,
  x,
  y,
  className = '',
}) => {
  if (!visible || !data) {
    return null;
  }

  const formatTime = (timeString: string): string => {
    const time = new Date(timeString);
    return time.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  return (
    <div
      className={`persistent-date-tooltip ${className}`}
      style={{
        position: 'fixed',
        left: `${x}px`,
        top: `${y}px`,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        border: '1px solid #374151',
        borderRadius: '4px',
        padding: '8px 12px',
        fontSize: '12px',
        color: '#d1d5db',
        fontWeight: 'normal',
        pointerEvents: 'none',
        zIndex: 1000,
        willChange: 'transform',
        transform: 'translateZ(0)',
        display: 'block',
        maxWidth: '200px',
        whiteSpace: 'nowrap',
      }}
    >
      <div style={{ fontWeight: 'bold', color: '#f3f4f6', marginBottom: '4px' }}>
        Time: {formatTime(data.time)}
      </div>
      <div>Open: ${data.open.toFixed(4)}</div>
      <div>High: ${data.high.toFixed(4)}</div>
      <div>Low: ${data.low.toFixed(4)}</div>
      <div>Close: ${data.close.toFixed(4)}</div>
    </div>
  );
};
