import { wsClient } from './ws.js';
import { CONFIG } from './config.js';
import { LobbyUI } from './lobby.js';
import { RoomUI } from './room.js';
import { P2PManager } from './p2p.js';
import { GameEngine } from './game.js';

// ===== 应用状态 =====
const state = {
  currentView: 'login',
  nickname: '',
  serverUrl: 'ws://localhost:3000',
  game: null,
  p2p: null
};

// ===== DOM 引用 =====
const $ = (id) => document.getElementById(id);
const views = {
  login: document.getElementById('login-view'),
  lobby: document.getElementById('lobby-view'),
  room: document.getElementById('room-view'),
  game: document.getElementById('game-view')
};

// ===== 视图切换 =====
function showView(name) {
  Object.keys(views).forEach(k => views[k].classList.toggle('active', k === name));
  state.currentView = name;
  if (name === 'game') {
    views.game.style.display = 'flex';
    const canvas = views.game.querySelector('canvas');
    if (canvas) canvas.focus();
  }
}
window._showView = showView;

// ===== 初始化模块 =====
const lobby = new LobbyUI();
const room = new RoomUI();

// ===== 登录逻辑 =====
document.getElementById('connect-btn').addEventListener('click', async () => {
  const nickname = document.getElementById('nickname-input').value.trim() || '格斗家';
  const serverUrl = document.getElementById('server-url').value.trim() || 'ws://localhost:3000';
  state.nickname = nickname;
  state.serverUrl = serverUrl;

  const statusEl = document.getElementById('connect-status');
  statusEl.textContent = '正在连接...';
  statusEl.className = 'status-text';
  document.getElementById('connect-btn').disabled = true;
  document.getElementById('connect-btn').textContent = '连接中...';

  try {
    await wsClient.connect(serverUrl);
    wsClient.send({ type: 'set_nickname', nickname });
    statusEl.textContent = '已连接!';
    statusEl.className = 'status-text connected';
    document.getElementById('connect-btn').disabled = false;
    document.getElementById('connect-btn').textContent = '已连接 ✓';
    lobby.show(nickname);
    showView('lobby');
  } catch (err) {
    console.error('连接失败:', err);
    statusEl.textContent = '连接失败: ' + (err.message || '未知错误');
    statusEl.className = 'status-text error';
    document.getElementById('connect-btn').disabled = false;
    document.getElementById('connect-btn').textContent = '重试连接';
  }
});

document.getElementById('nickname-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('connect-btn').click();
});

// ===== 房间事件 -> 游戏开始 =====
wsClient.on('game_start', (data) => {
  startGame(data.players);
});

// ===== 开始游戏 =====
async function startGame(players) {
  showView('game');

  const canvas = document.getElementById('game-canvas');
  const hud = document.getElementById('game-hud');
  const overlay = document.getElementById('game-overlay');

  hud.classList.remove('hidden');
  overlay.classList.add('hidden');

  if (state.game) {
    state.game.stop();
  }
  if (state.p2p) {
    state.p2p.destroy();
  }

  state.p2p = new P2PManager();
  const localId = wsClient.clientId;

  try {
    await state.p2p.init(localId, players);
  } catch (e) {
    console.warn('P2P init warning (will use relay):', e);
  }

  const game = new GameEngine(canvas);
  game.init(players, localId, state.p2p, room.skinManager);

  game.onMatchEnd = (winner, results) => {
    showGameResults(winner, results);
  };

  state.game = game;
  game.start();
}

// ===== 游戏结果 =====
function showGameResults(winner, results) {
  const overlay = document.getElementById('game-overlay');
  const content = document.getElementById('overlay-content');

  let html = '<div class="overlay-box">';
  html += '<h2 style="color:' + winner.color + '">🏆 ' + winner.nickname + ' 获胜!</h2>';
  html += '<p style="margin:16px 0;font-size:14px;color:#888">=== 最终排名 ===</p>';

  results.forEach((r, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) + '.';
    html += '<p style="color:' + r.color + '">' + medal + ' ' + r.nickname + ' - ' + r.wins + '胜</p>';
  });

  html += '<br><button class="btn btn-primary" onclick="returnToRoom()">返回房间</button>';
  html += '</div>';

  content.innerHTML = html;
  overlay.classList.remove('hidden');
}

// ===== 返回房间 =====
window.returnToRoom = function() {
  if (state.game) {
    state.game.stop();
    state.game = null;
  }
  if (state.p2p) {
    state.p2p.destroy();
    state.p2p = null;
  }
  document.getElementById('game-overlay').classList.add('hidden');
  document.getElementById('game-hud').classList.add('hidden');
  showView('room');
};

// ===== 断开连接 =====
wsClient.on('disconnected', () => {
  if (state.game) {
    state.game.stop();
    state.game = null;
  }
  if (state.p2p) {
    state.p2p.destroy();
    state.p2p = null;
  }
  document.getElementById('connect-btn').disabled = false;
  document.getElementById('connect-btn').textContent = '连接服务器';
  document.getElementById('connect-status').textContent = '已断开连接';
  document.getElementById('connect-status').className = 'status-text';
  showView('login');
});

// ===== 大厅断开 =====
wsClient.on('left_room', () => {
  showView('lobby');
});

console.log('🥊 网页拳皇已启动!');
console.log('默认服务器: ' + state.serverUrl);
console.log('提示: 修改服务器地址可连接远程服务器');
console.log('键盘: WASD/方向键移动, J轻拳, K重拳, L踢, Space爆气');
console.log('连招: ↓→J=气功波, →↓→K=升龙拳, ↓↑L=旋风腿, →→J=冲刺攻击');
