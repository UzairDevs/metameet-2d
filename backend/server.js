
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
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

// Socket.io connections
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // Handle user joining a room
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

  
  socket.on('position-update', (data) => {
    const { userId, roomId, position } = data;
    
    if (!rooms[roomId]?.participants[userId]) return;

 
    rooms[roomId].participants[userId].position = position;
    
    
    socket.to(roomId).emit('user-moved', { userId, position });

    // Proximity detection (server-side example)
    const currentUser = rooms[roomId].participants[userId];
    Object.values(rooms[roomId].participants).forEach(otherUser => {
      if (otherUser.id === userId) return;
      
      const dx = otherUser.position.x - position.x;
      const dy = otherUser.position.y - position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < 150) { // Proximity threshold
        socket.emit('proximity-alert', otherUser.id);
        io.to(otherUser.socketId).emit('proximity-alert', userId);
      }
    });
  });

  // WebRTC 
  socket.on('webrtc-offer', ({ to, offer }) => {
    const targetSocket = findSocketById(to);
    if (targetSocket) {
      console.log(`Relaying offer from ${socket.userData.userId} to ${to}`);
      io.to(targetSocket.id).emit('webrtc-offer', {
        from: socket.userData.userId,
        offer: offer
      });
    } else {
      console.log(`WebRTC offer target not found: ${to}`);
    }
  });

  socket.on('webrtc-answer', ({ to, answer }) => {
    const targetSocket = findSocketById(to);
    if (targetSocket) {
      console.log(`Relaying answer from ${socket.userData.userId} to ${to}`);
      io.to(targetSocket.id).emit('webrtc-answer', {
        from: socket.userData.userId,
        answer: answer
      });
    }
  });

  socket.on('webrtc-ice-candidate', ({ to, candidate }) => {
    const targetSocket = findSocketById(to);
    if (targetSocket) {
      io.to(targetSocket.id).emit('webrtc-ice-candidate', {
        from: socket.userData.userId,
        candidate: candidate
      });
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
        delete rooms[roomId];
      }
    }
  });
});


function findSocketById(userId) {
  return Array.from(io.sockets.sockets.values())
    .find(socket => socket.userData?.userId === userId);
}

// Room cleanup
setInterval(() => {
  const now = Date.now();
  const MAX_ROOM_AGE = 24 * 60 * 60 * 1000;
  for (const roomId in rooms) {
    if (now - rooms[roomId].createdAt > MAX_ROOM_AGE) {
      delete rooms[roomId];
    }
  }
}, 60 * 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});