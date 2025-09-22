import { describe, it, expect } from 'vitest';
import { X_AXIS_LABEL_CONFIGS, XAxisLabelConfig } from '../constants';

describe('X-axis label configuration', () => {
  describe('X_AXIS_LABEL_CONFIGS', () => {
    it('should have configurations for all supported intervals', () => {
      const expectedIntervals = ['1m', '5m', '30m', '1h', '1d', '1w', '1M'];

      expectedIntervals.forEach(interval => {
        expect(X_AXIS_LABEL_CONFIGS).toHaveProperty(interval);
        expect(X_AXIS_LABEL_CONFIGS[interval]).toBeDefined();
      });
    });

    it('should have valid configuration structure for each interval', () => {
      Object.entries(X_AXIS_LABEL_CONFIGS).forEach(([interval, config]) => {
        expect(config).toHaveProperty('markerIntervalMinutes');
        expect(config).toHaveProperty('labelFormat');
        expect(config).toHaveProperty('showSeconds');

        expect(typeof config.markerIntervalMinutes).toBe('number');
        expect(config.markerIntervalMinutes).toBeGreaterThan(0);

        expect(typeof config.labelFormat).toBe('string');
        expect(['time-only', 'date-only', 'date-time', 'short', 'medium', 'long']).toContain(config.labelFormat);

        expect(typeof config.showSeconds).toBe('boolean');
      });
    });

    it('should have appropriate marker intervals for each timeframe', () => {
      // 1m: 15-minute markers
      expect(X_AXIS_LABEL_CONFIGS['1m'].markerIntervalMinutes).toBe(15);

      // 5m: 90-minute markers
      expect(X_AXIS_LABEL_CONFIGS['5m'].markerIntervalMinutes).toBe(90);

      // 30m: 8-hour markers
      expect(X_AXIS_LABEL_CONFIGS['30m'].markerIntervalMinutes).toBe(480);

      // 1h: 2-day markers
      expect(X_AXIS_LABEL_CONFIGS['1h'].markerIntervalMinutes).toBe(2880);

      // 1d: monthly markers
      expect(X_AXIS_LABEL_CONFIGS['1d'].markerIntervalMinutes).toBe(43200);

      // 1w: 14-day markers (2 weeks)
      expect(X_AXIS_LABEL_CONFIGS['1w'].markerIntervalMinutes).toBe(20160);

      // 1M: yearly markers (12 months)
      expect(X_AXIS_LABEL_CONFIGS['1M'].markerIntervalMinutes).toBe(518400);
    });

    it('should have appropriate label formats for each timeframe', () => {
      // Short timeframes should show date-time
      expect(X_AXIS_LABEL_CONFIGS['1m'].labelFormat).toBe('date-time');

      // Medium timeframes should show date-time
      expect(X_AXIS_LABEL_CONFIGS['5m'].labelFormat).toBe('date-time');
      expect(X_AXIS_LABEL_CONFIGS['30m'].labelFormat).toBe('date-time');
      expect(X_AXIS_LABEL_CONFIGS['1h'].labelFormat).toBe('date-only');

      // Long timeframes should show date only
      expect(X_AXIS_LABEL_CONFIGS['1d'].labelFormat).toBe('date-only');
      expect(X_AXIS_LABEL_CONFIGS['1w'].labelFormat).toBe('date-only');
      expect(X_AXIS_LABEL_CONFIGS['1M'].labelFormat).toBe('date-only');
    });

    it('should not show seconds by default', () => {
      Object.values(X_AXIS_LABEL_CONFIGS).forEach(config => {
        expect(config.showSeconds).toBe(false);
      });
    });

    it('should have consistent configuration structure', () => {
      const configs = Object.values(X_AXIS_LABEL_CONFIGS);

      // All configs should have the same structure
      configs.forEach(config => {
        expect(config).toMatchObject({
          markerIntervalMinutes: expect.any(Number),
          labelFormat: expect.any(String),
          showSeconds: expect.any(Boolean),
        });
      });
    });
  });

  describe('XAxisLabelConfig interface', () => {
    it('should allow valid configuration objects', () => {
      const validConfig: XAxisLabelConfig = {
        markerIntervalMinutes: 30,
        labelFormat: 'time-only',
        showSeconds: false,
      };

      expect(validConfig).toBeDefined();
      expect(validConfig.markerIntervalMinutes).toBe(30);
      expect(validConfig.labelFormat).toBe('time-only');
      expect(validConfig.showSeconds).toBe(false);
    });

    it('should allow optional properties', () => {
      const minimalConfig: XAxisLabelConfig = {
        markerIntervalMinutes: 60,
        labelFormat: 'date-time',
      };

      expect(minimalConfig).toBeDefined();
      expect(minimalConfig.markerIntervalMinutes).toBe(60);
      expect(minimalConfig.labelFormat).toBe('date-time');
      expect(minimalConfig.showSeconds).toBeUndefined();
    });
  });
});
