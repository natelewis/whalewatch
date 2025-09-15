import React from 'react';
import { render, screen } from '@testing-library/react';
import { PriceTooltip } from '../../../components/tooltips/PriceTooltip';

describe('PriceTooltip', () => {
  it('should render tooltip when visible and price is provided', () => {
    render(
      <PriceTooltip
        price={123.45}
        visible={true}
        x={100}
        y={200}
      />
    );

    const tooltip = screen.getByText('123.45');
    expect(tooltip).toBeInTheDocument();
    expect(tooltip).toHaveClass('persistent-price-tooltip');
  });

  it('should not render when not visible', () => {
    render(
      <PriceTooltip
        price={123.45}
        visible={false}
        x={100}
        y={200}
      />
    );

    expect(screen.queryByText('123.45')).not.toBeInTheDocument();
  });

  it('should not render when price is null', () => {
    render(
      <PriceTooltip
        price={null}
        visible={true}
        x={100}
        y={200}
      />
    );

    expect(screen.queryByText('123.45')).not.toBeInTheDocument();
  });

  it('should format price to 2 decimal places', () => {
    render(
      <PriceTooltip
        price={123.456789}
        visible={true}
        x={100}
        y={200}
      />
    );

    expect(screen.getByText('123.46')).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    render(
      <PriceTooltip
        price={123.45}
        visible={true}
        x={100}
        y={200}
        className="custom-class"
      />
    );

    const tooltip = screen.getByText('123.45');
    expect(tooltip).toHaveClass('persistent-price-tooltip', 'custom-class');
  });

  it('should position tooltip correctly', () => {
    render(
      <PriceTooltip
        price={123.45}
        visible={true}
        x={150}
        y={250}
      />
    );

    const tooltip = screen.getByText('123.45');
    expect(tooltip).toHaveStyle({
      position: 'fixed',
      left: '150px',
      top: '238px', // y - 12
    });
  });

  it('should have correct styling properties', () => {
    render(
      <PriceTooltip
        price={123.45}
        visible={true}
        x={100}
        y={200}
      />
    );

    const tooltip = screen.getByText('123.45');
    expect(tooltip).toHaveStyle({
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
      zIndex: '1000',
      willChange: 'transform',
      transform: 'translateZ(0)',
      display: 'block',
    });
  });
});
