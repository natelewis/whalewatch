import React from 'react';
import { render, screen } from '@testing-library/react';
import { DateTooltip } from '../../../components/tooltips/DateTooltip';

const mockData = {
  time: '2023-01-01T10:30:00Z',
  open: 100.1234,
  high: 105.5678,
  low: 95.9876,
  close: 102.3456,
};

describe('DateTooltip', () => {
  it('should render tooltip when visible and data is provided', () => {
    render(
      <DateTooltip
        data={mockData}
        visible={true}
        x={100}
        y={200}
      />
    );

    expect(screen.getByText(/Time:/)).toBeInTheDocument();
    expect(screen.getByText('Open: $100.1234')).toBeInTheDocument();
    expect(screen.getByText('High: $105.5678')).toBeInTheDocument();
    expect(screen.getByText('Low: $95.9876')).toBeInTheDocument();
    expect(screen.getByText('Close: $102.3456')).toBeInTheDocument();
  });

  it('should not render when not visible', () => {
    render(
      <DateTooltip
        data={mockData}
        visible={false}
        x={100}
        y={200}
      />
    );

    expect(screen.queryByText(/Time:/)).not.toBeInTheDocument();
  });

  it('should not render when data is null', () => {
    render(
      <DateTooltip
        data={null}
        visible={true}
        x={100}
        y={200}
      />
    );

    expect(screen.queryByText(/Time:/)).not.toBeInTheDocument();
  });

  it('should format time correctly', () => {
    render(
      <DateTooltip
        data={mockData}
        visible={true}
        x={100}
        y={200}
      />
    );

    // Should show formatted time (e.g., "Jan 1, 10:30")
    const timeElement = screen.getByText(/Time:/);
    expect(timeElement).toBeInTheDocument();
    expect(timeElement.textContent).toMatch(/Time: \w{3} \d{1,2}, \d{2}:\d{2}/);
  });

  it('should format prices to 4 decimal places', () => {
    render(
      <DateTooltip
        data={mockData}
        visible={true}
        x={100}
        y={200}
      />
    );

    expect(screen.getByText('Open: $100.1234')).toBeInTheDocument();
    expect(screen.getByText('High: $105.5678')).toBeInTheDocument();
    expect(screen.getByText('Low: $95.9876')).toBeInTheDocument();
    expect(screen.getByText('Close: $102.3456')).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    render(
      <DateTooltip
        data={mockData}
        visible={true}
        x={100}
        y={200}
        className="custom-class"
      />
    );

    const tooltip = screen.getByText(/Time:/).closest('div');
    expect(tooltip).toHaveClass('persistent-date-tooltip', 'custom-class');
  });

  it('should position tooltip correctly', () => {
    render(
      <DateTooltip
        data={mockData}
        visible={true}
        x={150}
        y={250}
      />
    );

    const tooltip = screen.getByText(/Time:/).closest('div');
    expect(tooltip).toHaveStyle({
      position: 'fixed',
      left: '150px',
      top: '250px',
    });
  });

  it('should have correct styling properties', () => {
    render(
      <DateTooltip
        data={mockData}
        visible={true}
        x={100}
        y={200}
      />
    );

    const tooltip = screen.getByText(/Time:/).closest('div');
    expect(tooltip).toHaveStyle({
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      border: '1px solid #374151',
      borderRadius: '4px',
      padding: '8px 12px',
      fontSize: '12px',
      color: '#d1d5db',
      fontWeight: 'normal',
      pointerEvents: 'none',
      zIndex: '1000',
      willChange: 'transform',
      transform: 'translateZ(0)',
      display: 'block',
      maxWidth: '200px',
      whiteSpace: 'nowrap',
    });
  });

  it('should highlight time with bold styling', () => {
    render(
      <DateTooltip
        data={mockData}
        visible={true}
        x={100}
        y={200}
      />
    );

    const timeElement = screen.getByText(/Time:/);
    expect(timeElement).toHaveStyle({
      fontWeight: 'bold',
      color: '#f3f4f6',
    });
  });

  it('should handle different time formats', () => {
    const differentTimeData = {
      ...mockData,
      time: '2023-12-25T23:59:59Z',
    };

    render(
      <DateTooltip
        data={differentTimeData}
        visible={true}
        x={100}
        y={200}
      />
    );

    const timeElement = screen.getByText(/Time:/);
    expect(timeElement).toBeInTheDocument();
    expect(timeElement.textContent).toMatch(/Time: Dec 25, \d{2}:\d{2}/);
  });
});
