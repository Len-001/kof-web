import { wsClient } from './ws.js';

export class LobbyUI {
  constructor() {
    this.rooms = [];
    this._initElements();
    this._initListeners();
  }

  _initElements() {
    this.el = {
      view: document.getElementById('lobby-view'),
      nickname: document.getElementById('lobby-nickname'),
      roomList: document.getElementById('room-list-body'),
      empty: document.getElementById('room-list-empty'),
      createBtn: document.getElementById('create-room-btn'),
      createForm: document.getElementById('create-room-form'),
      roomNameInput: document.getElementById('room-name-input'),
      roomMaxInput: document.getElementById('room-max-input'),
      confirmCreate: document.getElementById('confirm-create-btn'),
      cancelCreate: document.getElementById('cancel-create-btn'),
      logoutBtn: document.getElementById('logout-btn')
    };
  }

  _initListeners() {
    this.el.createBtn.addEventListener('click', () => {
      this.el.createForm.classList.remove('hidden');
      this.el.createBtn.classList.add('hidden');
    });
    this.el.cancelCreate.addEventListener('click', () => {
      this.el.createForm.classList.add('hidden');
      this.el.createBtn.classList.remove('hidden');
    });
    this.el.confirmCreate.addEventListener('click', () => {
      const name = this.el.roomNameInput.value.trim() || '新房间';
      const max = parseInt(this.el.roomMaxInput.value);
      wsClient.send({ type: 'create_room', name, maxPlayers: max });
      this.el.createForm.classList.add('hidden');
      this.el.createBtn.classList.remove('hidden');
    });
    this.el.logoutBtn.addEventListener('click', () => {
      wsClient.disconnect();
    });

    wsClient.on('room_list', (data) => this._updateRoomList(data.rooms));
    wsClient.on('disconnected', () => {
      if (typeof window._showView === 'function') window._showView('login');
    });
  }

  show(nickname) {
    this.el.nickname.textContent = nickname;
  }

  _updateRoomList(rooms) {
    this.rooms = rooms;
    const tbody = this.el.roomList;
    tbody.innerHTML = '';
    if (rooms.length === 0) {
      this.el.empty.classList.remove('hidden');
      return;
    }
    this.el.empty.classList.add('hidden');
    rooms.forEach(r => {
      const tr = document.createElement('tr');
      const statusText = r.status === 'playing' ? '游戏中' : '等待中';
      const statusClass = r.status === 'playing' ? 'playing' : 'waiting';
      const canJoin = r.status === 'waiting' && r.playerCount < r.maxPlayers;
      tr.innerHTML = `
        <td>${this._escape(r.name)}</td>
        <td>${r.playerCount}/${r.maxPlayers}</td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td>${canJoin ? '<button class="btn btn-small btn-primary join-btn" data-id="' + r.id + '">加入</button>' : '<span style="color:#555">不可加入</span>'}</td>
      `;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.join-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        wsClient.send({ type: 'join_room', roomId: btn.dataset.id });
      });
    });
  }

  _escape(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }
}

export default LobbyUI;
