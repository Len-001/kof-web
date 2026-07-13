import { wsClient } from './ws.js';
import { CONFIG } from './config.js';

// P2P 网络管理器 - WebRTC + WebSocket 中继降级
export class P2PManager {
  constructor() {
    this.peers = new Map(); // peerId -> { pc, channel, connected }
    this.inputQueues = new Map(); // peerId -> { inputs: [], lastFrame: 0 }
    this.localPlayerId = null;
    this.allPlayers = [];
    this.useRelay = false;
    this.relayEnabled = false;
    this.onInput = null;
    this._signalingHandler = null;
  }

  // 初始化 P2P：与所有其他玩家建立连接
  async init(localId, players) {
    this.localPlayerId = localId;
    this.allPlayers = players;

    const others = players.filter(p => p.id !== localId);
    for (const peer of others) {
      this.inputQueues.set(peer.id, { inputs: [], lastFrame: 0 });
    }

    // 创建与每个人的连接
    for (const peer of others) {
      this._createPeerConnection(peer.id, true);
    }

    // 监听信令
    this._signalingHandler = (msg) => this._handleSignal(msg);
    wsClient.on('signal_offer', this._signalingHandler);
    wsClient.on('signal_answer', this._signalingHandler);
    wsClient.on('signal_ice', this._signalingHandler);
    wsClient.on('relay_data', (msg) => this._handleRelay(msg));

    // 5秒后检查连接，未连通的走中继
    setTimeout(() => this._checkConnections(), CONFIG.P2P_TIMEOUT);
  }

  destroy() {
    if (this._signalingHandler) {
      wsClient.off('signal_offer', this._signalingHandler);
      wsClient.off('signal_answer', this._signalingHandler);
      wsClient.off('signal_ice', this._signalingHandler);
      wsClient.off('relay_data', this._signalingHandler);
    }
    this.peers.forEach(peer => {
      try { peer.pc.close(); } catch {}
    });
    this.peers.clear();
    this.inputQueues.clear();
  }

  _createPeerConnection(peerId, initiator) {
    const pc = new RTCPeerConnection({ iceServers: CONFIG.STUN_SERVERS });
    const peer = { pc, channel: null, connected: false, initiator };
    this.peers.set(peerId, peer);

    // DataChannel
    if (initiator) {
      const channel = pc.createDataChannel('game', { ordered: true });
      this._setupChannel(peerId, channel);
    }

    pc.ondatachannel = (event) => {
      this._setupChannel(peerId, event.channel);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        wsClient.send({ type: 'signal_ice', to: peerId, candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected' || pc.connectionState === 'completed') {
        peer.connected = true;
      }
    };

    if (initiator) {
      pc.createOffer().then(offer => {
        pc.setLocalDescription(offer);
        wsClient.send({ type: 'signal_offer', to: peerId, offer: { type: offer.type, sdp: offer.sdp } });
      }).catch(console.warn);
    }
  }

  _setupChannel(peerId, channel) {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    peer.channel = channel;

    channel.onopen = () => {
      peer.connected = true;
    };

    channel.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        this._handleP2PMessage(peerId, data);
      } catch {}
    };

    channel.onerror = () => {};
    channel.onclose = () => { peer.connected = false; };
  }

  _handleSignal(msg) {
    if (msg.to !== this.localPlayerId) return;
    const peer = this.peers.get(msg.from);
    if (!peer) return;

    try {
      if (msg.type === 'signal_offer' && !peer.initiator) {
        const offer = new RTCSessionDescription(msg.offer);
        peer.pc.setRemoteDescription(offer).then(() => {
          return peer.pc.createAnswer();
        }).then(answer => {
          peer.pc.setLocalDescription(answer);
          wsClient.send({ type: 'signal_answer', to: msg.from, answer: { type: answer.type, sdp: answer.sdp } });
        }).catch(console.warn);
      } else if (msg.type === 'signal_answer' && peer.initiator) {
        peer.pc.setRemoteDescription(new RTCSessionDescription(msg.answer)).catch(console.warn);
      } else if (msg.type === 'signal_ice') {
        peer.pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(console.warn);
      }
    } catch (e) { console.warn('Signal error', e); }
  }

  _handleRelay(msg) {
    if (msg.from === this.localPlayerId) return;
    const data = msg.data;
    const queue = this.inputQueues.get(msg.from);
    if (queue && data.type === 'input') {
      queue.inputs.push(data);
      if (queue.inputs.length > 120) queue.inputs.shift();
    }
  }

  _handleP2PMessage(peerId, data) {
    if (data.type === 'input') {
      const queue = this.inputQueues.get(peerId);
      if (queue) {
        queue.inputs.push(data);
        if (queue.inputs.length > 120) queue.inputs.shift();
      }
    }
  }

  _checkConnections() {
    let allConnected = true;
    this.peers.forEach((peer, peerId) => {
      if (!peer.connected) {
        allConnected = false;
        console.log(`[P2P] ${peerId} 未连通，使用 WebSocket 中继`);
      }
    });
    this.relayEnabled = !allConnected;
  }

  // 广播输入帧到所有对手
  broadcastInput(inputData) {
    if (this.relayEnabled) {
      // 通过 WebSocket 中继
      this.inputQueues.forEach((_, peerId) => {
        wsClient.send({ type: 'relay_data', to: peerId, data: { type: 'input', ...inputData } });
      });
    } else {
      // 通过 WebRTC DataChannel
      const msg = JSON.stringify({ type: 'input', ...inputData });
      this.peers.forEach((peer, peerId) => {
        if (peer.connected && peer.channel && peer.channel.readyState === 'open') {
          try { peer.channel.send(msg); } catch {}
        } else {
          wsClient.send({ type: 'relay_data', to: peerId, data: { type: 'input', ...inputData } });
        }
      });
    }
  }

  // 获取指定玩家的最新输入
  getLatestInput(peerId) {
    const queue = this.inputQueues.get(peerId);
    if (!queue || queue.inputs.length === 0) return null;
    return queue.inputs[queue.inputs.length - 1];
  }

  // 发送自定义数据到指定玩家
  sendTo(peerId, data) {
    const peer = this.peers.get(peerId);
    if (peer && peer.connected && peer.channel && peer.channel.readyState === 'open') {
      try { peer.channel.send(JSON.stringify(data)); } catch { wsClient.send({ type: 'relay_data', to: peerId, data }); }
    } else {
      wsClient.send({ type: 'relay_data', to: peerId, data });
    }
  }
}

export default P2PManager;
