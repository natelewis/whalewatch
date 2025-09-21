import axios from 'axios';
import { API_BASE_URL } from '../constants';
import {
  AlpacaAccount,
  AlpacaPosition,
  AlpacaActivity,
  AlpacaOptionsTrade,
  AlpacaOptionsContract,
  CreateOrderRequest,
  CreateOrderResponse,
  ChartDataResponse,
} from '../types';

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
      limit?: number,
      startTime?: string,
      direction: 'past' | 'future' = 'past',
      viewBasedLoading?: boolean,
      viewSize?: number
    ): Promise<ChartDataResponse> {
      const params: Record<string, string> = {
        interval,
        direction,
      };

      if (limit !== undefined) {
        params.limit = limit.toString();
      }

      if (startTime) {
        params.start_time = startTime;
      }
      // If no startTime provided, API will use current time as default

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
    async createSellOrder(
      orderData: CreateOrderRequest
    ): Promise<{ message: string; order: CreateOrderResponse }> {
      const response = await api.post('/api/orders/sell', orderData);
      return response.data;
    },

    async createBuyOrder(
      orderData: CreateOrderRequest
    ): Promise<{ message: string; order: CreateOrderResponse }> {
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
    limit?: number,
    startTime?: string,
    direction: 'past' | 'future' = 'past',
    viewBasedLoading?: boolean,
    viewSize?: number
  ): Promise<ChartDataResponse> {
    const params: Record<string, string> = {
      interval,
      direction,
    };

    if (limit !== undefined) {
      params.limit = limit.toString();
    }

    if (startTime) {
      params.start_time = startTime;
    }
    // If no startTime provided, API will use current time as default

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
  async createSellOrder(
    orderData: CreateOrderRequest
  ): Promise<{ message: string; order: CreateOrderResponse }> {
    const response = await api.post('/api/orders/sell', orderData);
    return response.data;
  },

  async createBuyOrder(
    orderData: CreateOrderRequest
  ): Promise<{ message: string; order: CreateOrderResponse }> {
    const response = await api.post('/api/orders/buy', orderData);
    return response.data;
  },
};
