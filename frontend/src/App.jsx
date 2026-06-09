
import React, { useState, useEffect } from 'react';
import Game from './components/Game';
import VideoChat from './components/VideoChat';
import RoomForm from './components/RoomForm';
import { initWebRTC, cleanup } from './services/webrtc';
import { initSocketConnection, leaveRoom } from './services/socket';
import './App.css';
import Chat from './components/Chat';

function App() {
  const [room, setRoom] = useState(null);
  const [userId, setUserId] = useState(null);
  const [username, setUsername] = useState('');
  const [isAssetsLoaded, setIsAssetsLoaded] = useState(false);
  
  // Preload assets when the component mounts. This is only a warm-up — Phaser
  // loads the same images itself in the scene — so it must NEVER block the UI.
  useEffect(() => {
    // Resolves on load OR error, so a slow/failed image (e.g. CDN cold start)
    // can't leave us stuck on the "Loading assets..." screen.
    const loadImage = (src) =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = () => {
          console.warn('Asset preload failed (continuing anyway):', src);
          resolve();
        };
        img.src = src;
      });

    const preloadAssets = async () => {
      await Promise.all([
        loadImage('assets/images/background.png'),
        loadImage('assets/images/player.png'),
      ]);
      setIsAssetsLoaded(true);
    };

    // Hard safety net: never gate the app on assets for more than 5s.
    const fallback = setTimeout(() => setIsAssetsLoaded(true), 5000);

    preloadAssets().finally(() => clearTimeout(fallback));
    
    // Initialize socket connection
    initSocketConnection();
    
    // Clean up on component unmount
    return () => {
      if (room) {
        leaveRoom(room, userId);
        cleanup();
      }
    };
  }, []);
  
  const handleJoinRoom = (roomId, newUserId, name) => {
    setRoom(roomId);
    setUserId(newUserId);
    setUsername(name);
    
    // Initialize WebRTC
    initWebRTC(newUserId);
  };
  
  const handleLeaveRoom = () => {
    if (room) {
      leaveRoom(room, userId);
      cleanup();
      setRoom(null);
      setUserId(null);
      setUsername('');
    }
  };
  
  return (
    <div className="app">
      {!room ? (
        <RoomForm onJoinRoom={handleJoinRoom} />
      ) : (
        <div className="game-wrapper">
        
          <div className="game-section">
            <header>
              <h2 style={ {color: 'black'} }>Room: {room}</h2>
              <button onClick={handleLeaveRoom} className="leave-btn">
                Leave Room
              </button>
            </header>
  
            {isAssetsLoaded ? (
              <>
                <Game userId={userId} roomId={room} username={username} />
               
                <Chat userId={userId} roomId={room} username={username} />
              </>
            ) : (
              <div className="loading">Loading assets...</div>
            )}
          </div>
  
          
          <div className="video-section">
            <VideoChat userId={userId} participants={[userId]} />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;