// ============================================
// routes/auth.js - Production email with Resend
// Resend: Free 3000 emails/month, works for any user
// ============================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// ---- Helper: Send Email via Resend API ----
const sendEmail = async (to, subject, html) => {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'StudySync <onboarding@resend.dev>', // Works without domain verification
        to: [to],
        subject,
        html
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message);
    console.log('Email sent to:', to);
    return true;
  } catch (err) {
    console.error('Email error:', err.message);
    return false;
  }
};

// ---- Helper: Create JWT Token ----
const createToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// ---- Welcome Email Template ----
const welcomeEmail = (username, appUrl) => `
<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #0f1117; color: #e8dcc8; padding: 40px; border-radius: 16px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <span style="font-size: 48px;">📖</span>
    <h1 style="color: #f0a500; font-size: 28px; margin: 8px 0;">StudySync</h1>
  </div>
  <h2 style="color: #e8dcc8;">Welcome, ${username}! 🎓</h2>
  <p style="color: #9aa5b4; line-height: 1.6;">Your account is ready. Start studying smarter with:</p>
  <ul style="color: #9aa5b4; line-height: 2;">
    <li>⏱️ Synchronized Pomodoro timer</li>
    <li>💬 Real-time group chat</li>
    <li>📹 Video calls</li>
    <li>🏆 Study leaderboard</li>
  </ul>
  <div style="text-align: center; margin: 32px 0;">
    <a href="${appUrl}" style="background: #f0a500; color: #0f1117; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">Start Studying →</a>
  </div>
  <p style="color: #5c6775; font-size: 13px; text-align: center;">StudySync — Focus together, achieve more</p>
</div>`;

// ---- OTP Email Template ----
const otpEmail = (otp) => `
<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #0f1117; color: #e8dcc8; padding: 40px; border-radius: 16px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <span style="font-size: 48px;">🔐</span>
    <h1 style="color: #f0a500; font-size: 28px; margin: 8px 0;">StudySync</h1>
  </div>
  <h2>Password Reset OTP</h2>
  <p style="color: #9aa5b4;">Use the code below to reset your password. It expires in <strong style="color: #f0a500;">10 minutes</strong>.</p>
  <div style="background: #1e2433; border: 2px solid #f0a500; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
    <h1 style="color: #f0a500; font-size: 48px; letter-spacing: 12px; margin: 0;">${otp}</h1>
  </div>
  <p style="color: #5c6775; font-size: 13px;">If you didn't request this, you can safely ignore this email.</p>
</div>`;

// ============================================
// POST /auth/signup
// ============================================
router.post('/signup', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password)
      return res.status(400).json({ message: 'All fields are required.' });
    if (username.length < 3 || username.length > 20)
      return res.status(400).json({ message: 'Username must be 3-20 characters.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ message: 'Please enter a valid email address.' });
    if (password.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });

    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingEmail) return res.status(400).json({ message: 'Email already registered.' });

    const existingUsername = await User.findOne({ username });
    if (existingUsername) return res.status(400).json({ message: 'Username already taken.' });

    const user = new User({ username, email: email.toLowerCase(), password });
    await user.save();

    // Send welcome email (don't block signup if email fails)
    const appUrl = process.env.CLIENT_URL || 'https://study-platform-backend-cgo1.onrender.com';
    sendEmail(email, 'Welcome to StudySync! 📖', welcomeEmail(username, appUrl));

    const token = createToken(user._id);
    res.status(201).json({
      message: 'Account created successfully!',
      token,
      user: { id: user._id, username: user.username, email: user.email, totalStudyTime: user.totalStudyTime }
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Server error during signup.' });
  }
});

// ============================================
// POST /auth/login
// ============================================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: 'Email and password are required.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ message: 'Please enter a valid email address.' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ message: 'No account found with this email.' });

    const isPasswordCorrect = await user.comparePassword(password);
    if (!isPasswordCorrect) return res.status(401).json({ message: 'Incorrect password. Please try again.' });

    const token = createToken(user._id);
    res.json({
      message: 'Login successful!',
      token,
      user: { id: user._id, username: user.username, email: user.email, totalStudyTime: user.totalStudyTime }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login.' });
  }
});

// ============================================
// POST /auth/forgot-password
// ============================================
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required.' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ message: 'No account found with this email.' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetOTP = otp;
    user.resetOTPExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    const emailSent = await sendEmail(email, 'StudySync Password Reset OTP 🔐', otpEmail(otp));
    if (!emailSent) return res.status(500).json({ message: 'Failed to send OTP. Please try again.' });

    res.json({ message: 'OTP sent to your email!' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ============================================
// POST /auth/reset-password
// ============================================
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword)
      return res.status(400).json({ message: 'All fields are required.' });
    if (newPassword.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (!user.resetOTP || user.resetOTP !== otp)
      return res.status(400).json({ message: 'Invalid OTP.' });
    if (new Date() > user.resetOTPExpiry)
      return res.status(400).json({ message: 'OTP expired. Please request a new one.' });

    user.password = newPassword;
    user.resetOTP = undefined;
    user.resetOTPExpiry = undefined;
    await user.save();

    res.json({ message: 'Password reset successfully! You can now login.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
