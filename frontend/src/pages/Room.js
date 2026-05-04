import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getSocket, connectSocket } from '../utils/socket';
import { auth } from '../utils/firebase';
import VideoCall from '../components/VideoCall';
import './Room.css';

const formatTimer = (seconds) => {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

const formatStudyTime = (seconds) => {
  if (!seconds) return '0m';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
};

const Room = () => {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();

  const [timerState, setTimerState] = useState({ isRunning: false, mode: 'study', timeLeft: 25 * 60 });
  const [users, setUsers] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [showVideoCall, setShowVideoCall] = useState(false);
  const [showTimerSettings, setShowTimerSettings] = useState(false);
  const [customStudy, setCustomStudy] = useState(25);
  const [customBreak, setCustomBreak] = useState(5);
  const [socketReady, setSocketReady] = useState(false);

  const chatEndRef = useRef(null);
  const notifTimeoutRef = useRef({});
  const socketRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // FIX 1: Wait for Firebase token, then connect socket and join room
  useEffect(() => {
    const initRoom = async () => {
      try {
        // Get fresh token - handles page refresh case
        let currentToken = token;
        if (!currentToken && auth.currentUser) {
          currentToken = await auth.currentUser.getIdToken();
        }

        if (!currentToken) {
          // Not logged in - redirect to login with return URL
          navigate(`/login?redirect=/room/${roomCode}`);
          return;
        }

        // Connect socket with token
        const socket = await connectSocket(currentToken);
        socketRef.current = socket;
        setSocketReady(true);

        // Join room
        socket.emit('join-room', { roomCode });

        // Setup all event listeners
        socket.on('room-state', ({ timerState, users, leaderboard }) => {
          setTimerState(timerState);
          setUsers(users);
          setLeaderboard(leaderboard);
        });

        socket.on('user-joined', ({ username, users, leaderboard }) => {
          setUsers(users);
          setLeaderboard(leaderboard);
          addNotification(`${username} joined the room 👋`);
        });

        socket.on('user-left', ({ username, users, leaderboard }) => {
          setUsers(users);
          setLeaderboard(leaderboard);
          addNotification(`${username} left the room`);
        });

        socket.on('timer-update', (newTimerState) => {
          setTimerState(newTimerState);
          document.title = `${formatTimer(newTimerState.timeLeft)} - StudySync`;
        });

        socket.on('timer-finished', ({ message }) => {
          addNotification(message);
          document.title = 'StudySync';
        });

        socket.on('timer-duration-changed', ({ studyMinutes, breakMinutes }) => {
          setCustomStudy(studyMinutes);
          setCustomBreak(breakMinutes);
          addNotification(`⏱️ Timer set to ${studyMinutes}m study / ${breakMinutes}m break`);
        });

        socket.on('leaderboard-update', (newLeaderboard) => setLeaderboard(newLeaderboard));
        socket.on('new-message', (message) => setMessages(prev => [...prev, message]));
        socket.on('error', ({ message }) => addNotification(`Error: ${message}`));

        // FIX 1: Rejoin room on reconnect
        socket.on('reconnect', async () => {
          addNotification('🔄 Reconnected! Rejoining...');
          // Refresh token on reconnect
          if (auth.currentUser) {
            const newToken = await auth.currentUser.getIdToken(true);
            socket.auth = { token: newToken };
          }
          socket.emit('join-room', { roomCode });
        });

      } catch (err) {
        console.error('Room init error:', err);
        navigate('/dashboard');
      }
    };

    // FIX 1: Handle internet online/offline
    const handleOnline = () => {
      addNotification('🌐 Back online! Reconnecting...');
      if (socketRef.current && !socketRef.current.connected) {
        socketRef.current.connect();
      }
    };
    const handleOffline = () => addNotification('❌ Internet disconnected. Waiting...');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    initRoom();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (socketRef.current) {
        socketRef.current.off('room-state');
        socketRef.current.off('user-joined');
        socketRef.current.off('user-left');
        socketRef.current.off('timer-update');
        socketRef.current.off('timer-finished');
        socketRef.current.off('timer-duration-changed');
        socketRef.current.off('leaderboard-update');
        socketRef.current.off('new-message');
        socketRef.current.off('error');
        socketRef.current.off('reconnect');
      }
      document.title = 'StudySync';
    };
  }, [roomCode, token]);

  const addNotification = (message) => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message }]);
    notifTimeoutRef.current[id] = setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 4000);
  };

  const socket = socketRef.current;

  const handleStartTimer = () => socket?.emit('timer-start', { roomCode });
  const handlePauseTimer = () => socket?.emit('timer-pause', { roomCode });
  const handleResetTimer = () => socket?.emit('timer-reset', { roomCode });

  const handleSetDuration = (studyMins, breakMins) => {
    setCustomStudy(studyMins);
    setCustomBreak(breakMins);
    setShowTimerSettings(false);
    socket?.emit('timer-set-duration', { roomCode, studyMinutes: studyMins, breakMinutes: breakMins });
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    socket?.emit('send-message', { roomCode, message: newMessage });
    setNewMessage('');
  };

  const totalTime = timerState.mode === 'study' ? (customStudy * 60) : (customBreak * 60);
  const progress = ((totalTime - timerState.timeLeft) / totalTime) * 100;
  const circumference = 2 * Math.PI * 90;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="room-page">
      {showVideoCall && (
        <VideoCall
          roomCode={roomCode}
          currentUser={user?.username}
          onClose={() => setShowVideoCall(false)}
          timerState={timerState}
          leaderboard={leaderboard}
          onTimerStart={handleStartTimer}
          onTimerPause={handlePauseTimer}
          onTimerReset={handleResetTimer}
        />
      )}

      <div className="notifications">
        {notifications.map(n => (
          <div key={n.id} className="notification fade-in">{n.message}</div>
        ))}
      </div>

      <header className="room-header">
        <div className="header-brand"><span>📖</span><span>StudySync</span></div>
        <div className="room-info">
          <span className="room-name-display">Room: {roomCode}</span>
          <button className="copy-btn" onClick={() => {
            navigator.clipboard.writeText(roomCode);
            addNotification('Room code copied! 📋');
          }}>📋 Copy Code</button>
        </div>
        <div className="header-actions">
          <button className={`btn video-call-btn ${showVideoCall ? 'active' : ''}`}
            onClick={() => setShowVideoCall(true)}>📹 Video Call</button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/dashboard')}>← Leave</button>
        </div>
      </header>

      <div className="room-layout">
        {/* Users */}
        <aside className="room-sidebar left-sidebar">
          <div className="card sidebar-card">
            <h3>👥 In This Room ({users.length})</h3>
            <ul className="user-list">
              {users.map((u, i) => (
                <li key={i} className={`user-item ${u.username === user?.username ? 'me' : ''}`}>
                  <div className="user-avatar">{u.username[0].toUpperCase()}</div>
                  <div className="user-details">
                    <span className="user-name">{u.username}{u.username === user?.username && <span className="you-tag"> (you)</span>}</span>
                    <span className="user-time">{formatStudyTime(u.studyTime)}</span>
                  </div>
                  <div className="user-status-dot" />
                </li>
              ))}
              {users.length === 0 && <li className="empty-msg">Connecting...</li>}
            </ul>
          </div>
        </aside>

        {/* Timer Center */}
        <main className="room-center">
          <div className={`mode-badge ${timerState.mode}`}>
            {timerState.mode === 'study' ? '📚 Study Time' : '☕ Break Time'}
          </div>

          <div className="timer-container">
            <svg className="timer-svg" viewBox="0 0 200 200">
              <circle cx="100" cy="100" r="90" fill="none" stroke="var(--bg-secondary)" strokeWidth="8" />
              <circle cx="100" cy="100" r="90" fill="none"
                stroke={timerState.mode === 'study' ? 'var(--accent-gold)' : 'var(--accent-teal)'}
                strokeWidth="8" strokeLinecap="round"
                strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                transform="rotate(-90 100 100)"
                style={{ transition: 'stroke-dashoffset 1s linear' }}
              />
            </svg>
            <div className="timer-display">
              <div className="timer-time">{formatTimer(timerState.timeLeft)}</div>
              <div className="timer-status">{timerState.isRunning ? 'Focusing...' : 'Paused'}</div>
            </div>
          </div>

          <div className="timer-controls">
            {!timerState.isRunning
              ? <button className="btn btn-primary" onClick={handleStartTimer}>▶ Start</button>
              : <button className="btn btn-secondary" onClick={handlePauseTimer}>⏸ Pause</button>
            }
            <button className="btn btn-danger" onClick={handleResetTimer}>↺ Reset</button>
            <button className="btn btn-secondary" onClick={() => setShowTimerSettings(!showTimerSettings)} title="Set Duration">⚙️</button>
          </div>

          {showTimerSettings && (
            <div className="timer-settings card">
              <h4>⏱️ Set Timer Duration</h4>
              <p className="settings-hint">Choose a preset or custom duration</p>
              <div className="timer-presets">
                {[[10,5],[15,5],[25,5],[30,10],[45,10],[60,15]].map(([s,b]) => (
                  <button key={s} className={`preset-btn ${customStudy===s && customBreak===b ? 'active' : ''}`}
                    onClick={() => handleSetDuration(s, b)}>
                    {s}m<span className="preset-break">/{b}m break</span>
                  </button>
                ))}
              </div>
              <div className="custom-duration">
                <div className="custom-input-group">
                  <label>Study (min)</label>
                  <input type="number" min="1" max="120" value={customStudy}
                    onChange={e => setCustomStudy(Number(e.target.value))} />
                </div>
                <div className="custom-input-group">
                  <label>Break (min)</label>
                  <input type="number" min="1" max="60" value={customBreak}
                    onChange={e => setCustomBreak(Number(e.target.value))} />
                </div>
                <button className="btn btn-primary" onClick={() => handleSetDuration(customStudy, customBreak)}>Set</button>
              </div>
            </div>
          )}

          <p className="timer-hint">⚡ Timer syncs with everyone · {customStudy}m study / {customBreak}m break</p>

          {!showVideoCall && (
            <div className="video-banner" onClick={() => setShowVideoCall(true)}>
              <span>📹</span>
              <div>
                <strong>Start a Video Call</strong>
                <p>Study together face-to-face!</p>
              </div>
              <button className="btn btn-primary btn-sm">Join →</button>
            </div>
          )}

          {/* FIX 2: Leaderboard with live score */}
          <div className="card leaderboard">
            <h3>🏆 Leaderboard <span style={{fontSize:'11px',color:'var(--text-muted)',fontFamily:'var(--font-body)'}}>• updates live</span></h3>
            <ul className="leaderboard-list">
              {leaderboard.map((entry) => (
                <li key={entry.rank} className={`lb-item ${entry.username === user?.username ? 'me' : ''}`}>
                  <span className="lb-rank">
                    {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
                  </span>
                  <span className="lb-name">{entry.username}</span>
                  <span className="lb-time">{formatStudyTime(entry.studyTime)}</span>
                </li>
              ))}
              {leaderboard.length === 0 && <li className="empty-msg">Start timer to earn points!</li>}
            </ul>
          </div>
        </main>

        {/* Chat */}
        <aside className="room-sidebar right-sidebar">
          <div className="card chat-card">
            <h3>💬 Room Chat</h3>
            <div className="messages-area">
              {messages.length === 0 && <div className="empty-msg">Say hello! 👋</div>}
              {messages.map((msg, i) => (
                <div key={i} className={`message ${msg.username === user?.username ? 'mine' : 'theirs'}`}>
                  <div className="msg-username">{msg.username === user?.username ? 'You' : msg.username}</div>
                  <div className="msg-bubble">{msg.message}</div>
                  <div className="msg-time">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <form className="chat-form" onSubmit={handleSendMessage}>
              <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..." maxLength={500} />
              <button type="submit" className="send-btn" disabled={!newMessage.trim()}>↑</button>
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default Room;
