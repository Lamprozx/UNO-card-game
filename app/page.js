'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Users, Zap, Crown, ArrowRight, Clock } from 'lucide-react';

export default function UNOGame() {
  const [screen, setScreen] = useState('home'); // home, lobby, game
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [currentRoomId, setCurrentRoomId] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [colorPicker, setColorPicker] = useState(false);
  const [room, setRoom] = useState(null);
  const [error, setError] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [botCount, setBotCount] = useState(0);
  const [isMatchmaking, setIsMatchmaking] = useState(false);
  const [matchmakingPlayerId, setMatchmakingPlayerId] = useState(null);

  // Polling for game state
  useEffect(() => {
    if (screen === 'game' && currentRoomId && playerId) {
      const interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/game-state?roomId=${currentRoomId}&playerId=${playerId}`);
          const data = await res.json();
          if (data.gameState) {
            setGameState(data.gameState);
          }
        } catch (err) {
          console.error('Failed to fetch game state:', err);
        }
      }, 1500);

      return () => clearInterval(interval);
    }
  }, [screen, currentRoomId, playerId]);

  // Polling for lobby
  useEffect(() => {
    if (screen === 'lobby' && currentRoomId) {
      const interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/room?roomId=${currentRoomId}`);
          const data = await res.json();
          if (data.room) {
            setRoom(data.room);
            if (data.room.gameStarted) {
              setScreen('game');
            }
          }
        } catch (err) {
          console.error('Failed to fetch room:', err);
        }
      }, 1500);

      return () => clearInterval(interval);
    }
  }, [screen, currentRoomId]);

  // Matchmaking polling
  useEffect(() => {
    if (isMatchmaking && matchmakingPlayerId) {
      const interval = setInterval(async () => {
        try {
          const res = await fetch('/api/check-matchmaking', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerId: matchmakingPlayerId })
          });
          const data = await res.json();
          if (data.matched) {
            setCurrentRoomId(data.roomId);
            setPlayerId(data.playerId);
            setIsMatchmaking(false);
            setScreen('game');
          }
        } catch (err) {
          console.error('Matchmaking check failed:', err);
        }
      }, 2000);

      return () => clearInterval(interval);
    }
  }, [isMatchmaking, matchmakingPlayerId]);

  const createRoom = async () => {
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }
    try {
      const res = await fetch('/api/create-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName, maxPlayers })
      });
      const data = await res.json();
      if (data.roomId) {
        setCurrentRoomId(data.roomId);
        setPlayerId(data.playerId);
        setScreen('lobby');
        setError('');
      }
    } catch (err) {
      setError('Failed to create room');
    }
  };

  const joinRoom = async () => {
    if (!playerName.trim() || !roomCode.trim()) {
      setError('Please enter your name and room code');
      return;
    }
    try {
      const res = await fetch('/api/join-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: roomCode.toUpperCase(), playerName })
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else if (data.roomId) {
        setCurrentRoomId(data.roomId);
        setPlayerId(data.playerId);
        setScreen('lobby');
        setError('');
      }
    } catch (err) {
      setError('Failed to join room');
    }
  };

  const startGame = async () => {
    try {
      const res = await fetch('/api/start-game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: currentRoomId, addBots: botCount })
      });
      if (res.ok) {
        setScreen('game');
      }
    } catch (err) {
      setError('Failed to start game');
    }
  };

  const joinMatchmaking = async () => {
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }
    try {
      const res = await fetch('/api/join-matchmaking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName })
      });
      const data = await res.json();
      if (data.matched) {
        setCurrentRoomId(data.roomId);
        setPlayerId(data.playerId);
        setScreen('game');
      } else {
        setMatchmakingPlayerId(data.playerId);
        setIsMatchmaking(true);
      }
    } catch (err) {
      setError('Failed to join matchmaking');
    }
  };

  const cancelMatchmaking = async () => {
    if (matchmakingPlayerId) {
      await fetch('/api/leave-matchmaking', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: matchmakingPlayerId })
      });
    }
    setIsMatchmaking(false);
    setMatchmakingPlayerId(null);
  };

  const playCard = async (cardIndex) => {
    const card = gameState.players.find(p => p.id === playerId)?.hand[cardIndex];
    if (card?.type === 'wild') {
      setSelectedCard(cardIndex);
      setColorPicker(true);
      return;
    }

    try {
      const res = await fetch('/api/play-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: currentRoomId, playerId, cardIndex })
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to play card');
    }
  };

  const playWildCard = async (color) => {
    try {
      const res = await fetch('/api/play-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          roomId: currentRoomId, 
          playerId, 
          cardIndex: selectedCard,
          chosenColor: color
        })
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      }
      setColorPicker(false);
      setSelectedCard(null);
    } catch (err) {
      setError('Failed to play card');
    }
  };

  const drawCard = async () => {
    try {
      const res = await fetch('/api/draw-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: currentRoomId, playerId })
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to draw card');
    }
  };

  const callUNO = async () => {
    await fetch('/api/call-uno', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: currentRoomId, playerId })
    });
  };

  const getCardColor = (card) => {
    const colors = {
      red: 'bg-red-500',
      blue: 'bg-blue-500',
      green: 'bg-green-500',
      yellow: 'bg-yellow-400',
      wild: 'bg-gradient-to-br from-red-500 via-blue-500 to-green-500'
    };
    return colors[card.color] || 'bg-gray-500';
  };

  const getCardDisplay = (card) => {
    if (card.type === 'number') return card.value;
    if (card.value === 'skip') return '🚫';
    if (card.value === 'reverse') return '🔄';
    if (card.value === 'draw2') return '+2';
    if (card.value === 'wild') return '🌈';
    if (card.value === 'draw4') return '+4';
    return '?';
  };

  // Home Screen
  if (screen === 'home' && !isMatchmaking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 flex items-center justify-center p-4">
        <div className="max-w-4xl w-full">
          <div className="text-center mb-8">
            <h1 className="text-7xl font-black text-white mb-4 drop-shadow-2xl">
              UNO
            </h1>
            <p className="text-xl text-white/90">Online Multiplayer Card Game</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <Card className="hover:shadow-2xl transition-shadow">
              <CardHeader>
                <Crown className="w-12 h-12 text-yellow-500 mb-2" />
                <CardTitle>Create Room</CardTitle>
                <CardDescription>Host a game with friends</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  placeholder="Your name"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && createRoom()}
                />
                <div>
                  <label className="text-sm text-gray-600 mb-2 block">Max Players: {maxPlayers}</label>
                  <input
                    type="range"
                    min="2"
                    max="10"
                    value={maxPlayers}
                    onChange={(e) => setMaxPlayers(parseInt(e.target.value))}
                    className="w-full"
                  />
                </div>
                <Button onClick={createRoom} className="w-full" size="lg">
                  Create Room
                </Button>
              </CardContent>
            </Card>

            <Card className="hover:shadow-2xl transition-shadow">
              <CardHeader>
                <Users className="w-12 h-12 text-blue-500 mb-2" />
                <CardTitle>Join Room</CardTitle>
                <CardDescription>Enter a room code</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  placeholder="Your name"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                />
                <Input
                  placeholder="Room code"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  onKeyPress={(e) => e.key === 'Enter' && joinRoom()}
                  maxLength={6}
                />
                <Button onClick={joinRoom} className="w-full" size="lg">
                  Join Room
                </Button>
              </CardContent>
            </Card>

            <Card className="hover:shadow-2xl transition-shadow">
              <CardHeader>
                <Zap className="w-12 h-12 text-purple-500 mb-2" />
                <CardTitle>Quick Match</CardTitle>
                <CardDescription>Find a game instantly</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  placeholder="Your name"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && joinMatchmaking()}
                />
                <div className="h-[52px]"></div>
                <Button onClick={joinMatchmaking} className="w-full" size="lg" variant="default">
                  Quick Match <ArrowRight className="ml-2" />
                </Button>
              </CardContent>
            </Card>
          </div>

          {error && (
            <div className="mt-6 p-4 bg-red-100 border border-red-400 rounded-lg flex items-center gap-2 text-red-700">
              <AlertCircle className="w-5 h-5" />
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Matchmaking Screen
  if (isMatchmaking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-center">Finding Players...</CardTitle>
            <CardDescription className="text-center">Please wait while we match you with other players</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex justify-center">
              <Clock className="w-16 h-16 text-blue-500 animate-pulse" />
            </div>
            <div className="text-center text-gray-600">
              <p className="font-semibold">{playerName}</p>
              <p className="text-sm">Searching for opponents...</p>
            </div>
            <Button onClick={cancelMatchmaking} variant="outline" className="w-full">
              Cancel
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Lobby Screen
  if (screen === 'lobby') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 flex items-center justify-center p-4">
        <Card className="max-w-2xl w-full">
          <CardHeader>
            <CardTitle>Game Lobby</CardTitle>
            <CardDescription>
              Room Code: <span className="font-mono font-bold text-2xl text-blue-600">{currentRoomId}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="font-semibold mb-3">Players ({room?.players?.length || 0}/{room?.maxPlayers || 10})</h3>
              <div className="space-y-2">
                {room?.players?.map((player, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-gray-100 rounded-lg">
                    <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">
                      {player.name[0].toUpperCase()}
                    </div>
                    <span className="font-semibold">{player.name}</span>
                    {idx === 0 && <Badge variant="default">Host</Badge>}
                  </div>
                ))}
              </div>
            </div>

            {room?.players?.[0]?.name === playerName && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-semibold mb-2 block">Add AI Bots: {botCount}</label>
                  <input
                    type="range"
                    min="0"
                    max={Math.min(5, (room?.maxPlayers || 10) - (room?.players?.length || 0))}
                    value={botCount}
                    onChange={(e) => setBotCount(parseInt(e.target.value))}
                    className="w-full"
                  />
                </div>
                <Button onClick={startGame} className="w-full" size="lg">
                  Start Game
                </Button>
              </div>
            )}

            {room?.players?.[0]?.name !== playerName && (
              <div className="text-center text-gray-600">
                <p>Waiting for host to start the game...</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Game Screen
  if (screen === 'game' && gameState) {
    const myPlayer = gameState.players.find(p => p.id === playerId);
    const isMyTurn = gameState.currentPlayer === myPlayer?.name;

    return (
      <div className="min-h-screen bg-gradient-to-br from-green-700 via-green-600 to-green-500 p-4">
        {/* Color Picker Modal */}
        {colorPicker && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <Card className="max-w-md w-full">
              <CardHeader>
                <CardTitle>Choose a Color</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  {['red', 'blue', 'green', 'yellow'].map(color => (
                    <button
                      key={color}
                      onClick={() => playWildCard(color)}
                      className={`h-24 rounded-lg ${getCardColor({ color })} hover:scale-105 transition-transform font-bold text-white text-xl capitalize shadow-lg`}
                    >
                      {color}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="max-w-7xl mx-auto">
          {/* Game Over */}
          {gameState.gameOver && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-40">
              <Card className="max-w-md w-full">
                <CardHeader>
                  <CardTitle className="text-3xl text-center">🎉 Game Over! 🎉</CardTitle>
                </CardHeader>
                <CardContent className="text-center space-y-4">
                  <p className="text-2xl font-bold">{gameState.winner} wins!</p>
                  <Button onClick={() => window.location.reload()} className="w-full" size="lg">
                    Play Again
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Top Info */}
          <div className="mb-6 bg-white/90 rounded-lg p-4 shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-2xl font-bold">Room: {currentRoomId}</h2>
                <p className="text-sm text-gray-600">{gameState.lastAction}</p>
              </div>
              <div className="text-right">
                <Badge variant={isMyTurn ? 'default' : 'secondary'} className="text-lg px-4 py-2">
                  {isMyTurn ? '🎯 Your Turn!' : `${gameState.currentPlayer}'s Turn`}
                </Badge>
              </div>
            </div>

            {/* Other Players */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {gameState.players.filter(p => p.id !== playerId).map((player, idx) => (
                <div key={idx} className="bg-gray-100 rounded-lg p-3 flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                    {player.name[0]}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{player.name}</p>
                    <p className="text-xs text-gray-600">{player.cardCount} cards</p>
                  </div>
                  {player.hasCalledUNO && <Badge variant="destructive" className="text-xs">UNO!</Badge>}
                  {player.isBot && <Badge variant="outline" className="text-xs">Bot</Badge>}
                </div>
              ))}
            </div>
          </div>

          {/* Game Board */}
          <div className="mb-6 flex justify-center items-center gap-8">
            {/* Draw Pile */}
            <div className="text-center">
              <button
                onClick={drawCard}
                disabled={!isMyTurn}
                className="w-32 h-48 bg-gray-800 rounded-xl flex items-center justify-center text-white text-4xl font-bold hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed shadow-2xl"
              >
                🎴
              </button>
              <p className="mt-2 text-white font-semibold">{gameState.deckCount} cards</p>
            </div>

            {/* Discard Pile */}
            <div className="text-center">
              <div className={`w-32 h-48 ${getCardColor(gameState.topCard)} rounded-xl flex items-center justify-center text-white text-6xl font-black shadow-2xl border-4 border-white`}>
                {getCardDisplay(gameState.topCard)}
              </div>
              <p className="mt-2 text-white font-semibold">Current: {gameState.currentColor}</p>
              {gameState.drawCount > 0 && (
                <Badge variant="destructive" className="mt-1">Draw {gameState.drawCount}!</Badge>
              )}
            </div>
          </div>

          {/* Your Hand */}
          <div className="bg-white/90 rounded-lg p-4 shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-xl">Your Cards ({myPlayer?.hand?.length || 0})</h3>
              {myPlayer?.hand?.length === 1 && !myPlayer?.hasCalledUNO && (
                <Button onClick={callUNO} variant="destructive" size="sm">
                  Call UNO!
                </Button>
              )}
              {myPlayer?.hasCalledUNO && <Badge variant="destructive">UNO!</Badge>}
            </div>
            <div className="flex gap-3 overflow-x-auto pb-4">
              {myPlayer?.hand?.map((card, idx) => (
                <button
                  key={idx}
                  onClick={() => isMyTurn && playCard(idx)}
                  disabled={!isMyTurn}
                  className={`min-w-[100px] h-36 ${getCardColor(card)} rounded-xl flex items-center justify-center text-white text-4xl font-black hover:scale-110 hover:-translate-y-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg`}
                >
                  {getCardDisplay(card)}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-100 border border-red-400 rounded-lg flex items-center gap-2 text-red-700">
              <AlertCircle className="w-5 h-5" />
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 flex items-center justify-center">
      <div className="text-white text-2xl">Loading...</div>
    </div>
  );
}