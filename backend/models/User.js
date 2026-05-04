const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true },
  username: { type: String, required: true, trim: true },
  email: { type: String, lowercase: true, trim: true, sparse: true },
  totalStudyTime: { type: Number, default: 0 },
  studySessions: [{
    date: { type: Date, default: Date.now },
    duration: Number,
    roomId: String
  }],
  createdAt: { type: Date, default: Date.now }
});

// Remove unique constraint on email - only uid must be unique
userSchema.index({ email: 1 }, { unique: false, sparse: true });

module.exports = mongoose.model('User', userSchema);
