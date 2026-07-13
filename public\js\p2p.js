import { CONFIG } from './config.js';

const STUN = CONFIG.STUN_SERVERS;

export class P2PManager {
  constructor() {
    this.isHost = false;
    this.mySlot = -1;
    this.totalPlayers = 0;
    this.myNickname = '';
    this.hostNickname = '';
    this.peer = null; // { pc, channel, connected }
    this.inputQueue = [];
    this.connected = false;
    this.onInput = null;
    this.onSkin = null;
    this.connectionReady = null;
    this._inputQueue = [];
  }

  // ===== Host creates room =====
  async createRoom(nickname) {
    this.isHost = true;
    this.mySlot = 0;
    this.myNickname = nickname;
    this.hostNickname = nickname;
    this.totalPlayers = 2;

    const pc = new RTCPeerConnection({ iceServers: STUN });
    const channel = pc.createDataChannel('game', { ordered: true });
    this._setupDataChannel(channel);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await this._gatherIce(pc);

    this.peer = { pc, channel, connected: false };

    // Encode room code
    const data = {
      v: 1, host: nickname, max: 2,
      offer: { sdp: pc.localDescription.sdp, type: pc.localDescription.type }
    };
    return btoa(JSON.stringify(data));
  }

  // ===== Joiner joins room =====
  async joinRoom(roomCode, nickname) {
    this.isHost = false;
    this.mySlot = 1;
    this.myNickname = nickname;

    let roomData;
    try { roomData = JSON.parse(atob(roomCode)); } catch(e) { throw new Error('\u65e0\u6548\u7684\u623f\u95f4\u7801'); }
    if (roomData.v !== 1) throw new Error('\u7248\u672c\u4e0d\u5339\u914d');

    this.hostNickname = roomData.host;
    this.totalPlayers = roomData.max;

    const pc = new RTCPeerConnection({ iceServers: STUN });
    let hostChannel = null;
    pc.ondatachannel = (event) => {
      hostChannel = event.channel;
      this._setupDataChannel(hostChannel);
    };

    await pc.setRemoteDescription(new RTCSessionDescription(roomData.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await this._gatherIce(pc);

    this.peer = { pc, channel: hostChannel, connected: false };

    const joinData = {
      v: 1, nickname,
      answer: { sdp: pc.localDescription.sdp, type: pc.localDescription.type }
    };
    return btoa(JSON.stringify(joinData));
  }

  // ===== Host accepts joiner =====
  async acceptJoiner(joinCode) {
    if (!this.isHost || !this.peer) throw new Error('\u4e0d\u662f\u623f\u4e3b');
    let data;
    try { data = JSON.parse(atob(joinCode)); } catch(e) { throw new Error('\u65e0\u6548\u7684\u8fde\u63a5\u7801'); }
    if (data.v !== 1) throw new Error('\u7248\u672c\u4e0d\u5339\u914d');

    await this.peer.pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    this.peer.connected = true;
    this.connected = true;
    return data.nickname;
  }

  // ===== DataChannel setup =====
  _setupDataChannel(channel) {
    channel.onopen = () => {
      if (this.peer) this.peer.connected = true;
      this.connected = true;
      if (this.connectionReady) this.connectionReady();
    };
    channel.onclose = () => {
      this.connected = false;
    };
    channel.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'input') {
          this._inputQueue.push(msg);
          if (this._inputQueue.length > 120) this._inputQueue.shift();
          if (this.onInput) this.onInput(msg);
        } else if (msg.type === 'skin' && this.onSkin) {
          this.onSkin(msg.slot, msg.data);
        } else if (msg.type === 'game_start' && this.onGameStart) {
          this.onGameStart(msg.players);
        }
      } catch(e) {}
    };
  }

  // Wait for ICE gathering
  _gatherIce(pc) {
    if (pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise(resolve => {
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') resolve();
      };
    });
  }

  // ===== Send data =====
  send(data) {
    if (this.peer && this.peer.channel && this.peer.channel.readyState === 'open') {
      this.peer.channel.send(JSON.stringify(data));
    }
  }

  sendInput(inputData) {
    this.send({ type: 'input', ...inputData });
  }

  sendSkin(slot, skinData) {
    this.send({ type: 'skin', slot, data: skinData });
  }

  sendGameStart(players) {
    this.send({ type: 'game_start', players });
  }

  getLatestInput() {
    if (this._inputQueue.length === 0) return null;
    return this._inputQueue[this._inputQueue.length - 1];
  }

  isConnected() { return this.connected; }

  destroy() {
    if (this.peer) {
      try { this.peer.pc.close(); } catch(e) {}
    }
    this.peer = null;
    this.connected = false;
    this._inputQueue = [];
  }
}

export default P2PManager;
