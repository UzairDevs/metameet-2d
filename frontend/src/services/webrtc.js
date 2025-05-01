import { socket } from './socket';

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
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ 
      video: true, 
      audio: true 
    });
    
    // Setup socket listeners for WebRTC signaling
    socket.on('webrtc-offer', async ({ from, offer }) => {
      console.log(`Received offer from ${from}`);
      if (!peers.has(from)) {
        const { pc } = createPeerConnection(from, false);
        
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        socket.emit('webrtc-answer', {
          to: from,
          answer: pc.localDescription
        });
      }
    });
    
    socket.on('webrtc-answer', async ({ from, answer }) => {
      console.log(`Received answer from ${from}`);
      if (peers.has(from)) {
        const { pc } = peers.get(from);
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });
    
    socket.on('webrtc-ice-candidate', async ({ from, candidate }) => {
      console.log(`Received ICE candidate from ${from}`);
      if (peers.has(from) && candidate) {
        const { pc } = peers.get(from);
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });
    
    socket.on('proximity-alert', (proxUserId) => {
      console.log(`Proximity alert for user ${proxUserId}`);
      proximityCallbacks.forEach(callback => {
        callback({ 
          userId: proxUserId, 
          inProximity: true 
        });
      });
    });
    
    return localStream;
  } catch (error) {
    console.error('WebRTC init failed:', error);
    throw error;
  }
}

export async function startCall(targetUserId) {
  try {
    console.log(`Starting call with ${targetUserId}`);
    const { pc } = createPeerConnection(targetUserId, true);
    
    // Add tracks before creating offer
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    // Send offer via socket.io instead of websocket
    socket.emit('webrtc-offer', {
      to: targetUserId,
      offer: pc.localDescription
    });
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
    console.log(`Received track from ${targetUserId}`, event.track.kind);
    event.streams[0].getTracks().forEach(track => {
      console.log(`Adding ${track.kind} track to remote stream`);
      remoteStream.addTrack(track);
    });
    
    // Notify about the new stream
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
    console.log(`Connection state changed: ${pc.connectionState}`);
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
      cleanupPeer(targetUserId);
    }
  };

  // For non-initiator, add tracks right away
  if (!isInitiator && localStream) {
    console.log('Adding local tracks to peer connection (non-initiator)');
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });
  }

  peers.set(targetUserId, { pc, remoteStream });
  return { pc, remoteStream };
}

export function cleanup() {
  peers.forEach(({ pc }, userId) => {
    pc.close();
    cleanupPeer(userId);
  });
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
}

function cleanupPeer(targetUserId) {
  if (peers.has(targetUserId)) {
    const { pc, remoteStream } = peers.get(targetUserId);
    pc.close();
    remoteStream.getTracks().forEach(track => track.stop());
    peers.delete(targetUserId);
    
    proximityCallbacks.forEach(cb => cb({
      userId: targetUserId,
      hasStream: false
    }));
  }
}