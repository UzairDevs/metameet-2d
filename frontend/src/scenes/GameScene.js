
import Phaser from 'phaser';
import { socket } from '../services/socket';
import { checkProximity } from '../services/webrtc';

class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
    this.players = {};
    this.playerSpeed = 150;
    this.userId = null;
    this.roomId = null;
    this.cursors = null;
    this.lastPosition = { x: 0, y: 0 };
    this.positionUpdateInterval = null;
  }

  init(data) {
    this.userId = data.userId;
    this.roomId = data.roomId;
    this.username = data.username;
  }

  preload() {
    
    this.load.image('background', '/src/assets/images/background.png');
    this.load.image('player', '/src/assets/images/player.png');
  }

  create() {
    
    const background = this.add.image(0, 0, 'background').setOrigin(0, 0);
    
     
    
    background.displayWidth = this.sys.game.config.width;
    background.displayHeight = this.sys.game.config.height;

    // Create local player
    const startX = Math.floor(Math.random() * 400) + 100;
    const startY = Math.floor(Math.random() * 300) + 100;
    
    this.players[this.userId] = this.add.sprite(startX, startY, 'player');
    this.players[this.userId].setScale(0.5); // Adjust scale as needed
    
    
    this.physics.add.existing(this.players[this.userId]);
    this.players[this.userId].body.setCollideWorldBounds(true);
    
    
    this.cameras.main.startFollow(this.players[this.userId]);
    
    
    this.players[this.userId].nameText = this.add.text(
      startX, 
      startY - 40, 
      this.username, 
      { fontSize: '25px', fill: '#000000' }
    );
    this.players[this.userId].nameText.setOrigin(0.5);
    
  
    this.cursors = this.input.keyboard.createCursorKeys();
    
   
    this.setupSocketHandlers();
    
    
    this.joinRoom(startX, startY);
    
   
    this.positionUpdateInterval = setInterval(() => {
      const player = this.players[this.userId];
      if (player && (this.lastPosition.x !== player.x || this.lastPosition.y !== player.y)) {
        this.emitPosition(player.x, player.y);
        this.lastPosition = { x: player.x, y: player.y };
      }
    }, 100); // Update every 100ms if position changed
  }

  joinRoom(x, y) {
    socket.emit('join-room', {
      roomId: this.roomId,
      userId: this.userId,
      username: this.username,
      position: { x, y }
    });
  }

  setupSocketHandlers() {
    
    socket.on('user-joined', ({ userId, username, position }) => {
      console.log(`User joined: ${username} (${userId})`);
      this.addOtherPlayer(userId, username, position);
    });
    
    socket.on('room-users', ({ participants }) => {
      console.log('Room users received:', participants);
      Object.keys(participants).forEach(id => {
        if (id !== this.userId) {
          const { username, position } = participants[id];
          this.addOtherPlayer(id, username, position);
        }
      });
    });
    
    
    socket.on('user-moved', ({ userId, position }) => {
      if (userId !== this.userId && this.players[userId]) {
        const player = this.players[userId];
        
        
        this.tweens.add({
          targets: player,
          x: position.x,
          y: position.y,
          duration: 100,
          ease: 'Linear'
        });
        
        
        player.nameText.x = position.x;
        player.nameText.y = position.y - 40;
        
        // Check proximity for video chat
        const localPlayer = this.players[this.userId];
        checkProximity(userId, position, { x: localPlayer.x, y: localPlayer.y });
      }
    });
    
   
    socket.on('user-left', ({ userId }) => {
      if (this.players[userId]) {
        this.players[userId].nameText.destroy();
        this.players[userId].destroy();
        delete this.players[userId];
      }
    });
  }

  addOtherPlayer(userId, username, position) {
    
    if (userId === this.userId || this.players[userId]) {
      return;
    }
    
    console.log(`Adding player: ${username} at position:`, position);
    
   
    this.players[userId] = this.add.sprite(position.x, position.y, 'player');
    this.players[userId].setScale(0.5); 
    this.players[userId].setTint(808080); 
    
 
    this.players[userId].nameText = this.add.text(
      position.x, 
      position.y - 60, 
      username, 
      { fontSize: '25px', fill: '#000000' }
    );
    this.players[userId].nameText.setOrigin(0.5);
    
    
    const localPlayer = this.players[this.userId];
    checkProximity(userId, position, { x: localPlayer.x, y: localPlayer.y });
  }

  emitPosition(x, y) {
    socket.emit('position-update', {
      userId: this.userId,
      roomId: this.roomId,
      position: { x, y }
    });
  }

  update() {
    const player = this.players[this.userId];
    
    if (!player || !this.cursors) return;
    
    player.body.setVelocity(0);

    
    if (this.cursors.left.isDown) {
      player.body.setVelocityX(-this.playerSpeed);
    } else if (this.cursors.right.isDown) {
      player.body.setVelocityX(this.playerSpeed);
    }

    if (this.cursors.up.isDown) {
      player.body.setVelocityY(-this.playerSpeed);
    } else if (this.cursors.down.isDown) {
      player.body.setVelocityY(this.playerSpeed);
    }
    
    
    player.nameText.x = player.x;
    player.nameText.y = player.y - 40;
  }

  shutdown() {
    
    clearInterval(this.positionUpdateInterval);
    
   
    socket.off('user-joined');
    socket.off('room-users');
    socket.off('user-moved');
    socket.off('user-left');
  }
}

export default GameScene;