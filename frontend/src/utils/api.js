import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_BACKEND_URL || '',
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.request.use(async (config) => {
  let token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auth
export const signup = async (username, email, password) => {
  const response = await api.post('/auth/signup', { username, email, password });
  return response.data;
};

export const login = async (email, password) => {
  const response = await api.post('/auth/login', { email, password });
  return response.data;
};

// Room - use /api/room to avoid conflict with React Router /room/:code
export const createRoom = async (name) => {
  const response = await api.post('/api/room/create', { name });
  return response.data;
};

export const joinRoom = async (roomCode) => {
  const response = await api.post('/api/room/join', { roomCode });
  return response.data;
};

// Stats
export const getStats = async () => {
  const response = await api.get('/stats');
  return response.data;
};

export const saveSession = async (duration, roomId) => {
  const response = await api.post('/stats/session', { duration, roomId });
  return response.data;
};

export default api;
