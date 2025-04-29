
import { socket } from './socket';

const PROXIMITY_THRESHOLD = 150;
const PEER_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};


const peers = new Map();
let localStream = null;
let userId = null;
let proximityCallbacks = [];


export function onProximityChange(cb) {
  proximityCallbacks.push(cb);
}

export function checkProximity(otherUserId, otherPosition, myPosition) {
  const dx = otherPosition.x - myPosition.x;
  const dy = otherPosition.y - myPosition.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const isInProximity = distance <= PROXIMITY_THRESHOLD;

  proximityCallbacks.forEach(callback => {
    callback({
      userId: otherUserId,
      inProximity: isInProximity,
      distance
    });
  });

  return isInProximity;
}

export async function initWebRTC(currentUserId) {
  userId = currentUserId;
  
  // Get local media first
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });

  // Set up signaling handler
  socket.addEventListener('message', handleSignal);

  return localStream;
}

export async function startCall(targetUserId) {
  const pc = createPeerConnection(targetUserId, true);
  
  // Add tracks AFTER creating offer (better compatibility)
  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream);
  });

  // Explicitly create offer
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  
  sendSignal(targetUserId, {
    type: 'offer',
    sdp: pc.localDescription
  });
}

function createPeerConnection(targetUserId, isInitiator) {
  if (peers.has(targetUserId)) {
    return peers.get(targetUserId);
  }

  const pc = new RTCPeerConnection(PEER_CONFIG);
  peers.set(targetUserId, pc);

  // Track remote streams
  pc.ontrack = ({ streams: [stream] }) => {
    proximityCallbacks.forEach(cb => cb({
      userId: targetUserId,
      hasStream: true,
      stream
    }));
  };

  // ICE Candidate handling
  pc.onicecandidate = ({ candidate }) => {
    if (candidate) {
      sendSignal(targetUserId, {
        type: 'iceCandidate',
        candidate
      });
    }
  };

  // Handle renegotiation
  pc.onnegotiationneeded = async () => {
    if (isInitiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal(targetUserId, {
        type: 'offer',
        sdp: pc.localDescription
      });
    }
  };

  // Handle connection state
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'disconnected') {
      cleanupPeer(targetUserId);
    }
  };

  return pc;
}

async function handleSignal(event) {
  const { sourceUserId, type, sdp, candidate } = JSON.parse(event.data);
  
  if (!peers.has(sourceUserId)) {
    createPeerConnection(sourceUserId, false);
  }
  const pc = peers.get(sourceUserId);

  try {
    switch (type) {
      case 'offer':
        await pc.setRemoteDescription(sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal(sourceUserId, {
          type: 'answer',
          sdp: pc.localDescription
        });
        break;

      case 'answer':
        await pc.setRemoteDescription(sdp);
        break;

      case 'iceCandidate':
        if (candidate) {
          await pc.addIceCandidate(candidate);
        }
        break;
    }
  } catch (err) {
    console.error('Signal handling failed:', err);
    cleanupPeer(sourceUserId);
  }
}

function sendSignal(targetUserId, data) {
  socket.send(JSON.stringify({
    targetUserId,
    sourceUserId: userId,
    ...data
  }));
}

export function cleanup() {
  peers.forEach((pc, userId) => cleanupPeer(userId));
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
}

function cleanupPeer(targetUserId) {
  if (peers.has(targetUserId)) {
    const pc = peers.get(targetUserId);
    pc.close();
    peers.delete(targetUserId);
    
    proximityCallbacks.forEach(cb => cb({
      userId: targetUserId,
      hasStream: false
    }));
  }
}