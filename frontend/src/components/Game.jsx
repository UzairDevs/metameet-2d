
import React, { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import GameScene from '../scenes/GameScene';
import { initSocketConnection } from '../services/socket';

const Game = ({ userId, roomId, username }) => {
  const gameRef = useRef(null);
  const gameInstance = useRef(null);

  useEffect(() => {
    initSocketConnection();

    const config = {
      type: Phaser.AUTO,
      parent: gameRef.current,
      width: gameRef.current?.offsetWidth || 1000,
      height: gameRef.current?.offsetHeight || 700,
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { y: 0 },
          debug: false
        }
      },
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH
      },
      // Empty scene list: do NOT let Phaser auto-boot GameScene with no data.
      // We add + start it explicitly below WITH the user/room data, so init()
      // always has a valid userId on its first (and only) run.
      scene: []
    };

    console.log('Creating new Phaser game');
    const game = new Phaser.Game(config);
    gameInstance.current = game;

    // add(key, sceneClass, autoStart=true, data) — starts the scene exactly
    // once, with data, avoiding the data-less auto-start / restart race.
    game.scene.add('GameScene', GameScene, true, { userId, roomId, username });

    // Clean up on unmount
    return () => {
      console.log('Cleaning up game component');
      game.destroy(true);
      gameInstance.current = null;
    };
  }, [userId, roomId, username]);

  return (
    <div className="game-container">
      <div ref={gameRef} className="phaser-container" style={{ width: '1000px', height: '700px' }}></div>
    </div>
  );
};

export default Game;