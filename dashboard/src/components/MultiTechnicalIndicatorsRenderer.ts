/**
 * This module is deprecated.
 * All indicator rendering is now handled by the IndicatorManager class
 * in `dashboard/src/components/IndicatorManager.ts`.
 * Please use IndicatorManager for any new indicator rendering logic.
 */
import { MovingAverageData } from '../utils/movingAverageUtils';
import { MACDData } from '../utils/macdUtils';

export interface IndicatorRenderItem {
  id: string;
  data: MovingAverageData[] | MACDData[];
  color: string;
  label: string;
  type: 'moving_average' | 'macd';
}
