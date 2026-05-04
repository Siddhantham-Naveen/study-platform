import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { resetPassword } from '../utils/firebase';
import './Auth.css';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) return setError('Please enter your email.');

    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      // Firebase automatically sends a professional reset email to ANY email!
      await resetPassword(email);
      setSuccess(`Password reset email sent to ${email}! Check your inbox and spam folder.`);
    } catch (err) {
      const errorMessages = {
        'auth/user-not-found': 'No account found with this email.',
        'auth/invalid-email': 'Please enter a valid email address.',
        'auth/too-many-requests': 'Too many requests. Please try again later.'
      };
      setError(errorMessages[err.code] || 'Failed to send reset email. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container fade-in">
        <div className="auth-logo">
          <span className="logo-icon">📖</span>
          <h1>StudySync</h1>
          <p>Reset your password</p>
        </div>

        <div className="card auth-card">
          <h2>Forgot Password</h2>
          <p className="auth-subtitle">
            Enter your email and we'll send you a reset link
          </p>

          {error && <div className="error-msg">{error}</div>}
          {success && (
            <div className="success-msg">
              ✅ {success}
              <br />
              <small>Click the link in the email to reset your password.</small>
            </div>
          )}

          {!success && (
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  placeholder="your@email.com"
                  required
                  autoFocus
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary btn-full"
                disabled={isLoading}
              >
                {isLoading ? 'Sending...' : 'Send Reset Email →'}
              </button>
            </form>
          )}

          {success && (
            <Link to="/login" className="btn btn-primary btn-full" style={{ marginTop: '16px', textAlign: 'center', textDecoration: 'none' }}>
              Back to Login →
            </Link>
          )}

          <p className="auth-link">
            Remember your password? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
