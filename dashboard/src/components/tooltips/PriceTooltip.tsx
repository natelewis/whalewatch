import React from 'react';

interface PriceTooltipProps {
  price: number | null;
  visible: boolean;
  x: number;
  y: number;
  className?: string;
}

export const PriceTooltip: React.FC<PriceTooltipProps> = ({
  price,
  visible,
  x,
  y,
  className = '',
}) => {
  if (!visible || price === null) {
    return null;
  }

  return (
    <div
      className={`persistent-price-tooltip ${className}`}
      style={{
        position: 'fixed',
        left: `${x}px`,
        top: `${y - 12}px`,
        backgroundColor: '#6b7280',
        border: 'none',
        marginTop: '3px',
        padding: '0 0 0 8px',
        borderRadius: '0px',
        width: '60px',
        fontSize: '12px',
        color: 'white',
        fontWeight: 'normal',
        pointerEvents: 'none',
        zIndex: 1000,
        willChange: 'transform',
        transform: 'translateZ(0)',
        display: 'block',
      }}
    >
      {price.toFixed(2)}
    </div>
  );
};
