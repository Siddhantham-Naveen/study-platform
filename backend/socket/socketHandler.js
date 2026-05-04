const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Room = require('../models/Room');

const activeRooms = new Map();

const getRoom = (roomCode) => {
  if (!activeRooms.has(roomCode)) {
    activeRooms.set(roomCode, {
      users: [],
      timerState: { isRunning: false, mode: 'study', timeLeft: 25 * 60, startedAt: null },
      timerInterval: null,
      studyDuration: 25 * 60,
      breakDuration: 5 * 60
    });
  }
  return activeRooms.get(roomCode);
};

const getLeaderboard = (room) => {
  return [...room.users]
    .sort((a, b) => b.studyTime - a.studyTime)
    .map((u, index) => ({ rank: index + 1, username: u.username, studyTime: u.studyTime, socketId: u.socketId }));
};

const initSocket = (io) => {

  // ---- Firebase Token Authentication ----
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('No token'));

      // Decode Firebase token (contains uid, email, name)
      const decoded = jwt.decode(token);
      if (!decoded) return next(new Error('Invalid token'));

      socket.user = {
        uid: decoded.uid || decoded.sub,
        email: decoded.email,
        username: decoded.name || decoded.email?.split('@')[0] || 'User'
      };

      // Get or create user in MongoDB
      let user = await User.findOne({ uid: socket.user.uid });
      if (!user) {
        user = new User({ uid: socket.user.uid, username: socket.user.username, email: socket.user.email });
        await user.save();
      }
      socket.user.studyTime = user.totalStudyTime || 0;
      socket.user.mongoId = user._id;

      next();
    } catch (err) {
      next(new Error('Auth error: ' + err.message));
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Connected: ${socket.user.username}`);

    socket.on('join-room', async ({ roomCode }) => {
      try {
        const roomDoc = await Room.findOne({ roomCode: roomCode.toUpperCase(), isActive: true });
        if (!roomDoc) { socket.emit('error', { message: 'Room not found' }); return; }

        if (socket.currentRoom) leaveRoom(socket, io);

        // FIX 3: Check max users per room
        const room_check = getRoom(roomCode.toUpperCase());
        if (room_check.users.length >= MAX_USERS_PER_ROOM) {
          socket.emit('error', { message: `Room is full (max ${MAX_USERS_PER_ROOM} users)` });
          return;
        }

        socket.join(roomCode);
        socket.currentRoom = roomCode;

        const room = getRoom(roomCode);
        const existingIndex = room.users.findIndex(u => u.uid === socket.user.uid);

        if (existingIndex === -1) {
          room.users.push({ socketId: socket.id, uid: socket.user.uid, username: socket.user.username, studyTime: socket.user.studyTime || 0, videoOn: false, audioOn: false });
        } else {
          room.users[existingIndex].socketId = socket.id;
        }

        socket.emit('room-state', {
          timerState: room.timerState,
          users: room.users.map(u => ({ username: u.username, studyTime: u.studyTime, socketId: u.socketId, videoOn: u.videoOn, audioOn: u.audioOn })),
          leaderboard: getLeaderboard(room)
        });

        io.to(roomCode).emit('user-joined', {
          username: socket.user.username,
          socketId: socket.id,
          users: room.users.map(u => ({ username: u.username, studyTime: u.studyTime, socketId: u.socketId, videoOn: u.videoOn, audioOn: u.audioOn })),
          leaderboard: getLeaderboard(room)
        });

      } catch (err) { console.error('join-room error:', err); socket.emit('error', { message: 'Failed to join room' }); }
    });

    socket.on('send-message', ({ roomCode, message }) => {
      if (!message?.trim() || !socket.currentRoom) return;
      io.to(roomCode).emit('new-message', { username: socket.user.username, message: message.trim(), timestamp: new Date().toISOString() });
    });

    socket.on('timer-set-duration', ({ roomCode, studyMinutes, breakMinutes }) => {
      if (!socket.currentRoom) return;
      const room = getRoom(roomCode);
      if (room.timerInterval) { clearInterval(room.timerInterval); room.timerInterval = null; }
      room.studyDuration = studyMinutes * 60;
      room.breakDuration = breakMinutes * 60;
      room.timerState = { isRunning: false, mode: 'study', timeLeft: studyMinutes * 60, startedAt: null, studyMinutes, breakMinutes };
      io.to(roomCode).emit('timer-update', room.timerState);
    });

    socket.on('timer-start', ({ roomCode }) => {
      if (!socket.currentRoom) return;
      const room = getRoom(roomCode);
      if (room.timerState.isRunning) return;
      const studyDuration = room.studyDuration || 25 * 60;
      const breakDuration = room.breakDuration || 5 * 60;
      room.timerState.isRunning = true;
      room.timerState.startedAt = Date.now();
      if (room.timerInterval) clearInterval(room.timerInterval);
      room.elapsedStudySeconds = 0;

      room.timerInterval = setInterval(async () => {
        if (room.timerState.timeLeft <= 0) {
          clearInterval(room.timerInterval); room.timerInterval = null;
          const wasStudying = room.timerState.mode === 'study';
          const completedDuration = wasStudying ? studyDuration : breakDuration;
          room.timerState = { isRunning: false, mode: wasStudying ? 'break' : 'study', timeLeft: wasStudying ? breakDuration : studyDuration, startedAt: null };
          io.to(roomCode).emit('timer-update', room.timerState);
          io.to(roomCode).emit('timer-finished', { message: wasStudying ? `🎉 ${Math.floor(completedDuration/60)} min study complete! Take a break.` : '📚 Break over! Back to studying.' });
          if (wasStudying) {
            room.users.forEach(async (u) => {
              u.studyTime += completedDuration;
              try {
                await User.findOneAndUpdate({ uid: u.uid }, { $inc: { totalStudyTime: completedDuration }, $push: { studySessions: { date: new Date(), duration: completedDuration, roomId: roomCode } } });
              } catch (e) { console.error(e); }
            });
            setTimeout(() => { io.to(roomCode).emit('leaderboard-update', getLeaderboard(room)); }, 300);
          }
          return;
        }
        room.timerState.timeLeft -= 1;
        if (room.timerState.mode === 'study') {
          room.elapsedStudySeconds = (room.elapsedStudySeconds || 0) + 1;
          // FIX 2: Update leaderboard every 30 seconds for live score
          if (room.elapsedStudySeconds % 30 === 0) {
            room.users.forEach(u => { u.studyTime += 30; });
            io.to(roomCode).emit('leaderboard-update', getLeaderboard(room));
          }
        }
        io.to(roomCode).emit('timer-update', { ...room.timerState });
      }, 1000);

      io.to(roomCode).emit('timer-update', room.timerState);
    });

    socket.on('timer-pause', ({ roomCode }) => {
      if (!socket.currentRoom) return;
      const room = getRoom(roomCode);
      if (!room.timerState.isRunning) return;
      clearInterval(room.timerInterval); room.timerInterval = null;
      room.timerState.isRunning = false;
      io.to(roomCode).emit('timer-update', room.timerState);
    });

    socket.on('timer-reset', ({ roomCode }) => {
      if (!socket.currentRoom) return;
      const room = getRoom(roomCode);
      if (room.timerInterval) { clearInterval(room.timerInterval); room.timerInterval = null; }
      room.timerState = { isRunning: false, mode: 'study', timeLeft: room.studyDuration || 25 * 60, startedAt: null };
      io.to(roomCode).emit('timer-update', room.timerState);
    });

    // WebRTC Video
    socket.on('video-join', ({ roomCode }) => {
      const room = getRoom(roomCode);
      const user = room.users.find(u => u.socketId === socket.id);
      if (user) user.videoOn = true;
      socket.to(roomCode).emit('video-user-joined', { socketId: socket.id, username: socket.user.username });
    });

    socket.on('video-leave', ({ roomCode }) => {
      const room = getRoom(roomCode);
      const user = room.users.find(u => u.socketId === socket.id);
      if (user) { user.videoOn = false; user.audioOn = false; }
      socket.to(roomCode).emit('video-user-left', { socketId: socket.id, username: socket.user.username });
    });

    socket.on('webrtc-offer', ({ targetSocketId, offer, roomCode }) => {
      io.to(targetSocketId).emit('webrtc-offer', { offer, fromSocketId: socket.id, fromUsername: socket.user.username });
    });

    socket.on('webrtc-answer', ({ targetSocketId, answer }) => {
      io.to(targetSocketId).emit('webrtc-answer', { answer, fromSocketId: socket.id });
    });

    socket.on('webrtc-ice-candidate', ({ targetSocketId, candidate }) => {
      io.to(targetSocketId).emit('webrtc-ice-candidate', { candidate, fromSocketId: socket.id });
    });

    socket.on('media-state-change', ({ roomCode, videoOn, audioOn }) => {
      const room = getRoom(roomCode);
      const user = room.users.find(u => u.socketId === socket.id);
      if (user) { user.videoOn = videoOn; user.audioOn = audioOn; }
      io.to(roomCode).emit('peer-media-state', { socketId: socket.id, username: socket.user.username, videoOn, audioOn });
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Disconnected: ${socket.user.username}`);
      if (socket.currentRoom) {
        socket.to(socket.currentRoom).emit('video-user-left', { socketId: socket.id, username: socket.user.username });
        leaveRoom(socket, io);
      }
    });
  });
};

const leaveRoom = (socket, io) => {
  const roomCode = socket.currentRoom;
  const room = activeRooms.get(roomCode);
  if (!room) return;
  room.users = room.users.filter(u => u.socketId !== socket.id);
  socket.leave(roomCode);
  socket.currentRoom = null;
  io.to(roomCode).emit('user-left', {
    username: socket.user.username,
    users: room.users.map(u => ({ username: u.username, studyTime: u.studyTime, socketId: u.socketId, videoOn: u.videoOn, audioOn: u.audioOn })),
    leaderboard: getLeaderboard(room)
  });
  if (room.users.length === 0) {
    if (room.timerInterval) clearInterval(room.timerInterval);
    activeRooms.delete(roomCode);
  }
};

module.exports = initSocket;
// Auto-cleanup stale rooms every 30 minutes
setInterval(() => {
  for (const [roomCode, room] of activeRooms.entries()) {
    if (room.users.length === 0) {
      if (room.timerInterval) clearInterval(room.timerInterval);
      activeRooms.delete(roomCode);
    }
  }
}, 30 * 60 * 1000);

// FIX 3: Handle multiple users - prevent room overflow
const MAX_USERS_PER_ROOM = 20;
