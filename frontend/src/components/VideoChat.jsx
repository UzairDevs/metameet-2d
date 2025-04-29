import React, { useEffect, useRef, useState } from 'react';
import { onProximityChange, startCall, cleanup, initWebRTC } from '../services/webrtc';

const VideoChat = ({ userId, participants }) => {
  const [remoteStreams, setRemoteStreams] = useState({});
  const [proximityUsers, setProximityUsers] = useState({});
  const localVideoRef = useRef(null);

  // 1️⃣ Initialize WebRTC with local stream
  useEffect(() => {
    const initialize = async () => {
      try {
        const stream = await initWebRTC(userId);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error('WebRTC initialization failed:', error);
      }
    };
    
    initialize();
    
    return () => {
      cleanup(); // Cleanup all connections on unmount
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
    };
  }, [userId]);

  // 2️⃣ Handle proximity and remote stream changes
  useEffect(() => {
    const handleProximityEvent = ({ userId: otherUserId, inProximity, hasStream, stream }) => {
      // Update proximity users
      setProximityUsers(prev => ({
        ...prev,
        [otherUserId]: inProximity
      }));

      // Update remote streams
      setRemoteStreams(prev => {
        const updated = { ...prev };
        if (hasStream && stream) {
          updated[otherUserId] = stream;
        } else {
          delete updated[otherUserId];
        }
        return updated;
      });
    };

    const removeListener = onProximityChange(handleProximityEvent);
    return removeListener;
  }, []);

  // 3️⃣ Render remote videos dynamically
  const renderRemoteVideos = () => {
    return Object.entries(remoteStreams).map(([userId, stream]) => (
      <div key={userId} className="remote-video-container">
        <video
          autoPlay
          playsInline
          ref={ref => ref && (ref.srcObject = stream)}
          className="remote-video"
        />
        <div className="username">
          {participants[userId]?.username || 'User ' + userId.slice(0, 6)}
        </div>
      </div>
    ));
  };

  // 4️⃣ Start call with specific user
  const handleStartCall = async (targetUserId) => {
    try {
      await startCall(targetUserId);
    } catch (error) {
      console.error('Call failed to start:', error);
    }
  };

  return (
    <div className="video-chat-container">
      {/* Local Video Preview */}
      <div className="local-video-container">
        <video 
          ref={localVideoRef} 
          autoPlay 
          muted 
          playsInline 
          className="local-video"
        />
        <div className="username-label">You ({userId.slice(0, 6)})</div>
      </div>

      {/* Remote Videos */}
      {Object.keys(remoteStreams).length > 0 && (
        <div className="remote-videos-wrapper">
          <h3 className="connected-title">Connected with:</h3>
          <div className="remote-videos">
            {renderRemoteVideos()}
          </div>
          <button 
            className="end-all-button"
            onClick={() => {
              cleanup();
              setRemoteStreams({});
            }}
          >
            End All Calls
          </button>
        </div>
      )}

      {/* Proximity List */}
      {Object.keys(proximityUsers).length > 0 && 
       Object.keys(remoteStreams).length === 0 && (
        <div className="proximity-list">
          <h3 className="proximity-title">Nearby Players:</h3>
          {Object.keys(proximityUsers).map(id => (
            <button
              key={id}
              className="start-call-button"
              onClick={() => handleStartCall(id)}
            >
              Call {participants[id]?.username || id.slice(0, 6)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default VideoChat;