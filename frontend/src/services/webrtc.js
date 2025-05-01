import { socket, initSocketConnection } from './socket';

const PEER_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

const peers = new Map(); // Stores { pc: RTCPeerConnection, remoteStream: MediaStream }
let localStream = null;
let userId = null;
let proximityCallbacks = [];

export function onProximityChange(cb) {
  proximityCallbacks.push(cb);
  // Return a function to remove the callback
  return () => {
    proximityCallbacks = proximityCallbacks.filter(callback => callback !== cb);
  };
}

export function checkProximity(otherUserId, otherPosition, myPosition) {
  const dx = otherPosition.x - myPosition.x;
  const dy = otherPosition.y - myPosition.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const isInProximity = distance <= 150;

  proximityCallbacks.forEach(callback => {
    callback({ userId: otherUserId, inProximity: isInProximity, distance });
  });

  return isInProximity;
}

export async function initWebRTC(currentUserId) {
  userId = currentUserId;
  
  // Ensure socket is initialized
  if (!socket) {
    initSocketConnection();
  }
  
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ 
      video: true, 
      audio: true 
    });
    
    // Setup socket listeners for WebRTC signaling
    setupSocketListeners();
    
    return localStream;
  } catch (error) {
    console.error('WebRTC init failed:', error);
    throw error;
  }
}

function setupSocketListeners() {
  // Remove any existing listeners to prevent duplicates
  socket.off('webrtc-offer');
  socket.off('webrtc-answer');
  socket.off('webrtc-ice-candidate');
  socket.off('proximity-alert');
  
  // Setup offer handler
  socket.on('webrtc-offer', async ({ from, offer }) => {
    console.log(`Received offer from ${from}`);
    if (!peers.has(from)) {
      const { pc } = createPeerConnection(from, false);
      
      // Add tracks to the connection
      localStream.getTracks().forEach(track => {
        console.log(`Adding ${track.kind} track to peer connection (responding to offer)`);
        pc.addTrack(track, localStream);
      });
      
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        socket.emit('webrtc-answer', {
          to: from,
          answer: pc.localDescription
        });
      } catch (error) {
        console.error('Error handling offer:', error);
      }
    }
  });
  
  // Setup answer handler
  socket.on('webrtc-answer', async ({ from, answer }) => {
    console.log(`Received answer from ${from}`);
    if (peers.has(from)) {
      const { pc } = peers.get(from);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        console.log('Set remote description successfully from answer');
      } catch (error) {
        console.error('Error setting remote description from answer:', error);
      }
    }
  });
  
  // Setup ICE candidate handler
  socket.on('webrtc-ice-candidate', async ({ from, candidate }) => {
    console.log(`Received ICE candidate from ${from}`);
    if (peers.has(from) && candidate) {
      const { pc } = peers.get(from);
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('Added ICE candidate successfully');
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
      }
    }
  });
  
  // Setup proximity handler
  socket.on('proximity-alert', (proxUserId) => {
    console.log(`Proximity alert for user ${proxUserId}`);
    proximityCallbacks.forEach(callback => {
      callback({ 
        userId: proxUserId, 
        inProximity: true 
      });
    });
  });
}

export async function startCall(targetUserId) {
  try {
    console.log(`Starting call with ${targetUserId}`);
    const { pc } = createPeerConnection(targetUserId, true);
    
    // Add tracks before creating offer
    localStream.getTracks().forEach(track => {
      console.log(`Adding ${track.kind} track to peer connection (initiating call)`);
      pc.addTrack(track, localStream);
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    socket.emit('webrtc-offer', {
      to: targetUserId,
      offer: pc.localDescription
    });
    
    console.log('Offer sent to', targetUserId);
  } catch (error) {
    console.error('Call start failed:', error);
    throw error;
  }
}

function createPeerConnection(targetUserId, isInitiator) {
  console.log(`Creating peer connection with ${targetUserId}, initiator: ${isInitiator}`);
  
  if (peers.has(targetUserId)) {
    console.log('Peer connection already exists, returning existing connection');
    return peers.get(targetUserId);
  }

  const pc = new RTCPeerConnection(PEER_CONFIG);
  const remoteStream = new MediaStream();
  
  pc.ontrack = (event) => {
    console.log(`Received track from ${targetUserId}:`, event.track.kind);
    
    // Add track to remote stream if not already added
    if (!remoteStream.getTracks().some(t => t.id === event.track.id)) {
      remoteStream.addTrack(event.track);
      console.log(`Added ${event.track.kind} track to remote stream`);
    }
    
    // Notify about the stream
    proximityCallbacks.forEach(cb => cb({
      userId: targetUserId,
      hasStream: true,
      stream: remoteStream
    }));
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      console.log(`Sending ICE candidate to ${targetUserId}`);
      socket.emit('webrtc-ice-candidate', {
        to: targetUserId,
        candidate: event.candidate
      });
    }
  };

  pc.onconnectionstatechange = () => {
    console.log(`Connection state changed with ${targetUserId}: ${pc.connectionState}`);
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      console.log(`Cleaning up peer connection with ${targetUserId} due to state: ${pc.connectionState}`);
      cleanupPeer(targetUserId);
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log(`ICE connection state with ${targetUserId}: ${pc.iceConnectionState}`);
    if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
      console.log(`Cleaning up peer connection with ${targetUserId} due to ICE state: ${pc.iceConnectionState}`);
      cleanupPeer(targetUserId);
    }
  };

  peers.set(targetUserId, { pc, remoteStream });
  return { pc, remoteStream };
}

export function cleanup() {
  console.log('Cleaning up all WebRTC connections');
  peers.forEach(({ pc }, targetUserId) => {
    cleanupPeer(targetUserId);
  });
  
  if (localStream) {
    localStream.getTracks().forEach(track => {
      track.stop();
      console.log(`Stopped local ${track.kind} track`);
    });
    localStream = null;
  }
}

function cleanupPeer(targetUserId) {
  if (peers.has(targetUserId)) {
    console.log(`Cleaning up peer connection with ${targetUserId}`);
    const { pc, remoteStream } = peers.get(targetUserId);
    
    if (pc) {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.oniceconnectionstatechange = null;
      pc.onconnectionstatechange = null;
      pc.close();
    }
    
    if (remoteStream) {
      remoteStream.getTracks().forEach(track => {
        track.stop();
        console.log(`Stopped remote ${track.kind} track from ${targetUserId}`);
      });
    }
    
    peers.delete(targetUserId);
    
    // Notify about stream removal
    proximityCallbacks.forEach(cb => cb({
      userId: targetUserId,
      hasStream: false
    }));
  }
}