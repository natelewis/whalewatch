import axios from 'axios';
import {
  AlpacaAccount,
  AlpacaPosition,
  AlpacaActivity,
  AlpacaBar,
  AlpacaOptionsTrade,
  AlpacaOptionsContract,
  CreateOrderRequest,
  ChartDataResponse,
  DEFAULT_CHART_DATA_POINTS,
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Helper function to get interval in milliseconds
function getIntervalMs(interval: string): number {
  const intervalMap: { [key: string]: number } = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '2h': 2 * 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
    '1w': 7 * 24 * 60 * 60 * 1000,
    '1M': 30 * 24 * 60 * 60 * 1000,
  };

  return intervalMap[interval] || 60 * 60 * 1000; // Default to 1 hour
}

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests for the default api instance
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Create a function that can be called with a token getter
export const createApiService = (getToken: () => Promise<string | null>) => {
  // Add token to requests
  api.interceptors.request.use(async (config) => {
    const token = await getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  return {
    // Account endpoints
    async getAccount(): Promise<{ account: AlpacaAccount }> {
      const response = await api.get('/api/account/info');
      return response.data;
    },

    async getPositions(): Promise<{ positions: AlpacaPosition[] }> {
      const response = await api.get('/api/account/positions');
      return response.data;
    },

    async getActivities(
      startDate?: string,
      endDate?: string
    ): Promise<{ activities: AlpacaActivity[] }> {
      const params = new URLSearchParams();
      if (startDate) {
        params.append('start_date', startDate);
      }
      if (endDate) {
        params.append('end_date', endDate);
      }

      const response = await api.get(`/api/account/activity?${params.toString()}`);
      return response.data;
    },

    // Chart endpoints
    async getChartData(
      symbol: string,
      interval: string = '1h',
      dataPoints: number = DEFAULT_CHART_DATA_POINTS,
      startTime?: string,
      endTime?: string,
      bufferPoints?: number,
      viewBasedLoading?: boolean,
      viewSize?: number
    ): Promise<ChartDataResponse> {
      const params: Record<string, string> = {
        interval,
        data_points: dataPoints.toString(),
      };

      if (startTime) {
        params.start_time = startTime;
      } else {
        // Calculate start time based on interval and data points
        const intervalMs = getIntervalMs(interval);
        const calculatedStartTime = new Date(
          (endTime ? new Date(endTime).getTime() : Date.now()) - dataPoints * intervalMs
        );
        params.start_time = calculatedStartTime.toISOString();
      }

      if (endTime) {
        params.end_time = endTime;
      } else {
        // Use current time as default end time
        params.end_time = new Date().toISOString();
      }

      if (bufferPoints && bufferPoints > 0) {
        params.buffer_points = bufferPoints.toString();
      }

      if (viewBasedLoading !== undefined) {
        params.view_based_loading = viewBasedLoading.toString();
      }

      if (viewSize && viewSize > 0) {
        params.view_size = viewSize.toString();
      }

      const response = await api.get(`/api/chart/${symbol}`, { params });
      return response.data;
    },

    // Options endpoints
    async getOptionsTrades(
      symbol: string,
      hours: number = 1
    ): Promise<{ symbol: string; trades: AlpacaOptionsTrade[]; hours: number }> {
      const response = await api.get(`/api/options/${symbol}/recent`, {
        params: { hours },
      });
      return response.data;
    },

    async getOptionsContracts(
      symbol: string,
      limit: number = 1000
    ): Promise<{ symbol: string; contracts: AlpacaOptionsContract[]; total_contracts: number }> {
      const response = await api.get(`/api/options/${symbol}/recent`, {
        params: { limit },
      });
      return response.data;
    },

    // Order endpoints
    async createSellOrder(orderData: CreateOrderRequest): Promise<{ message: string; order: any }> {
      const response = await api.post('/api/orders/sell', orderData);
      return response.data;
    },

    async createBuyOrder(orderData: CreateOrderRequest): Promise<{ message: string; order: any }> {
      const response = await api.post('/api/orders/buy', orderData);
      return response.data;
    },
  };
};

// Default export for backward compatibility (will be replaced by the hook)
export const apiService = {
  // Account endpoints
  async getAccount(): Promise<{ account: AlpacaAccount }> {
    const response = await api.get('/api/account/info');
    return response.data;
  },

  async getPositions(): Promise<{ positions: AlpacaPosition[] }> {
    const response = await api.get('/api/account/positions');
    return response.data;
  },

  async getActivities(
    startDate?: string,
    endDate?: string
  ): Promise<{ activities: AlpacaActivity[] }> {
    const params = new URLSearchParams();
    if (startDate) {
      params.append('start_date', startDate);
    }
    if (endDate) {
      params.append('end_date', endDate);
    }

    const response = await api.get(`/api/account/activity?${params.toString()}`);
    return response.data;
  },

  // Chart endpoints
  async getChartData(
    symbol: string,
    interval: string = '1h',
    dataPoints: number = DEFAULT_CHART_DATA_POINTS,
    startTime?: string,
    endTime?: string,
    bufferPoints?: number,
    viewBasedLoading?: boolean,
    viewSize?: number
  ): Promise<ChartDataResponse> {
    const params: Record<string, string> = {
      interval,
      data_points: dataPoints.toString(),
    };

    if (startTime) {
      params.start_time = startTime;
    } else {
      // Calculate start time based on interval and data points
      const intervalMs = getIntervalMs(interval);
      const calculatedStartTime = new Date(
        (endTime ? new Date(endTime).getTime() : Date.now()) - dataPoints * intervalMs
      );
      params.start_time = calculatedStartTime.toISOString();
    }

    if (endTime) {
      params.end_time = endTime;
    } else {
      // Use current time as default end time
      params.end_time = new Date().toISOString();
    }

    if (bufferPoints && bufferPoints > 0) {
      params.buffer_points = bufferPoints.toString();
    }

    if (viewBasedLoading !== undefined) {
      params.view_based_loading = viewBasedLoading.toString();
    }

    if (viewSize && viewSize > 0) {
      params.view_size = viewSize.toString();
    }

    const response = await api.get(`/api/chart/${symbol}`, { params });
    return response.data;
  },

  // Options endpoints
  async getOptionsTrades(
    symbol: string,
    hours: number = 1
  ): Promise<{ symbol: string; trades: AlpacaOptionsTrade[]; hours: number }> {
    const response = await api.get(`/api/options/${symbol}/recent`, {
      params: { hours },
    });
    return response.data;
  },

  async getOptionsContracts(
    symbol: string,
    limit: number = 1000
  ): Promise<{ symbol: string; contracts: AlpacaOptionsContract[]; total_contracts: number }> {
    const response = await api.get(`/api/options/${symbol}/recent`, {
      params: { limit },
    });
    return response.data;
  },

  // Order endpoints
  async createSellOrder(orderData: CreateOrderRequest): Promise<{ message: string; order: any }> {
    const response = await api.post('/api/orders/sell', orderData);
    return response.data;
  },

  async createBuyOrder(orderData: CreateOrderRequest): Promise<{ message: string; order: any }> {
    const response = await api.post('/api/orders/buy', orderData);
    return response.data;
  },
};
