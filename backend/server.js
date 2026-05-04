const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/room');
const statsRoutes = require('./routes/stats');
const initSocket = require('./socket/socketHandler');

const app = express();
const httpServer = http.createServer(app);

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

// ---- Serve React Frontend Static Files ----
const frontendPath = path.join(__dirname, '../frontend/build');
app.use(express.static(frontendPath));

// ---- API Routes (prefixed with /api to avoid conflicts) ----
app.use('/auth', authRoutes);
app.use('/api/room', roomRoutes);   // API room routes on /api/room
app.use('/stats', statsRoutes);

// ---- Socket.io ----
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});
initSocket(io);

// FIX 1: Catch-all for React Router
// /room/ABC123 → React app (NOT the API)
// The API room routes are on /api/room/*
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/study-platform')
  .then(() => {
    console.log('✅ Connected to MongoDB');
    const PORT = process.env.PORT || 5000;
    httpServer.listen(PORT, () => {
      console.log(`✅ Server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  });
