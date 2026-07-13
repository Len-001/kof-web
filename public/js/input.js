import { CONFIG } from './config.js';

// 按键映射
const KEY_MAP = {
  'a': 'left', 'A': 'left', 'ArrowLeft': 'left',
  'd': 'right', 'D': 'right', 'ArrowRight': 'right',
  'w': 'up', 'W': 'up', 'ArrowUp': 'up',
  's': 'down', 'S': 'down', 'ArrowDown': 'down',
  'j': 'light', 'J': 'light',
  'k': 'heavy', 'K': 'heavy',
  'l': 'kick', 'L': 'kick',
  ' ': 'rage',
  'Control': 'guard'
};

// 招式定义
const SPECIAL_MOVES = [
  {
    name: '气功波',
    sequence: ['down', 'down_right', 'right', 'light'],
    id: 'fireball',
    damage: 8,
    type: 'projectile'
  },
  {
    name: '升龙拳',
    sequence: ['right', 'down', 'down_right', 'heavy'],
    id: 'uppercut',
    damage: 15,
    type: 'special'
  },
  {
    name: '旋风腿',
    sequence: ['down', 'up', 'kick'],
    id: 'spin_kick',
    damage: 12,
    type: 'special'
  },
  {
    name: '冲刺攻击',
    sequence: ['right', 'right', 'light'],
    id: 'dash_punch',
    damage: 10,
    type: 'special',
    immediate: true
  }
];

export class InputManager {
  constructor() {
    this.keys = {};
    this.prevKeys = {};
    this.buffer = []; // 输入缓冲区
    this.bufferSize = 30;
    this.comboDetected = null;
    this.pressedThisFrame = new Set();
    this.ragePressed = false;
    this._initListeners();
  }

  _initListeners() {
    document.addEventListener('keydown', (e) => {
      const mapped = KEY_MAP[e.key];
      if (mapped) {
        e.preventDefault();
        if (!this.keys[mapped]) {
          this.pressedThisFrame.add(mapped);
        }
        this.keys[mapped] = true;
      }
    });
    document.addEventListener('keyup', (e) => {
      const mapped = KEY_MAP[e.key];
      if (mapped) {
        e.preventDefault();
        this.keys[mapped] = false;
      }
    });
    // 防止失去焦点时按键卡住
    document.addEventListener('blur', () => {
      this.keys = {};
      this.buffer = [];
    });
  }

  // 每帧更新输入缓冲
  update() {
    this.comboDetected = null;
    this.pressedThisFrame.clear();

    // 记录方向
    let dir = '';
    if (this.keys['left']) dir += 'left';
    if (this.keys['right']) dir += 'right';
    if (this.keys['up']) dir += 'up';
    if (this.keys['down']) dir += 'down';

    // 合并方向
    let direction = '';
    if (this.keys['left'] && !this.keys['right']) direction = 'left';
    else if (this.keys['right'] && !this.keys['left']) direction = 'right';
    if (this.keys['up'] && !this.keys['down']) direction = direction ? direction + '_up' : 'up';
    else if (this.keys['down'] && !this.keys['up']) direction = direction ? direction + '_down' : 'down';

    // 攻击按键
    let attackButton = '';
    if (this.pressedThisFrame.has('light')) attackButton = 'light';
    else if (this.pressedThisFrame.has('heavy')) attackButton = 'heavy';
    else if (this.pressedThisFrame.has('kick')) attackButton = 'kick';

    // 爆气
    this.ragePressed = this.pressedThisFrame.has('rage');

    // 防御
    this.guardHeld = this.keys['down'] && !attackButton;

    // 添加到缓冲区
    const entry = { dir: direction, frame: Date.now() };
    if (direction || attackButton) {
      this.buffer.push({ type: attackButton || 'dir', value: attackButton || direction, time: Date.now() });
      if (this.buffer.length > this.bufferSize) this.buffer.shift();
    }

    // 检测连招
    if (attackButton) {
      this.comboDetected = this._detectCombo(attackButton);
    }

    // 冲刺检测
    this.dashDetected = this._detectDash();

    return this.getCurrentInput();
  }

  // 检测连招
  _detectCombo(attackButton) {
    for (const move of SPECIAL_MOVES) {
      let idx = this.buffer.length - 1;
      if (this.buffer[idx].type !== attackButton) continue;

      let matched = true;
      for (let i = move.sequence.length - 1; i >= 0; i--) {
        const expected = move.sequence[i];
        const bufIdx = idx - (move.sequence.length - 1 - i);
        if (bufIdx < 0) { matched = false; break; }
        const bufEntry = this.buffer[bufIdx];
        if (bufEntry.type !== 'dir' || bufEntry.value !== expected) {
          matched = false;
          break;
        }
        // 检查时间窗口（1.5秒内）
        if (Date.now() - bufEntry.time > 1500) { matched = false; break; }
      }
      if (matched) {
        // 清除已匹配的输入
        const len = move.sequence.length + 1;
        this.buffer.splice(this.buffer.length - len, len);
        return move;
      }
    }
    return null;
  }

  // 检测冲刺
  _detectDash() {
    if (this.buffer.length < 2) return null;
    const last = this.buffer[this.buffer.length - 1];
    const prev = this.buffer[this.buffer.length - 2];
    if (last.type === 'dir' && prev.type === 'dir' && last.value === prev.value) {
      if (Date.now() - last.time < 400 && Date.now() - prev.time < 800) {
        // 不立即清除，允许后续攻击
        if (last.value === 'right') return 'right';
        if (last.value === 'left') return 'left';
      }
    }
    return null;
  }

  // 获取当前输入状态（用于网络同步）
  getCurrentInput() {
    return {
      left: this.keys['left'] ? 1 : 0,
      right: this.keys['right'] ? 1 : 0,
      up: this.keys['up'] ? 1 : 0,
      down: this.keys['down'] ? 1 : 0,
      light: this.pressedThisFrame.has('light') ? 1 : 0,
      heavy: this.pressedThisFrame.has('heavy') ? 1 : 0,
      kick: this.pressedThisFrame.has('kick') ? 1 : 0,
      rage: this.ragePressed ? 1 : 0,
      guard: this.guardHeld ? 1 : 0,
      combo: this.comboDetected ? this.comboDetected.id : null,
      dash: this.dashDetected || null,
      timestamp: Date.now()
    };
  }

  // 应用远端输入
  applyRemoteInput(input) {
    return {
      horizontal: (input.right || 0) - (input.left || 0),
      vertical: (input.up || 0) - (input.down || 0),
      light: input.light || 0,
      heavy: input.heavy || 0,
      kick: input.kick || 0,
      rage: input.rage || 0,
      guard: input.guard || 0,
      combo: input.combo || null,
      dash: input.dash || null,
      timestamp: input.timestamp || 0
    };
  }
}

export default InputManager;
