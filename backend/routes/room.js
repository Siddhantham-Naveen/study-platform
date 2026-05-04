const express = require('express');
const router = express.Router();
const Room = require('../models/Room');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

const getOrCreateUser = async (req) => {
  try {
    // Try to find by uid first
    let user = await User.findOne({ uid: req.user.uid });
    if (user) return user;

    // Try to find by email (old users)
    if (req.user.email) {
      user = await User.findOne({ email: req.user.email });
      if (user) {
        // Update old user with Firebase uid
        user.uid = req.user.uid;
        await user.save();
        return user;
      }
    }

    // Create new user
    user = new User({
      uid: req.user.uid,
      username: req.user.username,
      email: req.user.email || ''
    });
    await user.save();
    return user;

  } catch (err) {
    console.error('getOrCreateUser error:', err.message);
    // If duplicate key error, try finding existing user
    if (err.code === 11000) {
      const user = await User.findOne({ 
        $or: [{ uid: req.user.uid }, { email: req.user.email }] 
      });
      if (user) {
        if (!user.uid) { user.uid = req.user.uid; await user.save(); }
        return user;
      }
    }
    throw err;
  }
};

const generateRoomCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
};

router.post('/create', authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'Room name is required.' });

    await getOrCreateUser(req);

    let roomCode, isUnique = false;
    while (!isUnique) {
      roomCode = generateRoomCode();
      const existing = await Room.findOne({ roomCode });
      if (!existing) isUnique = true;
    }

    const room = new Room({ name, roomCode, createdBy: req.user.uid });
    await room.save();

    res.status(201).json({
      message: 'Room created!',
      room: { id: room._id, name: room.name, roomCode: room.roomCode, timerState: room.timerState }
    });
  } catch (error) {
    console.error('Create room error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

router.post('/join', authMiddleware, async (req, res) => {
  try {
    const { roomCode } = req.body;
    if (!roomCode) return res.status(400).json({ message: 'Room code is required.' });

    await getOrCreateUser(req);

    const room = await Room.findOne({ roomCode: roomCode.toUpperCase(), isActive: true });
    if (!room) return res.status(404).json({ message: 'Room not found. Check the code and try again.' });

    res.json({
      message: 'Room found!',
      room: { id: room._id, name: room.name, roomCode: room.roomCode, timerState: room.timerState }
    });
  } catch (error) {
    console.error('Join room error:', error);
    res.status(500).json({ message: 'Server error joining room.' });
  }
});

router.get('/:roomCode', authMiddleware, async (req, res) => {
  try {
    const room = await Room.findOne({ roomCode: req.params.roomCode.toUpperCase(), isActive: true });
    if (!room) return res.status(404).json({ message: 'Room not found.' });
    res.json({ room });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
