
import React, { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import GameScene from '../scenes/GameScene';
import { initSocketConnection } from '../services/socket';

const Game = ({ userId, roomId, username }) => {
  const gameRef = useRef(null);
  const gameInstance = useRef(null);

  useEffect(() => {
    
    const socket = initSocketConnection();
    
    
    const config = {
      type: Phaser.AUTO,
      parent: gameRef.current,
      width: 800,
      height: 600,
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { y: 0 },
          debug: false
        }
      },
      scene: [GameScene]
    };
    
    
    if (!gameInstance.current) {
      console.log('Creating new Phaser game');
      gameInstance.current = new Phaser.Game(config);
      
      
      gameInstance.current.events.once('ready', () => {
        console.log('Game ready, starting scene');
        gameInstance.current.scene.start('GameScene', { userId, roomId, username });
      });
    } else {
      console.log('Game already exists, restarting scene');
      gameInstance.current.scene.getScene('GameScene').scene.restart({ userId, roomId, username });
    }
    
    // Clean up on unmount
    return () => {
      console.log('Cleaning up game component');
      if (gameInstance.current) {
        gameInstance.current.destroy(true);
        gameInstance.current = null;
      }
    };
  }, [userId, roomId, username]);

  return (
    <div className="game-container">
      <div ref={gameRef} className="phaser-container" style={{ width: '1000px', height: '700px' }}></div>
    </div>
  );
};

export default Game;