import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add token to requests
api.interceptors.request.use((config) => {
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
  }
};