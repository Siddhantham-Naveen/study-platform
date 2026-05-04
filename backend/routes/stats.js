const express = require('express');
const router = express.Router();
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

// Get or create user
const getOrCreateUser = async (req) => {
  let user = await User.findOne({ uid: req.user.uid });
  if (!user) {
    user = new User({
      uid: req.user.uid,
      username: req.user.username,
      email: req.user.email || ''
    });
    await user.save();
  }
  return user;
};

// GET /stats
router.get('/', authMiddleware, async (req, res) => {
  try {
    const user = await getOrCreateUser(req);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);

    const dailySessions = user.studySessions.filter(s => new Date(s.date) >= todayStart);
    const weeklySessions = user.studySessions.filter(s => new Date(s.date) >= weekStart);
    const dailyTime = dailySessions.reduce((sum, s) => sum + (s.duration || 0), 0);
    const weeklyTime = weeklySessions.reduce((sum, s) => sum + (s.duration || 0), 0);

    // Build 7-day breakdown
    const dailyBreakdown = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(todayStart);
      dayStart.setDate(dayStart.getDate() - i);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const dayTime = user.studySessions
        .filter(s => { const d = new Date(s.date); return d >= dayStart && d < dayEnd; })
        .reduce((sum, s) => sum + (s.duration || 0), 0);
      const label = dayStart.toLocaleDateString('en-US', { weekday: 'short' });
      dailyBreakdown.push({ day: label, seconds: dayTime, minutes: Math.floor(dayTime / 60) });
    }

    res.json({
      totalStudyTime: user.totalStudyTime || 0,
      dailyTime,
      weeklyTime,
      totalSessions: user.studySessions.length,
      dailyBreakdown
    });
  } catch (error) {
    console.error('Stats error:', error);
    // Return zeros instead of error so dashboard shows 0 instead of crashing
    res.json({
      totalStudyTime: 0,
      dailyTime: 0,
      weeklyTime: 0,
      totalSessions: 0,
      dailyBreakdown: Array(7).fill(0).map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return { day: d.toLocaleDateString('en-US', { weekday: 'short' }), seconds: 0, minutes: 0 };
      })
    });
  }
});

// POST /stats/session
router.post('/session', authMiddleware, async (req, res) => {
  try {
    const { duration, roomId } = req.body;
    if (!duration || duration <= 0) return res.status(400).json({ message: 'Invalid duration.' });

    const user = await getOrCreateUser(req);
    await User.findByIdAndUpdate(user._id, {
      $push: { studySessions: { date: new Date(), duration, roomId: roomId || null } },
      $inc: { totalStudyTime: duration }
    });

    res.json({ message: 'Session saved!' });
  } catch (error) {
    console.error('Save session error:', error);
    res.status(500).json({ message: 'Error saving session.' });
  }
});

module.exports = router;
