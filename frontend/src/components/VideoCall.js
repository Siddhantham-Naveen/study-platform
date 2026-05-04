// ============================================
// VideoCall.js - Complete Rewrite v13
// Fixed: No glitching, no echo, smooth screen share
// ============================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getSocket } from '../utils/socket';
import './VideoCall.css';

// ICE servers for peer connection
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 10,
};

const formatTimer = (s) => {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
};

const formatStudyTime = (seconds) => {
  if (!seconds) return '0m';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
};

const VideoCall = ({ roomCode, currentUser, onClose, timerState, leaderboard, onTimerStart, onTimerPause, onTimerReset }) => {
  const socket = getSocket();

  // Refs - never cause re-renders
  const localStreamRef = useRef(null);       // Camera+mic stream
  const screenStreamRef = useRef(null);      // Screen share stream
  const peersRef = useRef({});               // { socketId: RTCPeerConnection }
  const localVideoRef = useRef(null);        // Local video element
  const remoteVideoRefs = useRef({});        // { socketId: video element }
  const isScreenSharingRef = useRef(false);  // Track screen share state

  // State - only what React needs to render
  const [isJoined, setIsJoined] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [remoteUsers, setRemoteUsers] = useState([]); // [{ socketId, username, videoOn, audioOn }]
  const [error, setError] = useState('');
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  // ---- Set local video source ----
  const setLocalVideo = useCallback((stream) => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      // Mirror for camera, not for screen share
      localVideoRef.current.style.transform = isScreenSharingRef.current ? 'none' : 'scaleX(-1)';
    }
  }, []);

  // ---- Create peer connection ----
  const createPeer = useCallback((targetId, targetUsername) => {
    // Close existing connection if any
    if (peersRef.current[targetId]) {
      peersRef.current[targetId].close();
      delete peersRef.current[targetId];
    }

    const pc = new RTCPeerConnection(ICE_CONFIG);

    // Add ALL local tracks ONCE
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // Send ICE candidates
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        socket.emit('webrtc-ice-candidate', { targetSocketId: targetId, candidate, roomCode });
      }
    };

    // Receive remote stream - set directly on DOM element (NO state = NO flicker)
    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (!stream) return;
      
      // Set immediately if element exists
      if (remoteVideoRefs.current[targetId]) {
        remoteVideoRefs.current[targetId].srcObject = stream;
        return;
      }
      
      // Element not mounted yet - wait for it with polling
      let attempts = 0;
      const trySet = setInterval(() => {
        attempts++;
        if (remoteVideoRefs.current[targetId]) {
          remoteVideoRefs.current[targetId].srcObject = stream;
          clearInterval(trySet);
        } else if (attempts > 20) {
          clearInterval(trySet); // Give up after 2 seconds
        }
      }, 100);
    };

    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) {
        removePeer(targetId);
      }
    };

    peersRef.current[targetId] = pc;
    return pc;
  }, [socket, roomCode]);

  const removePeer = (socketId) => {
    if (peersRef.current[socketId]) {
      peersRef.current[socketId].close();
      delete peersRef.current[socketId];
    }
    delete remoteVideoRefs.current[socketId];
    setRemoteUsers(prev => prev.filter(u => u.socketId !== socketId));
  };

  // ---- Join video call ----
  const joinVideoCall = async () => {
    try {
      setError('');

      // Get camera + mic with echo cancellation
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000
        }
      });

      localStreamRef.current = stream;
      setIsJoined(true);

      // Small delay to ensure DOM is ready
      setTimeout(() => setLocalVideo(stream), 100);

      socket.emit('video-join', { roomCode });
      socket.emit('media-state-change', { roomCode, videoOn: true, audioOn: true });

    } catch (err) {
      console.error('Camera error:', err);
      if (err.name === 'NotAllowedError') {
        setError('Camera/mic permission denied. Click the 🔒 icon in address bar → allow → try again.');
      } else if (err.name === 'NotFoundError') {
        setError('No camera or microphone found on this device.');
      } else if (err.name === 'NotReadableError') {
        setError('Camera is in use by another app. Close it and retry.');
      } else {
        setError(err.message);
      }
    }
  };

  // ---- Socket events ----
  useEffect(() => {
    if (!socket || !isJoined) return;

    // Someone new joined - we send them an offer
    const onVideoJoined = async ({ socketId, username }) => {
      setRemoteUsers(prev => {
        if (prev.find(u => u.socketId === socketId)) return prev;
        return [...prev, { socketId, username, videoOn: true, audioOn: true }];
      });

      const pc = createPeer(socketId, username);
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      socket.emit('webrtc-offer', { targetSocketId: socketId, offer, roomCode });
    };

    // We received an offer - send back answer
    const onOffer = async ({ offer, fromSocketId, fromUsername }) => {
      setRemoteUsers(prev => {
        if (prev.find(u => u.socketId === fromSocketId)) return prev;
        return [...prev, { socketId: fromSocketId, username: fromUsername, videoOn: true, audioOn: true }];
      });

      const pc = createPeer(fromSocketId, fromUsername);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc-answer', { targetSocketId: fromSocketId, answer });
    };

    const onAnswer = async ({ answer, fromSocketId }) => {
      const pc = peersRef.current[fromSocketId];
      if (pc && pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    };

    const onICE = async ({ candidate, fromSocketId }) => {
      const pc = peersRef.current[fromSocketId];
      if (pc && candidate) {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) {}
      }
    };

    const onMediaState = ({ socketId, videoOn, audioOn }) => {
      setRemoteUsers(prev => prev.map(u => u.socketId === socketId ? { ...u, videoOn, audioOn } : u));
    };

    const onVideoLeft = ({ socketId }) => removePeer(socketId);

    socket.on('video-user-joined', onVideoJoined);
    socket.on('webrtc-offer', onOffer);
    socket.on('webrtc-answer', onAnswer);
    socket.on('webrtc-ice-candidate', onICE);
    socket.on('peer-media-state', onMediaState);
    socket.on('video-user-left', onVideoLeft);

    return () => {
      socket.off('video-user-joined', onVideoJoined);
      socket.off('webrtc-offer', onOffer);
      socket.off('webrtc-answer', onAnswer);
      socket.off('webrtc-ice-candidate', onICE);
      socket.off('peer-media-state', onMediaState);
      socket.off('video-user-left', onVideoLeft);
    };
  }, [socket, isJoined, createPeer, roomCode]);

  // ---- Toggle camera ----
  const toggleVideo = () => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setIsVideoOn(track.enabled);
    socket.emit('media-state-change', { roomCode, videoOn: track.enabled, audioOn: isAudioOn });
  };

  // ---- Toggle mic ----
  const toggleAudio = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setIsAudioOn(track.enabled);
    socket.emit('media-state-change', { roomCode, videoOn: isVideoOn, audioOn: track.enabled });
  };

  // ---- Screen share - NO track replacement (causes glitch) ----
  // Instead: create new offer with screen track
  const startScreenShare = async () => {
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    try {
      let screenStream;
      if (isMobile) {
        // Mobile: switch to rear camera
        screenStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false
        });
      } else {
        if (!navigator.mediaDevices?.getDisplayMedia) return;
        screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 30 }, width: { ideal: 1920 } },
          audio: false
        });
      }

      screenStreamRef.current = screenStream;
      isScreenSharingRef.current = true;
      setIsScreenSharing(true);

      // Show screen locally
      setLocalVideo(screenStream);

      // Replace video track in each sender (NOT re-creating peer = no glitch)
      const screenTrack = screenStream.getVideoTracks()[0];
      for (const pc of Object.values(peersRef.current)) {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(screenTrack);
      }

      screenTrack.onended = stopScreenShare;

    } catch (e) {
      if (e.name !== 'NotAllowedError') console.error(e);
    }
  };

  const stopScreenShare = async () => {
    isScreenSharingRef.current = false;
    setIsScreenSharing(false);

    // Stop screen tracks
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;

    // Switch back to camera track
    const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
    if (cameraTrack) {
      for (const pc of Object.values(peersRef.current)) {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(cameraTrack);
      }
    }

    setLocalVideo(localStreamRef.current);
  };

  const toggleScreenShare = () => {
    if (isScreenSharing) stopScreenShare();
    else startScreenShare();
  };

  // ---- Leave call ----
  const leaveCall = () => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    screenStreamRef.current = null;

    Object.values(peersRef.current).forEach(pc => pc.close());
    peersRef.current = {};

    socket.emit('video-leave', { roomCode });
    setIsJoined(false);
    setRemoteUsers([]);
    onClose();
  };

  // ---- Remote video component - STABLE, never loses stream ----
  // Key insight: we use a callback ref that sets srcObject directly
  // This means NO re-renders when stream arrives = NO flickering
  const RemoteVideo = React.memo(({ socketId, username, videoOn, audioOn }) => {
    const videoElRef = useRef(null);

    // Callback ref - runs once when element mounts
    const setVideoRef = useCallback(el => {
      if (el) {
        videoElRef.current = el;
        remoteVideoRefs.current[socketId] = el;
        // If stream already exists, set it immediately
        const pc = peersRef.current[socketId];
        if (pc) {
          const receivers = pc.getReceivers();
          const videoReceiver = receivers.find(r => r.track?.kind === 'video');
          if (videoReceiver?.track) {
            const stream = new MediaStream([videoReceiver.track]);
            const audioReceiver = receivers.find(r => r.track?.kind === 'audio');
            if (audioReceiver?.track) stream.addTrack(audioReceiver.track);
            el.srcObject = stream;
          }
        }
      }
    }, [socketId]);

    return (
      <div className={`video-tile ${!videoOn ? 'video-off' : ''}`}>
        <video
          ref={setVideoRef}
          autoPlay
          playsInline
          className="video-element"
          style={{ display: videoOn ? 'block' : 'none' }}
        />
        {!videoOn && (
          <div className="video-avatar">
            <div className="avatar-circle">{username?.[0]?.toUpperCase()}</div>
            <span className="avatar-name">{username}</span>
          </div>
        )}
        <div className="video-overlay">
          <span className="video-username">{username}</span>
          <div className="video-indicators">
            {!audioOn && <span className="indicator">🔇</span>}
            {!videoOn && <span className="indicator">📵</span>}
          </div>
        </div>
      </div>
    );
  });

  // ---- PRE-JOIN SCREEN ----
  if (!isJoined) {
    return (
      <div className="video-prejoin">
        <div className="prejoin-card">
          <button className="prejoin-back" onClick={onClose}>← Back to Room</button>
          <h2>📹 Join Video Call</h2>
          <p>Study face-to-face with your group</p>
          {error && <div className="video-error">{error}</div>}
          <div className="prejoin-features">
            <div className="feature-item">✅ HD Video</div>
            <div className="feature-item">✅ Screen Share</div>
            <div className="feature-item">✅ Mute/Unmute</div>
            <div className="feature-item">✅ Works in browser</div>
          </div>
          <p className="prejoin-note">💡 Click <strong>Allow</strong> when browser asks for camera & mic permission</p>
          <div className="prejoin-actions">
            <button className="btn btn-primary" onClick={joinVideoCall}>📹 Start Camera & Join</button>
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  // ---- ACTIVE CALL ----
  const totalParticipants = 1 + remoteUsers.length;

  return (
    <div className="video-call-container">

      {/* Top Bar */}
      <div className="video-topbar">
        <div className="topbar-left">
          <span className="call-badge">🔴 LIVE</span>
          <span className="call-room">Room: {roomCode}</span>
          <span className="call-count">👥 {totalParticipants}</span>
        </div>

        {/* Mini Timer */}
        {timerState && (
          <div className="mini-timer">
            <span className="mini-mode">{timerState.mode === 'study' ? '📚' : '☕'}</span>
            <span className="mini-time">{formatTimer(timerState.timeLeft)}</span>
            <div className="mini-controls">
              {!timerState.isRunning
                ? <button className="mini-btn" onClick={onTimerStart}>▶</button>
                : <button className="mini-btn" onClick={onTimerPause}>⏸</button>
              }
              <button className="mini-btn" onClick={onTimerReset}>↺</button>
            </div>
          </div>
        )}

        <div className="topbar-right">
          <button className="lb-toggle-btn" onClick={() => setShowLeaderboard(!showLeaderboard)}>
            🏆 {showLeaderboard ? 'Hide' : 'Scores'}
          </button>
        </div>
      </div>

      {/* Leaderboard */}
      {showLeaderboard && leaderboard && (
        <div className="video-leaderboard">
          <h4>🏆 Leaderboard</h4>
          <ul>
            {leaderboard.map(e => (
              <li key={e.rank} className={e.username === currentUser ? 'me' : ''}>
                <span>{e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : e.rank === 3 ? '🥉' : `#${e.rank}`}</span>
                <span className="lb-name">{e.username}</span>
                <span className="lb-time">{formatStudyTime(e.studyTime)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Video Grid */}
      <div className={`video-grid participants-${Math.min(totalParticipants, 6)}`}>

        {/* Local video */}
        <div className={`video-tile local-tile ${!isVideoOn ? 'video-off' : ''}`}>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted  /* CRITICAL: mute local video to prevent echo */
            className="video-element"
            style={{ transform: isScreenSharing ? 'none' : 'scaleX(-1)' }}
          />
          {!isVideoOn && (
            <div className="video-avatar">
              <div className="avatar-circle">{currentUser?.[0]?.toUpperCase()}</div>
              <span className="avatar-name">{currentUser}</span>
            </div>
          )}
          <div className="video-overlay">
            <span className="video-username">{currentUser} (You)</span>
            <div className="video-indicators">
              {!isAudioOn && <span className="indicator">🔇</span>}
              {isScreenSharing && <span className="indicator" style={{background:'rgba(78,205,196,0.85)'}}>🖥️</span>}
            </div>
          </div>
        </div>

        {/* Remote users */}
        {remoteUsers.map(u => (
          <RemoteVideo
            key={u.socketId}
            socketId={u.socketId}
            username={u.username}
            videoOn={u.videoOn}
            audioOn={u.audioOn}
          />
        ))}

        {/* Waiting */}
        {totalParticipants === 1 && (
          <div className="waiting-tile">
            <div className="waiting-content">
              <span>👥</span>
              <p>Waiting for others to join...</p>
              <small>Share code: <strong>{roomCode}</strong></small>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="video-controls">
        <button className={`ctrl-btn ${!isAudioOn ? 'off' : ''}`} onClick={toggleAudio}>
          <span className="ctrl-icon">{isAudioOn ? '🎤' : '🔇'}</span>
          <span className="ctrl-label">{isAudioOn ? 'Mute' : 'Unmute'}</span>
        </button>

        <button className={`ctrl-btn ${!isVideoOn ? 'off' : ''}`} onClick={toggleVideo}>
          <span className="ctrl-icon">{isVideoOn ? '📹' : '📷'}</span>
          <span className="ctrl-label">{isVideoOn ? 'Stop Video' : 'Start Video'}</span>
        </button>

        <button className={`ctrl-btn ${isScreenSharing ? 'active' : ''}`} onClick={toggleScreenShare}>
          <span className="ctrl-icon">{/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? '📷' : '🖥️'}</span>
          <span className="ctrl-label">
            {/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
              ? (isScreenSharing ? 'Front Cam' : 'Rear Cam')
              : (isScreenSharing ? 'Stop Share' : 'Share Screen')}
          </span>
        </button>

        <button className="ctrl-btn leave-btn" onClick={leaveCall}>
          <span className="ctrl-icon">↩️</span>
          <span className="ctrl-label">Back to Room</span>
        </button>
      </div>
    </div>
  );
};

export default VideoCall;
