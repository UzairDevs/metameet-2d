const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const dotenv = require('dotenv');
dotenv.config();
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? [process.env.CLIENT_URL] 
  : ['http://localhost:5173'];

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "allowedOrigins",
    methods: ["GET", "POST"]
  }
});

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json());

// Store active rooms and their participants
const rooms = {};

app.post('/api/room', (req, res) => {
  const roomId = uuidv4().substring(0, 6).toUpperCase();
  rooms[roomId] = {
    id: roomId,
    participants: {},
    createdAt: Date.now()
  };
  console.log(`Room created: ${roomId}`);
  res.json({ roomId });
});

app.get('/api/room/:roomId', (req, res) => {
  const { roomId } = req.params;
  if (!rooms[roomId]) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json({ room: rooms[roomId] });
});

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('join-room', ({ roomId, userId, username, position }) => {
    console.log(`User ${username} (${userId}) joining room ${roomId}`);
    
    if (!rooms[roomId]) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    socket.join(roomId);
    rooms[roomId].participants[userId] = {
      id: userId,
      username,
      position,
      socketId: socket.id
    };

    socket.userData = { userId, roomId, username };

    socket.to(roomId).emit('user-joined', { userId, username, position });
    socket.emit('room-users', { participants: rooms[roomId].participants });
  });

  socket.on('chat-message', ({ roomId, ...messageData }) => {
    
    socket.to(roomId).emit('chat-message', messageData);
    socket.emit('chat-message', messageData);
  });
  
  socket.on('position-update', (data) => {
    const { userId, roomId, position } = data;
    
    if (!rooms[roomId]?.participants[userId]) return;

    rooms[roomId].participants[userId].position = position;
    
    socket.to(roomId).emit('user-moved', { userId, position });

   
    const currentUser = rooms[roomId].participants[userId];
    Object.values(rooms[roomId].participants).forEach(otherUser => {
      if (otherUser.id === userId) return;
      
      const dx = otherUser.position.x - position.x;
      const dy = otherUser.position.y - position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < 150) { 
      
        socket.emit('proximity-alert', otherUser.id);
        io.to(otherUser.socketId).emit('proximity-alert', userId);
      }
    });
  });

  // WebRTC stuff
  socket.on('webrtc-offer', (data) => {
    const { to, offer } = data;
    console.log(`Received WebRTC offer from ${socket.userData?.userId} to ${to}`);
    
    const targetSocket = findSocketByUserId(to);
    if (targetSocket) {
      console.log(`Forwarding offer to ${to}`);
      targetSocket.emit('webrtc-offer', {
        from: socket.userData.userId,
        offer: offer
      });
    } else {
      console.log(`Target user ${to} not found for WebRTC offer`);
    }
  });

  socket.on('webrtc-answer', (data) => {
    const { to, answer } = data;
    console.log(`Received WebRTC answer from ${socket.userData?.userId} to ${to}`);
    
    const targetSocket = findSocketByUserId(to);
    if (targetSocket) {
      console.log(`Forwarding answer to ${to}`);
      targetSocket.emit('webrtc-answer', {
        from: socket.userData.userId,
        answer: answer
      });
    } else {
      console.log(`Target user ${to} not found for WebRTC answer`);
    }
  });

  socket.on('webrtc-ice-candidate', (data) => {
    const { to, candidate } = data;
    console.log(`Received ICE candidate from ${socket.userData?.userId} to ${to}`);
    
    const targetSocket = findSocketByUserId(to);
    if (targetSocket) {
      console.log(`Forwarding ICE candidate to ${to}`);
      targetSocket.emit('webrtc-ice-candidate', {
        from: socket.userData.userId,
        candidate: candidate
      });
    } else {
      console.log(`Target user ${to} not found for ICE candidate`);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    if (!socket.userData) return;

    const { userId, roomId } = socket.userData;
    if (rooms[roomId]?.participants[userId]) {
      delete rooms[roomId].participants[userId];
      socket.to(roomId).emit('user-left', { userId });
      
      if (Object.keys(rooms[roomId].participants).length === 0) {
        console.log(`Room ${roomId} is empty, removing it`);
        delete rooms[roomId];
      }
    }
  });
});


function findSocketByUserId(userId) {
  for (const [socketId, socket] of io.sockets.sockets.entries()) {
    if (socket.userData?.userId === userId) {
      return socket;
    }
  }
  return null;
}


setInterval(() => {
  const now = Date.now();
  const MAX_ROOM_AGE = 24 * 60 * 60 * 1000; 
  
  for (const roomId in rooms) {
    if (now - rooms[roomId].createdAt > MAX_ROOM_AGE) {
      console.log(`Room ${roomId} expired, removing it`);
      delete rooms[roomId];
    }
  }
}, 60 * 60 * 1000); // Checking every hour

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});