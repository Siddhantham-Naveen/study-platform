const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 50 },
  roomCode: { type: String, required: true, unique: true, uppercase: true },
  createdBy: { type: String, required: true }, // Firebase UID (string, not ObjectId)
  isActive: { type: Boolean, default: true },
  timerState: {
    isRunning: { type: Boolean, default: false },
    mode: { type: String, enum: ['study', 'break'], default: 'study' },
    timeLeft: { type: Number, default: 25 * 60 },
    startedAt: { type: Date, default: null }
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Room', roomSchema);
