
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
  
  // Preload assets when the component mounts
  useEffect(() => {
    const preloadAssets = async () => {
      try {
        // Preload background image
        const bgImage = new Image();
        bgImage.src = '/src/assets/images/background.png';
        await new Promise((resolve) => {
          bgImage.onload = resolve;
        });
        
        // Preload player sprite
        const playerImage = new Image();
        playerImage.src = '/src/assets/images/player.png';
        await new Promise((resolve) => {
          playerImage.onload = resolve;
        });
        
        setIsAssetsLoaded(true);
      } catch (error) {
        console.error('Failed to preload assets:', error);
        // Continue anyway to not block the app
        setIsAssetsLoaded(true);
      }
    };
    
    preloadAssets();
    
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