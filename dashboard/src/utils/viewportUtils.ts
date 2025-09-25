import { CHART_DATA_POINTS, BUFFER_SIZE } from '../constants';

export interface ViewportCalculation {
  start: number;
  end: number;
  size: number;
}

export interface ViewportValidation {
  isValid: boolean;
  errors: string[];
  corrected?: ViewportCalculation;
}

/**
 * Calculate viewport for showing newest data
 */
export const calculateNewestViewport = (dataLength: number): ViewportCalculation => {
  const end = dataLength - 1;
  const start = Math.max(0, dataLength - CHART_DATA_POINTS);

  return {
    start,
    end,
    size: end - start + 1,
  };
};

/**
 * Calculate viewport for auto-load anchoring
 */
export const calculateAnchoredViewport = (
  prevStart: number,
  prevEnd: number,
  dataShift: number,
  totalDataLength: number
): ViewportCalculation => {
  let anchoredStart = Math.round(prevStart + dataShift);
  let anchoredEnd = Math.round(prevEnd + dataShift);

  // Ensure the viewport is expanded to the proper CHART_DATA_POINTS size
  const properWindowSize = CHART_DATA_POINTS;
  const currentWindowSize = anchoredEnd - anchoredStart + 1;

  if (currentWindowSize < properWindowSize) {
    // For auto-load, we want to center the viewport around the anchored position
    const centerPoint = Math.round((anchoredStart + anchoredEnd) / 2);
    const halfWindow = Math.floor(properWindowSize / 2);
    anchoredStart = Math.max(0, centerPoint - halfWindow);
    anchoredEnd = Math.min(totalDataLength - 1, centerPoint + halfWindow);

    // Adjust to ensure exactly properWindowSize points
    const actualWindowSize = anchoredEnd - anchoredStart + 1;
    if (actualWindowSize < properWindowSize) {
      // Try to expand to the right first
      const rightExpansion = Math.min(totalDataLength - 1 - anchoredEnd, properWindowSize - actualWindowSize);
      anchoredEnd += rightExpansion;

      // If still not enough, expand to the left
      const remainingExpansion = properWindowSize - (anchoredEnd - anchoredStart + 1);
      if (remainingExpansion > 0) {
        anchoredStart = Math.max(0, anchoredStart - remainingExpansion);
      }
    } else if (actualWindowSize > properWindowSize) {
      // Trim excess from the right
      anchoredEnd = anchoredStart + properWindowSize - 1;
    }
  }

  // Ensure bounds
  if (anchoredEnd > totalDataLength - 1) {
    anchoredEnd = totalDataLength - 1;
  }
  if (anchoredStart < 0) {
    anchoredStart = 0;
  }

  return {
    start: anchoredStart,
    end: anchoredEnd,
    size: anchoredEnd - anchoredStart + 1,
  };
};

/**
 * Validate viewport bounds and constraints
 */
export const validateViewport = (start: number, end: number, dataLength: number): ViewportValidation => {
  const errors: string[] = [];

  if (dataLength === 0) {
    errors.push('No data available');
    return { isValid: false, errors };
  }

  if (start < 0) {
    errors.push(`Start index ${start} is negative`);
  }

  if (end >= dataLength) {
    errors.push(`End index ${end} exceeds data length ${dataLength}`);
  }

  if (end < start) {
    errors.push(`End index ${end} is less than start index ${start}`);
  }

  if (end - start + 1 < 1) {
    errors.push('Viewport size is less than 1');
  }

  const isValid = errors.length === 0;

  if (!isValid) {
    // Provide corrected viewport
    let correctedStart = Math.max(0, Math.floor(start));
    let correctedEnd = Math.min(dataLength - 1, Math.ceil(end));

    if (correctedEnd < correctedStart) {
      correctedEnd = Math.min(dataLength - 1, correctedStart + CHART_DATA_POINTS - 1);
    }

    if (correctedEnd >= dataLength) {
      correctedEnd = dataLength - 1;
    }
    if (correctedStart < 0) {
      correctedStart = 0;
    }

    // Ensure at most CHART_DATA_POINTS window when possible
    if (correctedEnd - correctedStart + 1 < 1) {
      correctedEnd = Math.min(dataLength - 1, correctedStart + CHART_DATA_POINTS - 1);
    }

    return {
      isValid: false,
      errors,
      corrected: {
        start: correctedStart,
        end: correctedEnd,
        size: correctedEnd - correctedStart + 1,
      },
    };
  }

  return { isValid: true, errors: [] };
};

/**
 * Calculate buffer range for data loading
 */
export const calculateBufferRange = (
  viewStart: number,
  viewEnd: number,
  dataLength: number
): { start: number; end: number } => {
  const bufferSize = BUFFER_SIZE;
  const marginSize = 2; // MARGIN_SIZE

  const atDataStart = viewStart <= marginSize;
  const atDataEnd = viewEnd >= dataLength - marginSize;

  let actualStart: number, actualEnd: number;

  if (atDataStart && atDataEnd) {
    actualStart = 0;
    actualEnd = dataLength - 1;
  } else if (atDataStart) {
    actualStart = 0;
    actualEnd = Math.min(dataLength - 1, Math.ceil(viewEnd) + bufferSize);
  } else if (atDataEnd) {
    actualStart = Math.max(0, Math.floor(viewStart) - bufferSize);
    actualEnd = dataLength - 1;
  } else {
    actualStart = Math.max(0, Math.floor(viewStart) - bufferSize);
    actualEnd = Math.min(dataLength - 1, Math.ceil(viewEnd) + bufferSize);
  }

  return { start: actualStart, end: actualEnd };
};

/**
 * Calculate pruning range for data cleanup
 */
export const calculatePruningRange = (
  viewStart: number,
  viewEnd: number,
  dataLength: number
): { start: number; end: number } | null => {
  const bufferSize = BUFFER_SIZE;
  const desiredWindow = Math.min(dataLength, bufferSize * 2);

  const keepStart = Math.max(0, Math.min(viewStart, dataLength - desiredWindow));
  const preliminaryEnd = Math.min(dataLength - 1, Math.max(viewEnd, desiredWindow - 1));
  const keepEnd = Math.min(preliminaryEnd, keepStart + desiredWindow - 1);

  const leftExcess = keepStart;
  const rightExcess = dataLength - 1 - keepEnd;

  // Only prune if we exceed the allowed window
  const shouldPrune = dataLength > desiredWindow && (leftExcess > 0 || rightExcess > 0);

  if (!shouldPrune) {
    return null;
  }

  return { start: keepStart, end: keepEnd };
};

/**
 * Calculate viewport shift for data loading operations
 */
export const calculateDataShift = (
  direction: 'past' | 'future',
  fetchPoints: number,
  mergedDataLength: number,
  prunedDataLength: number
): number => {
  if (direction === 'past') {
    // When loading past data, the shift should be based on the actual new data fetched
    return fetchPoints;
  } else if (direction === 'future') {
    // When loading future data, check if we pruned data from the left
    const prunedFromLeft = mergedDataLength - prunedDataLength;
    return -prunedFromLeft; // Negative shift if we removed data from left
  }

  return 0;
};
