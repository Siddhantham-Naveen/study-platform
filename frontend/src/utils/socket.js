import { io } from 'socket.io-client';
import { auth } from './firebase';

let socket = null;

export const connectSocket = async (token) => {
  if (socket) socket.disconnect();

  const serverURL = process.env.REACT_APP_BACKEND_URL || window.location.origin;

  socket = io(serverURL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
    timeout: 20000
  });

  socket.on('connect', () => console.log('🔌 Socket connected:', socket.id));
  socket.on('disconnect', (reason) => console.log('🔌 Disconnected:', reason));

  // On reconnect, refresh token and re-authenticate
  socket.on('reconnect', async () => {
    if (auth.currentUser) {
      const newToken = await auth.currentUser.getIdToken(true);
      socket.auth.token = newToken;
      localStorage.setItem('token', newToken);
      console.log('🔄 Token refreshed on reconnect');
    }
  });

  socket.on('connect_error', async (error) => {
    console.error('Socket error:', error.message);
    // If auth error, try refreshing token
    if (error.message.includes('auth') && auth.currentUser) {
      const newToken = await auth.currentUser.getIdToken(true);
      socket.auth.token = newToken;
      localStorage.setItem('token', newToken);
    }
  });

  return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
  if (socket) { socket.disconnect(); socket = null; }
};
