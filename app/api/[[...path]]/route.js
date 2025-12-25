import { MongoClient, ObjectId } from 'mongodb';
import { NextResponse } from 'next/server';

const uri = process.env.MONGO_URL;
let client;
let db;

async function connectDB() {
  if (!client) {
    client = new MongoClient(uri);
    await client.connect();
    db = client.db('uno_game');
  }
  return db;
}

// UNO Game Engine
class UNOGame {
  constructor(roomId, playerNames, maxPlayers = 10) {
    this.roomId = roomId;
    this.maxPlayers = maxPlayers;
    this.deck = [];
    this.discardPile = [];
    this.players = playerNames.map((name, index) => ({
      id: `player_${index}`,
      name,
      hand: [],
      isBot: false,
      hasCalledUNO: false
    }));
    this.currentPlayerIndex = 0;
    this.direction = 1; // 1 for clockwise, -1 for counter-clockwise
    this.currentColor = null;
    this.gameStarted = false;
    this.gameOver = false;
    this.winner = null;
    this.drawCount = 0; // For stacking Draw 2 and Draw 4
    this.lastAction = null;
  }

  initializeDeck() {
    const colors = ['red', 'blue', 'green', 'yellow'];
    const numbers = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    const actions = ['skip', 'reverse', 'draw2'];

    // Add number cards
    colors.forEach(color => {
      // One 0 card per color
      this.deck.push({ type: 'number', color, value: '0' });
      // Two of each 1-9
      for (let i = 1; i <= 9; i++) {
        this.deck.push({ type: 'number', color, value: i.toString() });
        this.deck.push({ type: 'number', color, value: i.toString() });
      }
      // Two of each action card per color
      actions.forEach(action => {
        this.deck.push({ type: 'action', color, value: action });
        this.deck.push({ type: 'action', color, value: action });
      });
    });

    // Add wild cards (4 of each)
    for (let i = 0; i < 4; i++) {
      this.deck.push({ type: 'wild', color: 'wild', value: 'wild' });
      this.deck.push({ type: 'wild', color: 'wild', value: 'draw4' });
    }

    this.shuffleDeck();
  }

  shuffleDeck() {
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
    }
  }

  dealCards() {
    // Deal 7 cards to each player
    this.players.forEach(player => {
      for (let i = 0; i < 7; i++) {
        player.hand.push(this.deck.pop());
      }
    });

    // Place first card on discard pile (not an action/wild card)
    let firstCard;
    do {
      firstCard = this.deck.pop();
    } while (firstCard.type !== 'number');
    
    this.discardPile.push(firstCard);
    this.currentColor = firstCard.color;
  }

  startGame() {
    this.initializeDeck();
    this.dealCards();
    this.gameStarted = true;
    this.lastAction = 'Game started!';
  }

  canPlayCard(card, topCard, currentColor) {
    if (card.type === 'wild') return true;
    if (this.drawCount > 0) {
      // Can only play Draw 2 on Draw 2, or Draw 4 on Draw 2/4
      if (card.value === 'draw2' || card.value === 'draw4') return true;
      return false;
    }
    if (card.color === currentColor) return true;
    if (card.value === topCard.value) return true;
    return false;
  }

  playCard(playerId, cardIndex, chosenColor = null) {
    const player = this.players.find(p => p.id === playerId);
    if (!player || this.players[this.currentPlayerIndex].id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    const card = player.hand[cardIndex];
    if (!card) {
      return { success: false, error: 'Invalid card' };
    }

    const topCard = this.discardPile[this.discardPile.length - 1];
    if (!this.canPlayCard(card, topCard, this.currentColor)) {
      return { success: false, error: 'Cannot play this card' };
    }

    // Remove card from hand and add to discard pile
    player.hand.splice(cardIndex, 1);
    this.discardPile.push(card);

    // Reset UNO call if player has more than 1 card after playing
    if (player.hand.length !== 1) {
      player.hasCalledUNO = false;
    }

    // Check for win
    if (player.hand.length === 0) {
      this.gameOver = true;
      this.winner = player.name;
      this.lastAction = `${player.name} wins!`;
      return { success: true, gameOver: true, winner: player.name };
    }

    // Handle special cards
    this.lastAction = `${player.name} played ${card.color} ${card.value}`;
    
    if (card.type === 'wild') {
      this.currentColor = chosenColor || 'red';
      if (card.value === 'draw4') {
        this.drawCount += 4;
        this.lastAction = `${player.name} played Wild Draw 4! Color: ${this.currentColor}`;
      } else {
        this.lastAction = `${player.name} played Wild! Color: ${this.currentColor}`;
      }
    } else {
      this.currentColor = card.color;
      
      if (card.value === 'skip') {
        this.moveToNextPlayer();
        this.lastAction += ' - Next player skipped!';
      } else if (card.value === 'reverse') {
        this.direction *= -1;
        if (this.players.length === 2) {
          // In 2-player game, reverse acts like skip
          this.moveToNextPlayer();
        }
        this.lastAction += ' - Direction reversed!';
      } else if (card.value === 'draw2') {
        this.drawCount += 2;
        this.lastAction += ' - Next player must draw 2!';
      }
    }

    this.moveToNextPlayer();
    return { success: true };
  }

  drawCard(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player || this.players[this.currentPlayerIndex].id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    // Check if deck is empty, reshuffle discard pile
    if (this.deck.length === 0) {
      const topCard = this.discardPile.pop();
      this.deck = [...this.discardPile];
      this.discardPile = [topCard];
      this.shuffleDeck();
    }

    if (this.drawCount > 0) {
      // Player must draw accumulated cards
      const cardsToDraw = this.drawCount;
      for (let i = 0; i < cardsToDraw; i++) {
        if (this.deck.length > 0) {
          player.hand.push(this.deck.pop());
        }
      }
      this.lastAction = `${player.name} drew ${cardsToDraw} cards`;
      this.drawCount = 0;
      this.moveToNextPlayer();
    } else {
      // Normal draw
      const drawnCard = this.deck.pop();
      player.hand.push(drawnCard);
      this.lastAction = `${player.name} drew a card`;
      
      // Auto-move to next player after drawing
      this.moveToNextPlayer();
    }

    return { success: true };
  }

  callUNO(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (player && player.hand.length === 1) {
      player.hasCalledUNO = true;
      this.lastAction = `${player.name} called UNO!`;
      return { success: true };
    }
    return { success: false };
  }

  moveToNextPlayer() {
    this.currentPlayerIndex = (this.currentPlayerIndex + this.direction + this.players.length) % this.players.length;
  }

  getGameState(requestingPlayerId) {
    return {
      roomId: this.roomId,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        cardCount: p.hand.length,
        hand: p.id === requestingPlayerId ? p.hand : [],
        isBot: p.isBot,
        hasCalledUNO: p.hasCalledUNO
      })),
      currentPlayerIndex: this.currentPlayerIndex,
      currentPlayer: this.players[this.currentPlayerIndex].name,
      topCard: this.discardPile[this.discardPile.length - 1],
      currentColor: this.currentColor,
      direction: this.direction,
      gameStarted: this.gameStarted,
      gameOver: this.gameOver,
      winner: this.winner,
      drawCount: this.drawCount,
      lastAction: this.lastAction,
      deckCount: this.deck.length
    };
  }

  // AI Bot Logic
  async botTurn() {
    const currentPlayer = this.players[this.currentPlayerIndex];
    if (!currentPlayer.isBot) return;

    await new Promise(resolve => setTimeout(resolve, 1500)); // Bot "thinks"

    const topCard = this.discardPile[this.discardPile.length - 1];
    
    // Find playable cards
    const playableCards = currentPlayer.hand
      .map((card, index) => ({ card, index }))
      .filter(({ card }) => this.canPlayCard(card, topCard, this.currentColor));

    if (playableCards.length > 0) {
      // Bot strategy: prioritize action cards, then matching color, then matching number
      playableCards.sort((a, b) => {
        if (a.card.type === 'wild') return -1;
        if (b.card.type === 'wild') return 1;
        if (a.card.type === 'action' && b.card.type !== 'action') return -1;
        if (b.card.type === 'action' && a.card.type !== 'action') return 1;
        return 0;
      });

      const { card, index } = playableCards[0];
      const chosenColor = card.type === 'wild' ? this.chooseBotColor(currentPlayer.hand) : null;
      
      // Call UNO if bot will have 1 card left
      if (currentPlayer.hand.length === 2) {
        this.callUNO(currentPlayer.id);
      }
      
      this.playCard(currentPlayer.id, index, chosenColor);
    } else {
      // Draw card
      this.drawCard(currentPlayer.id);
    }
  }

  chooseBotColor(hand) {
    // Count cards by color
    const colorCounts = { red: 0, blue: 0, green: 0, yellow: 0 };
    hand.forEach(card => {
      if (card.color !== 'wild') {
        colorCounts[card.color] = (colorCounts[card.color] || 0) + 1;
      }
    });
    // Choose most common color
    return Object.entries(colorCounts).reduce((a, b) => b[1] > a[1] ? b : a)[0];
  }

  addBot(botName) {
    if (this.players.length >= this.maxPlayers) return false;
    const botId = `bot_${Date.now()}_${Math.random()}`;
    this.players.push({
      id: botId,
      name: botName || `Bot ${this.players.length + 1}`,
      hand: [],
      isBot: true,
      hasCalledUNO: false
    });
    return true;
  }

  // Helper to restore game from database
  static fromDocument(doc) {
    const game = new UNOGame(doc.roomId, [], doc.maxPlayers);
    Object.assign(game, doc);
    return game;
  }
}

// API Routes
export async function GET(request) {
  const { pathname, searchParams } = new URL(request.url);
  const db = await connectDB();

  try {
    if (pathname === '/api/health') {
      return NextResponse.json({ status: 'ok' });
    }

    if (pathname === '/api/rooms') {
      const rooms = await db.collection('rooms').find({ gameStarted: false }).toArray();
      return NextResponse.json({ rooms });
    }

    if (pathname === '/api/room') {
      const roomId = searchParams.get('roomId');
      const room = await db.collection('rooms').findOne({ roomId });
      if (!room) {
        return NextResponse.json({ error: 'Room not found' }, { status: 404 });
      }
      return NextResponse.json({ room });
    }

    if (pathname === '/api/game-state') {
      const roomId = searchParams.get('roomId');
      const playerId = searchParams.get('playerId');
      
      const gameDoc = await db.collection('games').findOne({ roomId });
      if (!gameDoc) {
        return NextResponse.json({ error: 'Game not found' }, { status: 404 });
      }

      const game = UNOGame.fromDocument(gameDoc);
      const gameState = game.getGameState(playerId);
      
      return NextResponse.json({ gameState });
    }

    if (pathname === '/api/matchmaking-queue') {
      const queue = await db.collection('matchmaking').find({}).toArray();
      return NextResponse.json({ queueLength: queue.length });
    }

    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const { pathname } = new URL(request.url);
  const db = await connectDB();

  try {
    const body = await request.json();

    if (pathname === '/api/create-room') {
      const { playerName, maxPlayers } = body;
      const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      const playerId = `player_0`;

      const room = {
        roomId,
        hostName: playerName,
        players: [{ name: playerName, id: playerId }],
        maxPlayers: maxPlayers || 4,
        gameStarted: false,
        createdAt: new Date()
      };

      await db.collection('rooms').insertOne(room);
      return NextResponse.json({ roomId, playerId });
    }

    if (pathname === '/api/join-room') {
      const { roomId, playerName } = body;
      
      const room = await db.collection('rooms').findOne({ roomId });
      if (!room) {
        return NextResponse.json({ error: 'Room not found' }, { status: 404 });
      }

      if (room.gameStarted) {
        return NextResponse.json({ error: 'Game already started' }, { status: 400 });
      }

      if (room.players.length >= room.maxPlayers) {
        return NextResponse.json({ error: 'Room is full' }, { status: 400 });
      }

      const playerId = `player_${room.players.length}`;
      room.players.push({ name: playerName, id: playerId });

      await db.collection('rooms').updateOne(
        { roomId },
        { $set: { players: room.players } }
      );

      return NextResponse.json({ roomId, playerId });
    }

    if (pathname === '/api/start-game') {
      const { roomId, addBots } = body;
      
      const room = await db.collection('rooms').findOne({ roomId });
      if (!room) {
        return NextResponse.json({ error: 'Room not found' }, { status: 404 });
      }

      const playerNames = room.players.map(p => p.name);
      const game = new UNOGame(roomId, playerNames, room.maxPlayers);

      // Add bots if requested
      if (addBots) {
        const botsToAdd = Math.min(addBots, room.maxPlayers - game.players.length);
        for (let i = 0; i < botsToAdd; i++) {
          game.addBot(`Bot ${i + 1}`);
          // Give bots cards
          for (let j = 0; j < 7; j++) {
            if (game.deck.length === 0) game.initializeDeck();
          }
        }
      }

      game.startGame();

      // Update room
      await db.collection('rooms').updateOne(
        { roomId },
        { $set: { gameStarted: true } }
      );

      // Save game state
      await db.collection('games').insertOne({
        ...game,
        updatedAt: new Date()
      });

      // Process bot turns if first player is bot
      if (game.players[game.currentPlayerIndex].isBot) {
        await game.botTurn();
        await db.collection('games').replaceOne(
          { roomId },
          { ...game, updatedAt: new Date() }
        );
      }

      return NextResponse.json({ success: true });
    }

    if (pathname === '/api/play-card') {
      const { roomId, playerId, cardIndex, chosenColor } = body;
      
      const gameDoc = await db.collection('games').findOne({ roomId });
      if (!gameDoc) {
        return NextResponse.json({ error: 'Game not found' }, { status: 404 });
      }

      const game = UNOGame.fromDocument(gameDoc);
      const result = game.playCard(playerId, cardIndex, chosenColor);

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      // Update game
      await db.collection('games').replaceOne(
        { roomId },
        { ...game, updatedAt: new Date() }
      );

      // Process bot turns
      while (game.players[game.currentPlayerIndex].isBot && !game.gameOver) {
        await game.botTurn();
        await db.collection('games').replaceOne(
          { roomId },
          { ...game, updatedAt: new Date() }
        );
      }

      return NextResponse.json({ success: true, gameOver: result.gameOver, winner: result.winner });
    }

    if (pathname === '/api/draw-card') {
      const { roomId, playerId } = body;
      
      const gameDoc = await db.collection('games').findOne({ roomId });
      if (!gameDoc) {
        return NextResponse.json({ error: 'Game not found' }, { status: 404 });
      }

      const game = UNOGame.fromDocument(gameDoc);
      const result = game.drawCard(playerId);

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      await db.collection('games').replaceOne(
        { roomId },
        { ...game, updatedAt: new Date() }
      );

      // Process bot turns
      while (game.players[game.currentPlayerIndex].isBot && !game.gameOver) {
        await game.botTurn();
        await db.collection('games').replaceOne(
          { roomId },
          { ...game, updatedAt: new Date() }
        );
      }

      return NextResponse.json({ success: true });
    }

    if (pathname === '/api/call-uno') {
      const { roomId, playerId } = body;
      
      const gameDoc = await db.collection('games').findOne({ roomId });
      if (!gameDoc) {
        return NextResponse.json({ error: 'Game not found' }, { status: 404 });
      }

      const game = UNOGame.fromDocument(gameDoc);
      game.callUNO(playerId);

      await db.collection('games').replaceOne(
        { roomId },
        { ...game, updatedAt: new Date() }
      );

      return NextResponse.json({ success: true });
    }

    if (pathname === '/api/join-matchmaking') {
      const { playerName } = body;
      const playerId = `mm_${Date.now()}_${Math.random()}`;

      await db.collection('matchmaking').insertOne({
        playerId,
        playerName,
        joinedAt: new Date()
      });

      // Check if we have enough players to start a game
      const queue = await db.collection('matchmaking').find({}).sort({ joinedAt: 1 }).toArray();
      
      if (queue.length >= 2) {
        // Create game with first 4 players (or all if less than 4)
        const playersForGame = queue.slice(0, Math.min(4, queue.length));
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        
        const room = {
          roomId,
          hostName: playersForGame[0].playerName,
          players: playersForGame.map((p, idx) => ({ 
            name: p.playerName, 
            id: `player_${idx}` 
          })),
          maxPlayers: 4,
          gameStarted: true,
          createdAt: new Date(),
          isMatchmade: true
        };

        await db.collection('rooms').insertOne(room);

        // Remove players from queue
        await db.collection('matchmaking').deleteMany({
          playerId: { $in: playersForGame.map(p => p.playerId) }
        });

        // Create and start game
        const game = new UNOGame(roomId, room.players.map(p => p.name), 4);
        
        // Add bots to fill to 4 players if needed
        const botsNeeded = 4 - game.players.length;
        for (let i = 0; i < botsNeeded; i++) {
          game.addBot(`Bot ${i + 1}`);
        }
        
        game.startGame();

        await db.collection('games').insertOne({
          ...game,
          updatedAt: new Date()
        });

        // Process bot turn if needed
        if (game.players[game.currentPlayerIndex].isBot) {
          await game.botTurn();
          await db.collection('games').replaceOne(
            { roomId },
            { ...game, updatedAt: new Date() }
          );
        }

        return NextResponse.json({ 
          matched: true, 
          roomId, 
          playerId: room.players.find(p => p.name === playerName)?.id 
        });
      }

      return NextResponse.json({ matched: false, playerId });
    }

    if (pathname === '/api/check-matchmaking') {
      const { playerId } = body;
      
      // Check if player is still in queue
      const inQueue = await db.collection('matchmaking').findOne({ playerId });
      if (!inQueue) {
        // Player has been matched, find their game
        const rooms = await db.collection('rooms').find({ isMatchmade: true }).sort({ createdAt: -1 }).limit(10).toArray();
        
        for (const room of rooms) {
          const player = room.players.find(p => p.name === inQueue?.playerName);
          if (player) {
            return NextResponse.json({ matched: true, roomId: room.roomId, playerId: player.id });
          }
        }
      }

      return NextResponse.json({ matched: false });
    }

    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  const { pathname } = new URL(request.url);
  const db = await connectDB();

  try {
    const body = await request.json();

    if (pathname === '/api/leave-matchmaking') {
      const { playerId } = body;
      await db.collection('matchmaking').deleteOne({ playerId });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}