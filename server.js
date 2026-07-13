const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

const rooms = new Map();
const clients = new Map();

function generateId() {
  return crypto.randomUUID().slice(0, 8);
}

function broadcastRoomList() {
  const list = [];
  rooms.forEach((room, id) => {
    list.push({
      id, name: room.name,
      playerCount: room.players.length,
      maxPlayers: room.maxPlayers,
      status: room.status
    });
  });
  const msg = JSON.stringify({ type: 'room_list', rooms: list });
  clients.forEach(c => { if (!c.inRoom) c.ws.send(msg); });
}

function sendToPlayer(playerId, data) {
  const client = clients.get(playerId);
  if (client) client.ws.send(JSON.stringify(data));
}

function broadcastToRoom(roomId, data, excludeId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const msg = JSON.stringify(data);
  room.players.forEach(p => {
    if (p.id !== excludeId) sendToPlayer(p.id, data);
  });
}

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  const clientId = generateId();
  const client = { id: clientId, ws, nickname: 'Player' + clientId.slice(0, 4), inRoom: null };
  clients.set(clientId, client);
  console.log('[+] ' + clientId);
  ws.send(JSON.stringify({ type: 'connected', clientId }));
  broadcastRoomList();

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    handleMessage(client, msg);
  });

  ws.on('close', () => {
    console.log('[-] ' + clientId + ' (' + client.nickname + ')');
    if (client.inRoom) leaveRoom(client);
    clients.delete(clientId);
    broadcastRoomList();
  });
});

function handleMessage(client, msg) {
  switch (msg.type) {
    case 'set_nickname':
      client.nickname = (msg.nickname || '').slice(0, 12) || client.nickname;
      client.ws.send(JSON.stringify({ type: 'nickname_set', nickname: client.nickname }));
      break;
    case 'create_room':
      createRoom(client, msg.name || client.nickname + '\u7684\u623f\u95f4', msg.maxPlayers || 4);
      break;
    case 'join_room':
      joinRoom(client, msg.roomId);
      break;
    case 'leave_room':
      leaveRoom(client);
      break;
    case 'toggle_ready':
      toggleReady(client);
      break;
    case 'start_game':
      startGame(client);
      break;
    case 'signal_offer':
    case 'signal_answer':
    case 'signal_ice':
      forwardSignaling(client, msg);
      break;
    case 'relay_data':
      relayData(client, msg);
      break;
    case 'skin_update':
      broadcastSkin(client, msg);
      break;
  }
}

function createRoom(client, name, maxPlayers) {
  if (client.inRoom) { client.ws.send(JSON.stringify({ type: 'error', message: '\u5df2\u5728\u623f\u95f4\u4e2d' })); return; }
  maxPlayers = Math.max(2, Math.min(4, maxPlayers));
  const roomId = generateId();
  const room = { id: roomId, name: (name || '').slice(0, 20), maxPlayers, hostId: client.id, status: 'waiting', players: [] };
  rooms.set(roomId, room);
  addPlayerToRoom(client, room);
}

function joinRoom(client, roomId) {
  if (client.inRoom) { client.ws.send(JSON.stringify({ type: 'error', message: '\u5df2\u5728\u623f\u95f4\u4e2d' })); return; }
  const room = rooms.get(roomId);
  if (!room) { client.ws.send(JSON.stringify({ type: 'error', message: '\u623f\u95f4\u4e0d\u5b58\u5728' })); return; }
  if (room.status !== 'waiting') { client.ws.send(JSON.stringify({ type: 'error', message: '\u6e38\u620f\u5df2\u5f00\u59cb' })); return; }
  if (room.players.length >= room.maxPlayers) { client.ws.send(JSON.stringify({ type: 'error', message: '\u623f\u95f4\u5df2\u6ee1' })); return; }
  addPlayerToRoom(client, room);
}

function addPlayerToRoom(client, room) {
  const player = { id: client.id, nickname: client.nickname, ready: false, skinData: null };
  room.players.push(player);
  client.inRoom = room.id;
  client.ws.send(JSON.stringify({ type: 'room_joined', room: { id: room.id, name: room.name, maxPlayers: room.maxPlayers, hostId: room.hostId }, players: room.players }));
  broadcastToRoom(room.id, { type: 'player_joined', player });
  broadcastRoomList();
}

function leaveRoom(client) {
  if (!client.inRoom) return;
  const room = rooms.get(client.inRoom);
  if (!room) { client.inRoom = null; return; }
  const idx = room.players.findIndex(p => p.id === client.id);
  if (idx !== -1) room.players.splice(idx, 1);
  client.inRoom = null;
  if (room.players.length === 0) {
    rooms.delete(room.id);
  } else {
    if (room.hostId === client.id) room.hostId = room.players[0].id;
    broadcastToRoom(room.id, { type: 'player_left', playerId: client.id, newHostId: room.hostId });
  }
  client.ws.send(JSON.stringify({ type: 'left_room' }));
  broadcastRoomList();
}

function toggleReady(client) {
  if (!client.inRoom) return;
  const room = rooms.get(client.inRoom);
  if (!room) return;
  const player = room.players.find(p => p.id === client.id);
  if (!player) return;
  player.ready = !player.ready;
  broadcastToRoom(room.id, { type: 'player_ready', playerId: client.id, ready: player.ready });
}

function startGame(client) {
  if (!client.inRoom) return;
  const room = rooms.get(client.inRoom);
  if (!room) return;
  if (room.hostId !== client.id) { client.ws.send(JSON.stringify({ type: 'error', message: '\u53ea\u6709\u623f\u4e3b\u53ef\u4ee5\u5f00\u59cb' })); return; }
  if (room.players.length < 2) { client.ws.send(JSON.stringify({ type: 'error', message: '\u81f3\u5c112\u540d\u73a9\u5bb6' })); return; }
  if (!room.players.every(p => p.ready)) { client.ws.send(JSON.stringify({ type: 'error', message: '\u8fd8\u6709\u4eba\u672a\u51c6\u5907' })); return; }
  room.status = 'playing';
  const playersData = room.players.map((p, i) => ({ id: p.id, nickname: p.nickname, skinData: p.skinData, playerIndex: i }));
  broadcastToRoom(room.id, { type: 'game_start', players: playersData });
  broadcastRoomList();
  console.log('[game] room ' + room.id + ' started');
}

function forwardSignaling(client, msg) {
  const target = clients.get(msg.to);
  if (target) {
    target.ws.send(JSON.stringify({
      type: msg.type, from: client.id, to: msg.to,
      [msg.type === 'signal_ice' ? 'candidate' : msg.type === 'signal_offer' ? 'offer' : 'answer']: msg.candidate || msg.offer || msg.answer
    }));
  }
}

function relayData(client, msg) {
  const target = clients.get(msg.to);
  if (target) target.ws.send(JSON.stringify({ type: 'relay_data', from: client.id, data: msg.data }));
}

function broadcastSkin(client, msg) {
  if (!client.inRoom) return;
  const room = rooms.get(client.inRoom);
  if (!room) return;
  const player = room.players.find(p => p.id === client.id);
  if (player) player.skinData = msg.skinData;
  broadcastToRoom(room.id, { type: 'skin_update', playerId: client.id, skinData: msg.skinData });
}

server.listen(PORT, () => {
  console.log('[start] KOF server on http://0.0.0.0:' + PORT);
});
