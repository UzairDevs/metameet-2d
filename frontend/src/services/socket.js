import { io } from 'socket.io-client';

// Backend URL. In production set VITE_SOCKET_URL (or VITE_API_URL) to your
// Render backend, e.g. https://metameet-backend.onrender.com
const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:3000';


// Socket instance
export let socket = null;

export const initSocketConnection = () => {
  if (socket) return socket;

  socket = io(SOCKET_URL, {
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    autoConnect: true,
    // Allow long-polling fallback first, then upgrade to websocket — more
    // reliable through proxies and on free hosting cold starts.
    transports: ['polling', 'websocket'],
  });

  socket.on('connect', () => {
    console.log('Connected to socket server with ID:', socket.id);
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error.message);
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });

  socket.on('disconnect', (reason) => {
    console.log('Disconnected from socket server:', reason);
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

export const sendChatMessage = (roomId, messageData) => {
  if (!socket) {
    console.error('Socket not initialized');
    return;
  }
  
  socket.emit('chat-message', {
    roomId,
    ...messageData
  });
};