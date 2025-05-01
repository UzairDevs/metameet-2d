import React, { useEffect, useRef, useState } from 'react';
import { onProximityChange, startCall, cleanup, initWebRTC } from '../services/webrtc';

const VideoChat = ({ userId, participants }) => {
  const [remoteStreams, setRemoteStreams] = useState({});
  const [proximityUsers, setProximityUsers] = useState({});
  const localVideoRef = useRef(null);
  const remoteVideoRefs = useRef({});

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
      cleanup();
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
    };
  }, [userId]);

  useEffect(() => {
    const handleProximityEvent = ({ userId: otherUserId, inProximity, hasStream, stream }) => {
      console.log('Proximity event:', { otherUserId, inProximity, hasStream });
      
      // Update proximity status
      setProximityUsers(prev => ({
        ...prev,
        [otherUserId]: inProximity !== false // If not explicitly false, keep as true
      }));

      // Update remote streams
      if (hasStream !== undefined) {
        setRemoteStreams(prev => {
          const updated = { ...prev };
          
          if (hasStream && stream) {
            updated[otherUserId] = stream;
            console.log(`Added stream for ${otherUserId}`);
            
            // Set the stream to the ref if it exists
            if (remoteVideoRefs.current[otherUserId]) {
              remoteVideoRefs.current[otherUserId].srcObject = stream;
            }
          } else if (!hasStream) {
            delete updated[otherUserId];
            console.log(`Removed stream for ${otherUserId}`);
          }
          
          return updated;
        });
      }
    };

    const removeListener = onProximityChange(handleProximityEvent);
    return removeListener;
  }, []);

  // Update refs when remoteStreams changes
  useEffect(() => {
    Object.entries(remoteStreams).forEach(([userId, stream]) => {
      if (remoteVideoRefs.current[userId] && !remoteVideoRefs.current[userId].srcObject) {
        remoteVideoRefs.current[userId].srcObject = stream;
      }
    });
  }, [remoteStreams]);

  const renderRemoteVideos = () => {
    return Object.keys(remoteStreams).map((userId) => (
      <div key={userId} className="remote-video-container">
        <video
          autoPlay
          playsInline
          ref={el => {
            if (el) {
              remoteVideoRefs.current[userId] = el;
              if (remoteStreams[userId]) {
                el.srcObject = remoteStreams[userId];
              }
            }
          }}
          className="remote-video"
        />
        <div className="username">
          {participants[userId]?.username || `User ${userId.slice(0, 6)}`}
        </div>
      </div>
    ));
  };

  const handleStartCall = async (targetUserId) => {
    try {
      console.log(`Starting call with ${targetUserId}`);
      await startCall(targetUserId);
    } catch (error) {
      console.error('Failed to start call:', error);
    }
  };

  return (
    <div className="video-chat-container">
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

      {Object.keys(proximityUsers).filter(id => !remoteStreams[id]).length > 0 && (
        <div className="proximity-list">
          <h3 className="proximity-title">Nearby Players:</h3>
          {Object.keys(proximityUsers)
            .filter(id => !remoteStreams[id]) // Only show users we're not already connected with
            .map(id => (
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