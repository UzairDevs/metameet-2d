
import { io } from 'socket.io-client';

// Socket instance
export let socket = null;

export const initSocketConnection = () => {
  if (socket) return socket;
  
  
  socket = io('http://localhost:3000', {
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    autoConnect: true
  });


  socket.on('connect', () => {
    console.log('Connected to socket server with ID:', socket.id);
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });

  socket.on('disconnect', () => {
    console.log('Disconnected from socket server');
  });

  return socket;
};

export const joinRoom = (roomId, userId, username, position) => {
  if (!socket) {
    console.error('Socket not initialized');
    return;
  }
  
  // Join room with initial position
  const initialPosition = position || {
    x: Math.floor(Math.random() * 400) + 100,
    y: Math.floor(Math.random() * 300) + 100
  };
  
  console.log(`Joining room ${roomId} as ${username} (${userId}) at position:`, initialPosition);
  
  socket.emit('join-room', {
    roomId,
    userId,
    username,
    position: initialPosition
  });
};

export const leaveRoom = (roomId, userId) => {
  if (!socket) return;
  
  socket.emit('leave-room', { roomId, userId });
};

export const updatePosition = (roomId, userId, position) => {
  if (!socket) return;
  
  socket.emit('position-update', {
    roomId,
    userId,
    position
  });
};
