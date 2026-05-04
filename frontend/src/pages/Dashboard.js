import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRoom, joinRoom, getStats } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { connectSocket } from '../utils/socket';
import './Dashboard.css';

const formatTime = (seconds) => {
  if (!seconds) return '0 min';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs === 0) return `${mins} min`;
  return `${hrs}h ${mins}m`;
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, token, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('create');
  const [roomName, setRoomName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    if (token) {
      connectSocket(token);
      loadStats();
    }
  }, [token]);

  const loadStats = async () => {
    try {
      setStatsLoading(true);
      const data = await getStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
      // Set default stats if API fails
      setStats({ totalStudyTime: 0, dailyTime: 0, weeklyTime: 0, totalSessions: 0, dailyBreakdown: [] });
    } finally {
      setStatsLoading(false);
    }
  };

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!roomName.trim()) return setError('Please enter a room name.');
    setIsLoading(true); setError('');
    try {
      const data = await createRoom(roomName);
      navigate(`/room/${data.room.roomCode}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create room.');
    } finally { setIsLoading(false); }
  };

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    if (!roomCode.trim()) return setError('Please enter a room code.');
    setIsLoading(true); setError('');
    try {
      const data = await joinRoom(roomCode.toUpperCase());
      navigate(`/room/${data.room.roomCode}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Room not found.');
    } finally { setIsLoading(false); }
  };

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-brand"><span>📖</span><span className="brand-name">StudySync</span></div>
        <div className="header-right">
          <span className="header-username">
            {user?.photoURL && <img src={user.photoURL} alt="" style={{width:28,height:28,borderRadius:'50%',marginRight:8,verticalAlign:'middle'}}/>}
            👋 {user?.username}
          </span>
          <button className="btn btn-secondary btn-sm" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <main className="dashboard-main">
        <div className="dashboard-welcome fade-in">
          <h2>Good to have you, <span>{user?.username}</span></h2>
          <p>Ready to focus? Create or join a room to get started.</p>
        </div>

        <div className="dashboard-grid">
          {/* Room Panel */}
          <div className="card room-panel fade-in">
            <div className="tab-switcher">
              <button className={`tab ${activeTab === 'create' ? 'active' : ''}`}
                onClick={() => { setActiveTab('create'); setError(''); }}>✨ Create Room</button>
              <button className={`tab ${activeTab === 'join' ? 'active' : ''}`}
                onClick={() => { setActiveTab('join'); setError(''); }}>🔗 Join Room</button>
            </div>

            {error && <div className="error-msg" style={{margin:'16px'}}>{error}</div>}

            {activeTab === 'create' && (
              <form onSubmit={handleCreateRoom} className="room-form">
                <div className="form-group">
                  <label>Room Name</label>
                  <input type="text" value={roomName} onChange={(e) => setRoomName(e.target.value)}
                    placeholder="e.g., Chemistry Finals Study Group" maxLength={50} autoFocus />
                </div>
                <p className="form-hint">A 6-character code will be generated for others to join.</p>
                <button type="submit" className="btn btn-primary btn-full" disabled={isLoading}>
                  {isLoading ? 'Creating...' : 'Create Room →'}
                </button>
              </form>
            )}

            {activeTab === 'join' && (
              <form onSubmit={handleJoinRoom} className="room-form">
                <div className="form-group">
                  <label>Room Code</label>
                  <input type="text" value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    placeholder="Enter 6-character code" maxLength={6}
                    style={{ letterSpacing: '0.2em', fontWeight: '600', fontSize: '18px' }} autoFocus />
                </div>
                <p className="form-hint">Ask your study partner for their room code.</p>
                <button type="submit" className="btn btn-primary btn-full" disabled={isLoading}>
                  {isLoading ? 'Joining...' : 'Join Room →'}
                </button>
              </form>
            )}
          </div>

          {/* Stats Panel */}
          <div className="stats-panel fade-in">
            <div className="card stat-card">
              <div className="stat-icon">⏱️</div>
              <div className="stat-info">
                <div className="stat-value">{statsLoading ? '...' : formatTime(stats?.totalStudyTime)}</div>
                <div className="stat-label">Total Study Time</div>
              </div>
            </div>
            <div className="card stat-card">
              <div className="stat-icon">📅</div>
              <div className="stat-info">
                <div className="stat-value">{statsLoading ? '...' : formatTime(stats?.dailyTime)}</div>
                <div className="stat-label">Today</div>
              </div>
            </div>
            <div className="card stat-card">
              <div className="stat-icon">📆</div>
              <div className="stat-info">
                <div className="stat-value">{statsLoading ? '...' : formatTime(stats?.weeklyTime)}</div>
                <div className="stat-label">This Week</div>
              </div>
            </div>
            <div className="card stat-card">
              <div className="stat-icon">🎯</div>
              <div className="stat-info">
                <div className="stat-value">{statsLoading ? '...' : (stats?.totalSessions || 0)}</div>
                <div className="stat-label">Sessions Completed</div>
              </div>
            </div>

            {/* Weekly Chart */}
            {stats?.dailyBreakdown && stats.dailyBreakdown.length > 0 && (
              <div className="card weekly-chart">
                <h3>Weekly Activity</h3>
                <div className="bar-chart">
                  {stats.dailyBreakdown.map((day, i) => {
                    const maxMins = Math.max(...stats.dailyBreakdown.map(d => d.minutes), 1);
                    const height = Math.max((day.minutes / maxMins) * 100, 4);
                    return (
                      <div key={i} className="bar-item">
                        <div className="bar-track">
                          <div className="bar-fill" style={{ height: `${height}%` }} title={`${day.minutes} min`} />
                        </div>
                        <div className="bar-label">{day.day}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
