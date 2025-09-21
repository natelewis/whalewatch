import axios from 'axios';
import { API_BASE_URL } from '../constants';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authService = {
  // Verify token endpoint
  async verifyToken() {
    const response = await api.get('/api/auth/verify');
    return response.data;
  },

  // Logout endpoint
  async logout() {
    const response = await api.post('/api/auth/logout');
    return response.data;
  },
};
