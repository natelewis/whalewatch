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
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);

      const response = await api.get(`/api/account/activity?${params.toString()}`);
      return response.data;
    },

    // Chart endpoints
    async getChartData(
      symbol: string,
      timeframe: string = '1D',
      limit: number = 1000
    ): Promise<ChartDataResponse> {
      const response = await api.get(`/api/chart/${symbol}`, {
        params: { timeframe, limit },
      });
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
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);

    const response = await api.get(`/api/account/activity?${params.toString()}`);
    return response.data;
  },

  // Chart endpoints
  async getChartData(
    symbol: string,
    timeframe: string = '1D',
    limit: number = 1000
  ): Promise<ChartDataResponse> {
    const response = await api.get(`/api/chart/${symbol}`, {
      params: { timeframe, limit },
    });
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
