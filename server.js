import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import {
  dealInitialState,
  drawCard,
  throwCard,
  captureCards,
  stealCard,
  advanceTurn,
  getResults,
  isGameOver,
  sweepRemainingTableCards,
} from "./lib/gameEngine.ts";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = process.env.PORT || 3000;
const MAX_PLAYERS = 4;

const rooms = new Map();
let io;

function sanitizeGameStateForPlayer(gameState, viewerId, roomId) {
  if (!gameState) return null;

  // Preserve deck length whether gameState contains the raw deck array or a pre-calculated deckCount
  const count = Array.isArray(gameState.deck)
    ? gameState.deck.length
    : (gameState.deckCount ?? 0);

  return {
    roomId: roomId || null,
    players: gameState.players || [],
    turnIndex: gameState.turnIndex ?? 0,
    table: gameState.table || [],
    captureStacks: gameState.captureStacks || {},
    lastCapturerId: gameState.lastCapturerId || null,
    deckCount: count,
    hands: viewerId && gameState.hands ? { [viewerId]: gameState.hands[viewerId] || [] } : {},
  };
}
function broadcastRoomGameState(roomId, room) {
  if (!room || !room.gameState) return;

  for (const socketId of room.players) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      const visibleState = sanitizeGameStateForPlayer(room.gameState, socketId, roomId);
      socket.emit("game_state", visibleState);
    }
  }
}

// Helper to update state safely, optionally advance turn, check game over, and broadcast
function processGameAction(
  roomId,
  room,
  result,
  callback,
  socketId,
  shouldAdvanceTurn = false,
  shouldDrawAfterCapture = false
) {
  if (!result || result.success === false) {
    return callback?.(result || { success: false, error: "Action failed" });
  }

  // Extract inner state if returned inside an ActionResult envelope
  let nextState = result.state ? result.state : result;

  if (!nextState.deck && room.gameState?.deck) {
    nextState.deck = room.gameState.deck;
  }

  if (shouldDrawAfterCapture) {
    const drawResult = drawCard(nextState, socketId);
    if (drawResult.success) {
      nextState = drawResult.state;
    } else if (drawResult.error !== "Deck is empty") {
      return callback?.(drawResult);
    }
  }

  if (shouldAdvanceTurn) {
    const turnResult = advanceTurn(nextState);
    if (!turnResult.success) {
      return callback?.(turnResult);
    }
    nextState = turnResult.state;
  }

  // Check for game over
  if (isGameOver(nextState)) {
    const sweepResult = sweepRemainingTableCards(nextState);
    if (!sweepResult.success) {
      return callback?.(sweepResult);
    }
    nextState = sweepResult.state;
  }

  room.gameState = nextState;
  room.turnIndex = nextState.turnIndex ?? room.turnIndex;

  broadcastRoomGameState(roomId, room);

  callback?.({
    success: true,
    gameState: sanitizeGameStateForPlayer(room.gameState, socketId, roomId),
  });
}

// Helper to migrate player references when socket reconnects
function migratePlayerSocket(room, oldSocketId, newSocketId) {
  const playerIdx = room.players.indexOf(oldSocketId);
  if (playerIdx !== -1) {
    room.players[playerIdx] = newSocketId;
  }

  if (room.gameState) {
    if (room.gameState.players) {
      const gsIdx = room.gameState.players.indexOf(oldSocketId);
      if (gsIdx !== -1) room.gameState.players[gsIdx] = newSocketId;
    }

    if (room.gameState.hands && room.gameState.hands[oldSocketId]) {
      room.gameState.hands[newSocketId] = room.gameState.hands[oldSocketId];
      delete room.gameState.hands[oldSocketId];
    }

    if (room.gameState.captureStacks && room.gameState.captureStacks[oldSocketId]) {
      room.gameState.captureStacks[newSocketId] = room.gameState.captureStacks[oldSocketId];
      delete room.gameState.captureStacks[oldSocketId];
    }

    if (room.gameState.lastCapturerId === oldSocketId) {
      room.gameState.lastCapturerId = newSocketId;
    }
  }

  if (room.playerTokens) {
    for (const [token, playerId] of Object.entries(room.playerTokens)) {
      if (playerId === oldSocketId) room.playerTokens[token] = newSocketId;
    }
  }
}

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(handler);
  io = new Server(httpServer);

  io.on("connection", (socket) => {
    console.log("Connected:", socket.id);

    socket.on("client", (message) => {
      io.emit("receive-message", { senderId: socket.id, message });
    });

    // --- Join / Create / Rejoin Room ---
    socket.on("roomid", (roomDetails) => {
      const roomcode = typeof roomDetails === "object" ? roomDetails.roomcode : roomDetails;
      const reconnectToken = typeof roomDetails === "object" ? roomDetails.reconnectToken : null;
      const num = Number(roomcode);
      if (!Number.isInteger(num) || num <= 0) {
        return socket.emit("join-success", { success: false, message: "Invalid room code" });
      }

      const roomId = String(num);
      let room = rooms.get(roomId);

      if (!room) {
        room = { players: [], playerTokens: {}, turnIndex: 0, started: false };
        rooms.set(roomId, room);
      }
      room.playerTokens ||= {};

      socket.join(roomId);
      socket.data.roomId = roomId;

      // Handle re-joining an in-progress game
      if (room.started) {
        const tokenPlayerId = reconnectToken ? room.playerTokens?.[reconnectToken] : null;
        const stalePlayerId = tokenPlayerId || room.players.find((id) => !io.sockets.sockets.has(id));
        if (stalePlayerId) {
          migratePlayerSocket(room, stalePlayerId, socket.id);
          if (reconnectToken) room.playerTokens[reconnectToken] = socket.id;
          socket.emit("join-success", {
            success: true,
            message: `Reconnected to room: ${roomId}`,
            roomcode: roomId,
          });
          broadcastRoomGameState(roomId, room);
          return;
        }

        if (room.players.includes(socket.id)) {
          socket.emit("join-success", { success: true, message: "Already in room", roomcode: roomId });
          broadcastRoomGameState(roomId, room);
          return;
        }

        return socket.emit("join-success", { success: false, message: "Game already in progress" });
      }

      if (room.players.length >= MAX_PLAYERS) {
        return socket.emit("join-success", { success: false, message: "Room is full" });
      }

      if (!room.players.includes(socket.id)) {
        room.players.push(socket.id);
      }

      const isNewRoom = room.players.length === 1;
      socket.emit("join-success", {
        success: true,
        message: isNewRoom ? `Created and joined room: ${roomId}` : `Joined room: ${roomId}`,
        roomcode: roomId,
      });

      const playerCount = room.players.length;
      const isFull = playerCount === MAX_PLAYERS;

      if (isFull) {
        room.started = true;
        room.gameState = dealInitialState(room.players);
        room.turnIndex = room.gameState.turnIndex ?? 0;

        io.to(roomId).emit("game_start", {
          players: playerCount,
          message: `Room full! Starting game with ${playerCount} players.`,
        });

        broadcastRoomGameState(roomId, room);
      } else {
        io.to(roomId).emit("waiting", {
          players: playerCount,
          message: `${playerCount}/${MAX_PLAYERS} players in room`,
        });
      }

      io.to(roomId).emit("roomdata", room.players);
    });

    socket.on("room:sync", (callback) => {
      const roomId = socket.data.roomId;
      const room = roomId ? rooms.get(roomId) : null;

      if (!room) {
        return callback?.({ success: false, error: "Not in a room" });
      }

      callback?.({
        success: true,
        roomId,
        players: room.players,
        started: Boolean(room.started),
        gameState: room.gameState ? sanitizeGameStateForPlayer(room.gameState, socket.id, roomId) : null,
      });
    });

    // --- Game Actions ---
    socket.on("game:draw", (callback) => {
      const roomId = socket.data.roomId;
      const room = roomId ? rooms.get(roomId) : null;

      if (!room || !room.gameState) {
        return callback?.({ success: false, error: "Game has not started" });
      }

      const result = drawCard(room.gameState, socket.id);
      processGameAction(roomId, room, result, callback, socket.id, false);
    });

    socket.on("game:throw", (cardId, callback) => {
      const roomId = socket.data.roomId;
      const room = roomId ? rooms.get(roomId) : null;

      if (!room || !room.gameState) {
        return callback?.({ success: false, error: "Game has not started" });
      }

      const result = throwCard(room.gameState, socket.id, cardId);
      processGameAction(roomId, room, result, callback, socket.id, true);
    });

    socket.on("game:capture", (cardId, callback) => {
      const roomId = socket.data.roomId;
      const room = roomId ? rooms.get(roomId) : null;

      if (!room || !room.gameState) {
        return callback?.({ success: false, error: "Game has not started" });
      }

      const result = captureCards(room.gameState, socket.id, cardId);
      processGameAction(roomId, room, result, callback, socket.id, false, true);
    });

    socket.on("game:steal", (cardId, targetPlayerId, callback) => {
      const roomId = socket.data.roomId;
      const room = roomId ? rooms.get(roomId) : null;

      if (!room || !room.gameState) {
        return callback?.({ success: false, error: "Game has not started" });
      }

      const result = stealCard(room.gameState, socket.id, cardId, targetPlayerId);
      processGameAction(roomId, room, result, callback, socket.id, true, true);
    });

    socket.on("game:get_results", (callback) => {
      const roomId = socket.data.roomId;
      const room = roomId ? rooms.get(roomId) : null;

      if (!room || !room.gameState) {
        return callback?.({ success: false, error: "Game has not started" });
      }

      const result = getResults(room.gameState);
      callback?.({ success: true, results: result });
    });

    // --- Disconnect Cleanup ---
    socket.on("disconnect", () => {
      console.log("Disconnected:", socket.id);

      const roomId = socket.data.roomId;
      if (!roomId) return;

      const room = rooms.get(roomId);
      if (!room) return;

      if (room.started) {
        io.to(roomId).emit("player-disconnected", { playerId: socket.id });
        return;
      }

      const leavingIndex = room.players.indexOf(socket.id);
      if (leavingIndex === -1) return;

      room.players.splice(leavingIndex, 1);

      if (room.players.length === 0) {
        rooms.delete(roomId);
        return;
      }

      if (leavingIndex <= room.turnIndex) {
        room.turnIndex = room.turnIndex % room.players.length;
      }

      io.to(roomId).emit("player-left", {
        playerId: socket.id,
        players: room.players.length,
        nextPlayerId: room.players[room.turnIndex],
      });
      io.to(roomId).emit("roomdata", room.players);
    });
  });

  httpServer
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(3000, '0.0.0.0', 2048, () => {
  console.log('Server ready');
});
});