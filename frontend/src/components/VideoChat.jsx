import React, { useEffect, useRef, useState } from 'react';
import { onProximityChange, startCall, cleanup, initWebRTC } from '../services/webrtc';

const VideoChat = ({ userId, participants }) => {
  const [remoteStreams, setRemoteStreams] = useState({});
  const [proximityUsers, setProximityUsers] = useState({});
  const localVideoRef = useRef(null);
  const remoteVideoRefs = useRef({});

  useEffect(() => {
    console.log("VideoChat component mounted with userId:", userId);
    const initialize = async () => {
      try {
        console.log("Initializing WebRTC...");
        const stream = await initWebRTC(userId);
        console.log("WebRTC initialized successfully, setting local stream");
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error('WebRTC initialization failed:', error);
      }
    };
    
    if (userId) {
      initialize();
    }
    
    return () => {
      console.log("VideoChat component unmounting, cleaning up WebRTC");
      cleanup();
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
    };
  }, [userId]);

  useEffect(() => {
    console.log("Setting up proximity event handler");
    
    const handleProximityEvent = (event) => {
      const { userId: otherUserId, inProximity, hasStream, stream } = event;
      console.log('Proximity event:', { otherUserId, inProximity, hasStream });
      
      // Update proximity status (only if specifically included in the event)
      if (inProximity !== undefined) {
        setProximityUsers(prev => ({
          ...prev,
          [otherUserId]: inProximity
        }));
      }

      // Update remote streams (only if hasStream is defined in the event)
      if (hasStream !== undefined) {
        setRemoteStreams(prev => {
          const updated = { ...prev };
          
          if (hasStream && stream) {
            console.log(`Adding/updating stream for ${otherUserId}`);
            updated[otherUserId] = stream;
            
            // Set the stream to the ref if it exists
            if (remoteVideoRefs.current[otherUserId]) {
              console.log(`Setting stream to existing video element for ${otherUserId}`);
              remoteVideoRefs.current[otherUserId].srcObject = stream;
            }
          } else if (hasStream === false) {
            console.log(`Removing stream for ${otherUserId}`);
            delete updated[otherUserId];
            
            // Clean up the video element
            if (remoteVideoRefs.current[otherUserId]) {
              remoteVideoRefs.current[otherUserId].srcObject = null;
            }
          }
          
          return updated;
        });
      }
    };

    const removeListener = onProximityChange(handleProximityEvent);
    return () => {
      console.log("Removing proximity event handler");
      if (typeof removeListener === 'function') {
        removeListener();
      }
    };
  }, []);

  // Update refs when remoteStreams changes
  useEffect(() => {
    console.log("remoteStreams updated:", Object.keys(remoteStreams));
    
    Object.entries(remoteStreams).forEach(([userId, stream]) => {
      if (remoteVideoRefs.current[userId] && !remoteVideoRefs.current[userId].srcObject) {
        console.log(`Setting stream for ${userId} to video element`);
        remoteVideoRefs.current[userId].srcObject = stream;
      }
    });
  }, [remoteStreams]);

  const handleStartCall = async (targetUserId) => {
    try {
      console.log(`Starting call with ${targetUserId}`);
      await startCall(targetUserId);
    } catch (error) {
      console.error('Failed to start call:', error);
    }
  };

  const renderRemoteVideos = () => {
    return Object.keys(remoteStreams).map((remoteUserId) => (
      <div key={remoteUserId} className="remote-video-container">
        <video
          autoPlay
          playsInline
          ref={el => {
            if (el) {
              remoteVideoRefs.current[remoteUserId] = el;
              // Set stream if available
              if (remoteStreams[remoteUserId]) {
                console.log(`Setting stream for ${remoteUserId} in renderRemoteVideos`);
                el.srcObject = remoteStreams[remoteUserId];
              }
            }
          }}
          className="remote-video"
        />
        <div className="username">
          {participants[remoteUserId]?.username || `User ${remoteUserId.slice(0, 6)}`}
        </div>
      </div>
    ));
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
        <div className="username-label">You ({userId ? userId.slice(0, 6) : 'Unknown'})</div>
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
              console.log("Ending all calls");
              cleanup();
              setRemoteStreams({});
            }}
          >
            End All Calls
          </button>
        </div>
      )}

      {Object.keys(proximityUsers).filter(id => proximityUsers[id] && !remoteStreams[id]).length > 0 && (
        <div className="proximity-list">
          <h3 className="proximity-title">Nearby Players:</h3>
          {Object.keys(proximityUsers)
            .filter(id => proximityUsers[id] && !remoteStreams[id]) // Only show users we're not already connected with
            .map(id => (
              <button
                key={id}
                className="start-call-button"
                onClick={() => handleStartCall(id)}
              >
                Call {participants[id]?.username}
              </button>
            ))}
        </div>
      )}
    </div>
  );
};

export default VideoChat;