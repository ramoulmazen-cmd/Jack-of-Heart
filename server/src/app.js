import { randomInt } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import express from 'express';
import { Server } from 'socket.io';
import { Game, GameError } from './game.js';
import { usableAddress } from './network.js';

const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O: they look like 1 and 0
const IDLE_ROOM_MS = 30 * 60 * 1000;
const LAN_CACHE_MS = 15_000;

/**
 * HTTP + Socket.IO wiring around the pure Game class.
 * timeScale shrinks every phase timer (tests use 0.01 so a 3-minute discussion lasts 1.8 s).
 * lanAddresses() lists this device's network addresses, for the "join at" link in the lobby.
 * publicUrl, when the game is hosted online (e.g. https://jack.onrender.com), is the "join at"
 * link instead: a cloud server's own network addresses are private and no phone can reach them.
 */
export function createGameServer({ timeScale = 1, webDir, lanAddresses = () => [], publicUrl = null } = {}) {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, { cors: { origin: '*' } });
  const rooms = new Map(); // code -> { game, sockets: Map<playerId, socketId>, timer, touchedAt }

  // Where other phones can reach this server. The operating system may refuse to tell us
  // (Android does, for Termux), so the address a phone actually used to reach us wins.
  let learned = null;
  let lanCache = { at: 0, list: [] };
  function joinUrl() {
    if (publicUrl) return publicUrl;
    if (Date.now() - lanCache.at > LAN_CACHE_MS) lanCache = { at: Date.now(), list: lanAddresses() };
    const address = learned?.address ?? lanCache.list[0];
    const port = learned?.port ?? httpServer.address()?.port;
    return address && port ? `http://${address}:${port}` : null;
  }

  app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));

  // Mugshots. The URL carries the photo's version, so a phone can cache each one for good.
  app.get('/photo/:code/:playerId', (req, res) => {
    const photo = rooms.get(req.params.code)?.game.photoOf(req.params.playerId);
    if (!photo) return res.status(404).end();
    res.set({
      'Content-Type': photo.type,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    return res.send(photo.bytes);
  });

  if (webDir && existsSync(webDir)) app.use(express.static(webDir));

  function newRoom() {
    let code;
    do {
      code = Array.from({ length: 4 }, () => CODE_LETTERS[randomInt(CODE_LETTERS.length)]).join('');
    } while (rooms.has(code));
    return { game: new Game(code, { timeScale }), sockets: new Map(), timer: null, touchedAt: Date.now() };
  }

  // A room-wide io.to(code).emit() would send everyone the same payload.
  // Hidden information means every player gets their own view, one emit each.
  function broadcast(room) {
    const join = joinUrl();
    for (const [playerId, socketId] of room.sockets) {
      io.to(socketId).emit('state', { ...room.game.viewFor(playerId), joinUrl: join });
    }
  }

  // When only one player's view changed, only they hear about it. A message to everyone
  // would itself be a clue that something invisible just happened (a side channel).
  function sendTo(room, playerId) {
    const socketId = room.sockets.get(playerId);
    if (socketId) io.to(socketId).emit('state', { ...room.game.viewFor(playerId), joinUrl: joinUrl() });
  }

  // The server owns the clock: one timer per room fires when the current phase ends.
  function schedule(room) {
    clearTimeout(room.timer);
    room.timer = null;
    const { phaseEndsAt } = room.game;
    if (phaseEndsAt === null) return;
    room.timer = setTimeout(() => {
      room.game.advance();
      broadcast(room);
      schedule(room);
    }, Math.max(0, phaseEndsAt - Date.now()));
  }

  function closeRoom(code) {
    const room = rooms.get(code);
    if (!room) return;
    clearTimeout(room.timer);
    rooms.delete(code);
  }

  const sweeper = setInterval(() => {
    const cutoff = Date.now() - IDLE_ROOM_MS;
    for (const [code, room] of rooms) {
      if (room.sockets.size === 0 && room.touchedAt < cutoff) closeRoom(code);
    }
  }, 60_000);
  sweeper.unref();

  io.on('connection', (socket) => {
    socket.data = {};
    const local = usableAddress(socket.request.socket.localAddress);
    if (local) learned = { address: local, port: socket.request.socket.localPort };

    // Every client event gets the same treatment: run the handler, reply through the
    // acknowledgement callback with { ok: true, ... } or { ok: false, error, message }.
    const handle = (event, handler) => {
      socket.on(event, (payload, ack) => {
        if (typeof payload === 'function') [payload, ack] = [{}, payload];
        const reply = typeof ack === 'function' ? ack : () => {};
        try {
          reply({ ok: true, ...handler(payload ?? {}) });
        } catch (err) {
          if (err instanceof GameError) {
            reply({ ok: false, error: err.code, message: err.message });
          } else {
            console.error(`[${event}]`, err);
            reply({ ok: false, error: 'SERVER_ERROR', message: 'Something went wrong on the server.' });
          }
        }
      });
    };

    const current = () => {
      const room = rooms.get(socket.data.code);
      const { playerId } = socket.data;
      if (!room || room.sockets.get(playerId) !== socket.id) {
        throw new GameError('NOT_IN_ROOM', 'You are not in a room.');
      }
      room.touchedAt = Date.now();
      return { room, game: room.game, playerId };
    };

    const detach = () => {
      const room = rooms.get(socket.data.code);
      const { playerId } = socket.data;
      socket.data = {};
      if (!room || room.sockets.get(playerId) !== socket.id) return;
      room.sockets.delete(playerId);
      const player = room.game.players.get(playerId);
      if (player) player.connected = false;
      room.touchedAt = Date.now();
      broadcast(room);
    };

    const attach = (room, player) => {
      detach();
      const previous = room.sockets.get(player.id);
      room.sockets.set(player.id, socket.id);
      // Same player on a new connection (phone woke up, app restarted): drop the stale one.
      if (previous && previous !== socket.id) io.sockets.sockets.get(previous)?.disconnect(true);
      player.connected = true;
      socket.data = { code: room.game.code, playerId: player.id };
      rooms.set(room.game.code, room);
      room.touchedAt = Date.now();
      broadcast(room);
      return { code: room.game.code, playerId: player.id, token: player.token };
    };

    handle('room:create', ({ name }) => {
      const room = newRoom();
      return attach(room, room.game.addPlayer(name));
    });

    handle('room:join', ({ code, name }) => {
      const room = rooms.get(normalizeCode(code));
      if (!room) throw new GameError('NO_ROOM', 'No room with that code.');
      return attach(room, room.game.addPlayer(name));
    });

    handle('room:resume', ({ code, playerId, token }) => {
      const room = rooms.get(normalizeCode(code));
      const player = room?.game.authenticate(playerId, token);
      if (!player) throw new GameError('SESSION_EXPIRED', 'That game no longer exists.');
      return attach(room, player);
    });

    handle('room:leave', () => {
      const { room, game, playerId } = current();
      room.sockets.delete(playerId);
      socket.data = {};
      game.leave(playerId);
      const everyoneGone = [...game.players.values()].every((p) => p.left);
      if (everyoneGone) closeRoom(game.code);
      else broadcast(room);
    });

    handle('player:photo', ({ photo }) => {
      const { room, game, playerId } = current();
      game.setPhoto(playerId, photo ?? null);
      broadcast(room);
    });

    handle('game:settings', (changes) => {
      const { room, game, playerId } = current();
      game.updateSettings(playerId, changes);
      broadcast(room);
    });

    handle('game:kick', ({ playerId: targetId }) => {
      const { room, game, playerId } = current();
      game.kick(playerId, targetId);
      const target = io.sockets.sockets.get(room.sockets.get(targetId));
      room.sockets.delete(targetId);
      if (target) {
        target.data = {};
        target.emit('kicked');
      }
      broadcast(room);
    });

    handle('game:start', () => {
      const { room, game, playerId } = current();
      game.start(playerId);
      broadcast(room);
      schedule(room);
    });

    handle('turn:choose', ({ ranking }) => {
      const { room, game, playerId } = current();
      game.choose(playerId, ranking);
      if (game.everyoneChose) {
        game.advance();
        schedule(room);
      }
      broadcast(room);
    });

    // The lifeline's answer travels back in the reply to this one socket only,
    // never in the shared state, so it can't sit on screen afterwards.
    // It's { suit }, or { blackout: true } when the Jack blacked out this cell.
    handle('turn:lifeline', () => {
      const { room, game, playerId } = current();
      const result = game.useLifeline(playerId);
      sendTo(room, playerId);
      return result;
    });

    // The Jack's secret power. Only the Jack's own view changes, so only the Jack is told.
    handle('turn:blackout', () => {
      const { room, game, playerId } = current();
      game.armBlackout(playerId);
      sendTo(room, playerId);
    });

    // A private message goes to its two players and nobody else, and it changes no one's state,
    // so there's no broadcast: the other phones can't even tell that two players are talking.
    // The sender gets it back in the reply, the receiver as a 'chat:message' event.
    handle('chat:send', ({ to, text }) => {
      const { room, game, playerId } = current();
      const message = game.sendMessage(playerId, to, text);
      const receiver = room.sockets.get(to);
      if (receiver) io.to(receiver).emit('chat:message', message);
      return { message };
    });

    // Your own messages, sent and received, for a phone that reconnects or reloads.
    handle('chat:history', () => {
      const { game, playerId } = current();
      return { gameNumber: game.gameNumber, messages: game.chatFor(playerId) };
    });

    handle('game:skip', () => {
      const { room, game, playerId } = current();
      game.skipDiscussion(playerId);
      broadcast(room);
      schedule(room);
    });

    handle('turn:answer', ({ suit }) => {
      const { room, game, playerId } = current();
      game.answer(playerId, suit);
      if (game.everyoneAnswered) {
        game.advance();
        schedule(room);
      }
      broadcast(room);
    });

    handle('game:reset', () => {
      const { room, game, playerId } = current();
      game.reset(playerId);
      schedule(room);
      broadcast(room);
    });

    socket.on('disconnect', detach);
  });

  return {
    app,
    io,
    httpServer,
    rooms,
    close() {
      clearInterval(sweeper);
      for (const code of [...rooms.keys()]) closeRoom(code);
      return new Promise((resolve) => io.close(() => resolve()));
    },
  };
}

function normalizeCode(code) {
  return typeof code === 'string' ? code.trim().toUpperCase() : '';
}
