
import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

const RoomForm = ({ onJoinRoom }) => {
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    
    if (!username.trim()) {
      setError('Please enter a username');
      return;
    }
    
    setIsCreating(true);
    
    try {
      const response = await fetch('http://localhost:3000/api/room', { //process.env.prod 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (data.roomId) {
        const userId = uuidv4();
        onJoinRoom(data.roomId, userId, username.trim());
      } else {
        setError('Failed to create room');
      }
    } catch (err) {
      console.error('Error creating room:', err);
      setError('Failed to create room: ' + err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    
    if (!username.trim()) {
      setError('Please enter a username');
      return;
    }
    
    if (!roomId.trim()) {
      setError('Please enter a room code');
      return;
    }
    
    try {
      const response = await fetch(`http://localhost:3000/api/room/${roomId.trim()}`, {
        method: 'GET'
      });
      
      if (response.ok) {
        const userId = uuidv4();
        onJoinRoom(roomId.trim(), userId, username.trim());
      } else {
        setError('Room not found or has expired');
      }
    } catch (err) {
      console.error('Error joining room:', err);
      setError('Failed to join room: ' + err.message);
    }
  };

  return (
    <div className="room-form">
      <h2>2D Metaverse</h2>
      
      {error && <div className="error">{error}</div>}
      
      <div className="form-group">
        <label htmlFor="username">Username</label>
        <input
          type="text"
          id="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter your username"
          required
        />
      </div>
      
      <div className="form-actions">
        <button 
          onClick={handleCreateRoom} 
          disabled={isCreating}
        >
          {isCreating ? 'Creating...' : 'Create New Room'}
        </button>
        
        <div className="divider">OR</div>
        
        <div className="form-group">
          <label htmlFor="roomId">Join Existing Room</label>
          <input
            type="text"
            id="roomId"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="Enter room code"
          />
          <button onClick={handleJoinRoom}>Join Room</button>
        </div>
      </div>
    </div>
  );
};

export default RoomForm;