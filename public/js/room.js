import { wsClient } from './ws.js';
import { CONFIG } from './config.js';
import { SkinManager } from './skin.js';

export class RoomUI {
  constructor() {
    this.room = null;
    this.players = [];
    this.isHost = false;
    this.isReady = false;
    this.skinManager = new SkinManager();
    this.onGameStart = null;
    this._initElements();
    this._initListeners();
  }

  _initElements() {
    this.el = {
      view: document.getElementById('room-view'),
      name: document.getElementById('room-name-display'),
      id: document.getElementById('room-id-display'),
      playerList: document.getElementById('player-list'),
      playerCount: document.getElementById('player-count'),
      readyBtn: document.getElementById('ready-btn'),
      startBtn: document.getElementById('start-game-btn'),
      leaveBtn: document.getElementById('leave-room-btn'),
      skinUpload: document.getElementById('skin-upload'),
      skinPreview: document.getElementById('skin-preview')
    };
  }

  _initListeners() {
    this.el.readyBtn.addEventListener('click', () => {
      wsClient.send({ type: 'toggle_ready' });
    });
    this.el.startBtn.addEventListener('click', () => {
      wsClient.send({ type: 'start_game' });
    });
    this.el.leaveBtn.addEventListener('click', () => {
      wsClient.send({ type: 'leave_room' });
    });
    this.el.skinUpload.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const dataUrl = await this.skinManager.upload(file);
        this.el.skinPreview.innerHTML = `<img src="${dataUrl}" alt="skin">`;
        wsClient.send({ type: 'skin_update', skinData: dataUrl });
      } catch (err) {
        console.warn('皮肤上传失败', err);
      }
    });

    wsClient.on('room_joined', (data) => this._onRoomJoined(data));
    wsClient.on('player_joined', (data) => this._addPlayer(data.player));
    wsClient.on('player_left', (data) => this._removePlayer(data.playerId, data.newHostId));
    wsClient.on('player_ready', (data) => this._setReady(data.playerId, data.ready));
    wsClient.on('left_room', () => {
      this._clear();
      if (typeof window._showView === 'function') window._showView('lobby');
    });
    wsClient.on('skin_update', (data) => {
      this.skinManager.applySkin(data.playerId, data.skinData);
      this._updatePlayerAvatar(data.playerId);
    });
    wsClient.on('error', (data) => {
      alert(data.message);
    });
  }

  _onRoomJoined(data) {
    this.room = data.room;
    this.players = data.players;
    this.isHost = data.room.hostId === wsClient.clientId;
    this._render();
    if (typeof window._showView === 'function') window._showView('room');
  }

  _addPlayer(player) {
    this.players.push(player);
    this._render();
  }

  _removePlayer(playerId, newHostId) {
    this.players = this.players.filter(p => p.id !== playerId);
    if (newHostId) {
      this.isHost = newHostId === wsClient.clientId;
    }
    this._render();
  }

  _setReady(playerId, ready) {
    const p = this.players.find(p => p.id === playerId);
    if (p) p.ready = ready;
    if (playerId === wsClient.clientId) {
      this.isReady = ready;
    }
    this._render();
  }

  _clear() {
    this.room = null;
    this.players = [];
    this.isHost = false;
    this.isReady = false;
    this.el.skinPreview.innerHTML = '';
    this.el.skinUpload.value = '';
  }

  _updatePlayerAvatar(playerId) {
    const img = this.el.playerList.querySelector(`[data-player-id="${playerId}"] .player-avatar`);
    if (img) {
      const skinImage = this.skinManager.getSkin(playerId);
      if (skinImage) {
        img.src = skinImage.src;
      }
    }
  }

  _render() {
    if (!this.room) return;
    this.el.name.textContent = this.room.name;
    this.el.id.textContent = '#' + this.room.id;
    this.el.playerCount.textContent = `(${this.players.length}/${this.room.maxPlayers})`;

    const list = this.el.playerList;
    list.innerHTML = '';
    this.players.forEach((p, i) => {
      const li = document.createElement('li');
      li.dataset.playerId = p.id;
      const isHost = this.room.hostId === p.id;
      const isMe = p.id === wsClient.clientId;
      const color = CONFIG.PLAYER_COLORS[i % CONFIG.PLAYER_COLORS.length];

      let avatarHtml = `<div class="player-color" style="background:${color}"></div>`;
      const skinImg = this.skinManager.getSkin(p.id);
      if (skinImg) {
        avatarHtml = `<img class="player-avatar" src="${skinImg.src}" style="border-color:${color}">`;
      }

      li.innerHTML = `
        ${avatarHtml}
        <span class="player-name">${this._escape(p.nickname)} ${isHost ? '<span class="player-host">👑</span>' : ''} ${isMe ? '<span style="color:#888;font-size:12px">(你)</span>' : ''}</span>
        <span class="player-status">${p.ready ? '✅' : '⏳'}</span>
      `;
      list.appendChild(li);
    });

    // Ready button
    if (this.isReady) {
      this.el.readyBtn.textContent = '取消准备';
      this.el.readyBtn.classList.add('ready');
    } else {
      this.el.readyBtn.textContent = '准备';
      this.el.readyBtn.classList.remove('ready');
    }

    // Start button (host only, all ready)
    const allReady = this.players.length >= 2 && this.players.every(p => p.ready);
    if (this.isHost && allReady) {
      this.el.startBtn.classList.remove('hidden');
    } else {
      this.el.startBtn.classList.add('hidden');
    }
  }

  _escape(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }
}

export default RoomUI;
