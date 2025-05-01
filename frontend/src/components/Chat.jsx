import React, { useState, useEffect, useRef } from 'react';
import { sendChatMessage, socket } from '../services/socket';

const Chat = ({ roomId, userId, username }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const handleChatMessage = (message) => {
      setMessages(prev => [...prev, message]);
      scrollToBottom();
    };

      socket.on('chat-message', handleChatMessage);
    
    return () => {
      socket.off('chat-message', handleChatMessage);
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const messageData = {
      senderId: userId,
      senderName: username,
      text: newMessage,
      timestamp: new Date().toISOString()
    };

    sendChatMessage(roomId, messageData);
    setNewMessage('');
  };

  return (
    <div className="chat-container">
      <div className="chat-messages">
        {messages.map((msg, index) => (
          <div 
            key={index} 
            className={`message ${msg.senderId === userId ? 'own-message' : ''}`}
          >
            <div className="message-header">
              <span className="sender">{msg.senderName}</span>
              <span className="timestamp">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div className="message-text">{msg.text}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      
      <form onSubmit={handleSendMessage} className="chat-input">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder="Type a message..."
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
};

export default Chat;