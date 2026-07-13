// WebSocket 通信管理
class WSClient {
  constructor() {
    this.ws = null;
    this.clientId = null;
    this.connected = false;
    this.listeners = {};
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url);
      } catch (e) {
        reject(e);
        return;
      }
      this.ws.onopen = () => {};
      this.ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'connected') {
            this.clientId = msg.clientId;
            this.connected = true;
            resolve(this);
          }
          this._emit(msg.type, msg);
        } catch (err) { console.warn('WS parse error', err); }
      };
      this.ws.onerror = (e) => { reject(e); };
      this.ws.onclose = () => {
        this.connected = false;
        this._emit('disconnected', {});
      };
    });
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  on(type, cb) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(cb);
  }

  off(type, cb) {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter(l => l !== cb);
  }

  _emit(type, data) {
    (this.listeners[type] || []).forEach(cb => cb(data));
    (this.listeners['*'] || []).forEach(cb => cb(data));
  }

  disconnect() {
    if (this.ws) this.ws.close();
    this.connected = false;
    this.clientId = null;
  }
}

export const wsClient = new WSClient();
export default wsClient;
