const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);

// Allowed origins for CORS. Set CLIENT_ORIGIN on Render to your frontend URL
// (comma-separated for multiple). Defaults to "*" for easy local/dev use.
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*";
const allowedOrigins =
  CLIENT_ORIGIN === "*"
    ? "*"
    : CLIENT_ORIGIN.split(",").map((o) => o.trim());

const io = socketIo(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

// Render terminates TLS at its proxy; trust it so secure cookies / IPs work.
app.set('trust proxy', 1);
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// Store active rooms and their participants
const rooms = {};

// --- Health & info routes (used by Render health checks / uptime pings) ---
app.get('/', (req, res) => {
  res.json({ service: 'metameet-2d backend', status: 'ok' });
});

app.get(['/health', '/healthz', '/api/health'], (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    rooms: Object.keys(rooms).length,
    timestamp: Date.now()
  });
});

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
    console.log(`Room ${roomId} not found in GET request, will be created on join`);
    // Return success anyway - room will be created when someone joins
    return res.json({ 
      room: { 
        id: roomId, 
        participants: {},
        createdAt: Date.now(),
        autoCreated: true 
      } 
    });
  }
  res.json({ room: rooms[roomId] });
});

// Socket.io connections
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // Handle user joining a room
  socket.on("join-room", ({ roomId, userId, username, position }) => {
  console.log(`🧍 ${username || "Unknown"} (${userId}) joining room ${roomId}`);

  if (!roomId || !userId) {
    console.warn("❌ join-room missing roomId or userId:", { roomId, userId });
    return;
  }

  // Create room if it doesn't exist
  if (!rooms[roomId]) {
    rooms[roomId] = {
      id: roomId,
      participants: {},
      createdAt: Date.now(),
    };
    console.log(`🆕 Created room ${roomId}`);
  }

  // Save user info
  rooms[roomId].participants[userId] = {
    id: userId,
    username: username || `User-${userId.substring(0, 4)}`,
    position: position || { x: 400, y: 300 },
    socketId: socket.id,
  };

  socket.userData = { userId, roomId, username };

  // Join socket.io room
  socket.join(roomId);

  // 🔹 Send the full list to everyone (so both clients see each other)
  io.to(roomId).emit("room-users", {
    participants: rooms[roomId].participants,
  });

  // 🔹 Optionally still notify others who joined (for animations, sound, etc.)
  socket.to(roomId).emit("user-joined", {
    userId,
    username,
    position,
  });
});


  socket.on('chat-message', ({ roomId, ...messageData }) => {
    // Broadcast to all in room except sender
    socket.to(roomId).emit('chat-message', messageData);
    // Send back to sender for local update
    socket.emit('chat-message', messageData);
  });
  
  socket.on('position-update', (data) => {
    const { userId, roomId, position } = data;
    
    if (!rooms[roomId]?.participants[userId]) return;

    rooms[roomId].participants[userId].position = position;
    
    socket.to(roomId).emit('user-moved', { userId, position });

    // Proximity detection
    const currentUser = rooms[roomId].participants[userId];
    Object.values(rooms[roomId].participants).forEach(otherUser => {
      if (otherUser.id === userId) return;
      
      const dx = otherUser.position.x - position.x;
      const dy = otherUser.position.y - position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < 150) { // Proximity threshold
        // Emit to both users that they are in proximity
        socket.emit('proximity-alert', otherUser.id);
        io.to(otherUser.socketId).emit('proximity-alert', userId);
      }
    });
  });

  // WebRTC signaling
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

  // Explicit leave (e.g. user clicks "Leave Room")
  socket.on('leave-room', ({ roomId, userId }) => {
    removeParticipant(socket, roomId, userId);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    if (!socket.userData) return;

    const { userId, roomId } = socket.userData;
    removeParticipant(socket, roomId, userId);
  });
});

// Remove a participant from a room, notify others, and clean up empty rooms.
function removeParticipant(socket, roomId, userId) {
  if (!roomId || !userId || !rooms[roomId]?.participants[userId]) return;

  delete rooms[roomId].participants[userId];
  socket.to(roomId).emit('user-left', { userId });
  socket.leave(roomId);

  if (Object.keys(rooms[roomId].participants).length === 0) {
    console.log(`Room ${roomId} is empty, removing it`);
    delete rooms[roomId];
  }
}

// Helper function to find a socket by user ID
function findSocketByUserId(userId) {
  for (const [socketId, socket] of io.sockets.sockets.entries()) {
    if (socket.userData?.userId === userId) {
      return socket;
    }
  }
  return null;
}

// Room cleanup
setInterval(() => {
  const now = Date.now();
  const MAX_ROOM_AGE = 24 * 60 * 60 * 1000; // 24 hours
  
  for (const roomId in rooms) {
    if (now - rooms[roomId].createdAt > MAX_ROOM_AGE) {
      console.log(`Room ${roomId} expired, removing it`);
      delete rooms[roomId];
    }
  }
}, 60 * 60 * 1000); // Check every hour

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});