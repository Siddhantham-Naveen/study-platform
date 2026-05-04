// SetUsername.js - Forces Google login users to set a username
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../utils/firebase';
import { updateProfile } from 'firebase/auth';
import './Auth.css';

const SetUsername = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim()) return setError('Please enter a username.');
    if (username.length < 3) return setError('Username must be at least 3 characters.');
    if (username.length > 20) return setError('Username cannot exceed 20 characters.');
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return setError('Only letters, numbers and underscore allowed.');

    setIsLoading(true);
    try {
      await updateProfile(auth.currentUser, { displayName: username });
      // Force token refresh so new username is in token
      await auth.currentUser.getIdToken(true);
      navigate('/dashboard');
    } catch (err) {
      setError('Failed to set username. Please try again.');
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
          <p>One last step!</p>
        </div>
        <div className="card auth-card">
          <h2>Choose a Username</h2>
          <p className="auth-subtitle">This is how others will see you in study rooms</p>
          {error && <div className="error-msg">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError(''); }}
                placeholder="e.g. StudyChamp123"
                minLength={3}
                maxLength={20}
                required
                autoFocus
              />
              <small style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                3-20 characters, letters and numbers only
              </small>
            </div>
            <button type="submit" className="btn btn-primary btn-full" disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Let\'s Study! →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SetUsername;
