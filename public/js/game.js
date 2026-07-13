import { CONFIG } from './config.js';
import { Fighter, STATE } from './fighter.js';
import { InputManager } from './input.js';
import { Physics } from './physics.js';
import { CombatSystem } from './combat.js';
import { Renderer } from './renderer.js';
import { EffectsManager } from './effects.js';
import { P2PManager } from './p2p.js';

export class GameEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas);
    this.inputManager = new InputManager();
    this.combat = new CombatSystem();
    this.effects = this.renderer.effects;
    this.p2p = null;
    this.skinManager = null;

    this.fighters = [];
    this.localPlayerId = null;
    this.frame = 0;
    this.running = false;
    this.round = 1;
    this.roundTimer = CONFIG.ROUND_TIME;
    this.roundInProgress = false;
    this.roundWinner = null;
    this.matchWinner = null;
    this.eliminationCount = 0;
    this.gameResults = [];

    this.onRoundEnd = null;
    this.onMatchEnd = null;
    this.animFrameId = null;
    this.lastTimestamp = 0;
    this.inputAccumulator = 0;

    // 投影物
    this.projectiles = [];

    // 倒计时状态
    this.countdown = 0;
    this.countdownText = '';
  }

  // 初始化游戏
  init(players, localPlayerId, p2pManager, skinManager) {
    this.localPlayerId = localPlayerId;
    this.p2p = p2pManager;
    this.skinManager = skinManager;
    this.fighters = [];
    this.round = 1;
    this.frame = 0;
    this.eliminationCount = 0;
    this.gameResults = [];
    this.projectiles = [];

    // 创建角色
    players.forEach((p, i) => {
      const pos = Physics.getStartPosition(i, players.length);
      const fighter = new Fighter({
        id: p.id,
        nickname: p.nickname,
        playerIndex: i,
        x: pos.x,
        y: pos.y
      });
      fighter.facing = pos.facing;
      this.fighters.push(fighter);
    });

    this.combat.reset();
    this.effects.reset();
    this.renderer.effects.reset();
    this.countdown = 120; // 2秒倒计时
    this.countdownText = '';
    this.roundInProgress = false;
    this.roundTimer = CONFIG.ROUND_TIME;

    this._updateHUD();
  }

  // 开始游戏循环
  start() {
    this.running = true;
    this.lastTimestamp = performance.now();
    this.animFrameId = requestAnimationFrame((t) => this._gameLoop(t));
  }

  // 停止游戏
  stop() {
    this.running = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.p2p) this.p2p.destroy();
  }

  _gameLoop(timestamp) {
    if (!this.running) return;

    const dt = Math.min((timestamp - this.lastTimestamp) / 1000, 0.05);
    this.lastTimestamp = timestamp;
    this.frame++;

    this._update(dt);
    this._render();

    this.animFrameId = requestAnimationFrame((t) => this._gameLoop(t));
  }

  _update(dt) {
    // 倒计时阶段
    if (this.countdown > 0) {
      this.countdown--;
      const secs = Math.ceil(this.countdown / 60);
      if (secs > 0 && secs <= 3) {
        this.countdownText = secs.toString();
      } else if (secs <= 0) {
        this.countdownText = 'FIGHT!';
        if (this.countdown <= 0) {
          this.roundInProgress = true;
        }
      }
      // 倒计时期间仍然更新物理（位置已重置）
      for (const f of this.fighters) {
        if (f.alive) f.update(dt);
      }
      this.effects.update(dt);
      this._updateHUD();
      return;
    }

    if (!this.roundInProgress) return;

    // 1. 获取本地输入
    const localInput = this.inputManager.update();

    // 2. 广播输入到对手
    if (this.p2p) {
      this.p2p.broadcastInput(localInput);
    }

    // 3. 处理所有输入
    this._processInputs(localInput, dt);

    // 4. 更新所有角色
    for (const f of this.fighters) {
      if (f.alive) f.update(dt);
    }

    // 5. 处理攻击碰撞
    this.combat.processAttacks(this.fighters, this.frame);

    // 6. 处理远程飞行道具
    this._updateProjectiles(dt);

    // 7. 检测连击特效
    this._processHitEffects();

    // 8. 更新粒子
    this.effects.update(dt);

    // 9. 更新计时器
    this._updateTimer(dt);

    // 10. 检查回合结束
    this._checkRoundEnd();

    // 11. 更新 HUD
    this._updateHUD();
  }

  _processInputs(localInput, dt) {
    // 收集所有输入
    const allInputs = {};
    allInputs[this.localPlayerId] = this.inputManager.applyRemoteInput(localInput);

    if (this.p2p) {
      for (const other of this.fighters) {
        if (other.id === this.localPlayerId) continue;
        const remoteInput = this.p2p.getLatestInput(other.id);
        if (remoteInput) {
          allInputs[other.id] = this.inputManager.applyRemoteInput(remoteInput);
        } else {
          allInputs[other.id] = { horizontal: 0, vertical: 0, light: 0, heavy: 0, kick: 0, rage: 0, guard: 0, combo: null, dash: null, timestamp: 0 };
        }
      }
    }

    // 应用输入到每个角色
    for (const f of this.fighters) {
      if (!f.alive) continue;
      const input = allInputs[f.id];
      if (!input) continue;

      // 不处于可行动状态
      if (f.state === STATE.HIT || f.state === STATE.DOWN || f.state === STATE.DEAD) continue;
      if (f.stateTimer > 0 && f.state !== STATE.WALK && f.state !== STATE.JUMP && f.state !== STATE.IDLE && f.state !== STATE.GUARD) continue;

      const speedMul = f.getSpeedMultiplier();

      // 防御
      f.guarding = input.guard > 0 && input.horizontal === 0 && input.light === 0 && input.heavy === 0 && input.kick === 0;

      // 移动
      if (input.horizontal !== 0 && !f.guarding) {
        f.vx = input.horizontal * CONFIG.MOVE_SPEED * speedMul;
        f.facing = input.horizontal > 0 ? 1 : -1;
        if (f.state === STATE.IDLE) f.state = STATE.WALK;
      } else if (f.state === STATE.WALK) {
        f.state = STATE.IDLE;
      }

      // 跳跃
      if (input.vertical < 0 && f.y >= CONFIG.GROUND_Y - 1 && f.state !== STATE.JUMP) {
        f.vy = CONFIG.JUMP_SPEED * speedMul;
        f.state = STATE.JUMP;
      }

      // 冲刺
      if (input.dash && f.state === STATE.IDLE) {
        f.vx = input.dash === 'right' ? CONFIG.MOVE_SPEED * 1.5 : -CONFIG.MOVE_SPEED * 1.5;
        f.state = STATE.WALK;
      }

      // 攻击
      if (!f.guarding) {
        if (input.combo) {
          this._executeSpecial(f, input.combo);
        } else if (input.light > 0 && f.canAct) {
          this._startAttack(f, 'light');
        } else if (input.heavy > 0 && f.canAct) {
          this._startAttack(f, 'heavy');
        } else if (input.kick > 0 && f.canAct) {
          this._startAttack(f, 'kick');
        }
      }

      // 爆气
      if (input.rage > 0 && !f.rageActive && f.rage >= f.maxRage) {
        this._activateRage(f);
      }
    }
  }

  _startAttack(fighter, type) {
    let damage, knockback, range, duration, state;
    switch (type) {
      case 'light':
        damage = 5;
        knockback = 80;
        range = 30;
        duration = 10;
        state = STATE.ATTACK_LIGHT;
        break;
      case 'heavy':
        damage = 12;
        knockback = 150;
        range = 35;
        duration = 18;
        state = STATE.ATTACK_HEAVY;
        break;
      case 'kick':
        damage = 8;
        knockback = 120;
        range = 40;
        duration = 14;
        state = STATE.ATTACK_KICK;
        break;
    }

    fighter.state = state;
    fighter.stateTimer = duration;
    fighter.canAct = false;
    fighter.activeHitbox = {
      offsetX: fighter.facing * (fighter.width / 2 + range / 2),
      offsetY: -fighter.height / 2,
      w: range,
      h: 30,
      damage,
      knockback
    };
  }

  _executeSpecial(fighter, comboId) {
    const move = this._getSpecialMove(comboId);
    if (!move) return;
    const dmgMul = fighter.getDamageMultiplier();

    fighter.state = STATE.ATTACK_SPECIAL;
    fighter.stateTimer = 20;
    fighter.canAct = false;

    if (move.type === 'projectile') {
      // 发射飞行道具
      this.projectiles.push({
        x: fighter.x + fighter.facing * 30,
        y: fighter.y - 25,
        vx: fighter.facing * 300,
        vy: 0,
        w: 20,
        h: 16,
        damage: Math.round(move.damage * dmgMul),
        knockback: 100,
        ownerId: fighter.id,
        life: 120,
        color: fighter.rageActive ? '#ff4444' : '#4fc3f7'
      });
      this.effects.addHitSpark(fighter.x + fighter.facing * 30, fighter.y - 25, '#4fc3f7');
    } else {
      // 近身特殊技
      fighter.activeHitbox = {
        offsetX: fighter.facing * 40,
        offsetY: -fighter.height / 2 - 10,
        w: 50,
        h: 40,
        damage: Math.round(move.damage * dmgMul),
        knockback: 200
      };
      this.effects.addHitSpark(fighter.x + fighter.facing * 40, fighter.y - 30, '#ffdf00');
    }
  }

  _getSpecialMove(id) {
    const moves = [
      { id: 'fireball', damage: 8, type: 'projectile' },
      { id: 'uppercut', damage: 15, type: 'special' },
      { id: 'spin_kick', damage: 12, type: 'special' },
      { id: 'dash_punch', damage: 10, type: 'special' }
    ];
    return moves.find(m => m.id === id);
  }

  _activateRage(fighter) {
    fighter.rageActive = true;
    fighter.rageTimer = 480; // 8秒
    fighter.rage = 0;
    this.effects.addRageBurst(fighter.x, fighter.y - 30, fighter.color);
    this.effects.addFloatingText(fighter.x, fighter.y - 80, '爆气!', '#ff4444');
  }

  _updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.x += p.vx * dt;
      p.life--;

      // 检查碰撞
      for (const f of this.fighters) {
        if (f.id === p.ownerId || !f.alive) continue;
        if (f.invincibleTimer > 0) continue;

        if (Physics.checkRectCollision(
          { x: p.x, y: p.y, w: p.w, h: p.h },
          { x: f.x, y: f.y - f.height/2, w: f.width, h: f.height }
        )) {
          const wasHit = f.takeDamage(p.damage, p.knockback, p.vx > 0 ? 1 : -1);
          if (wasHit) {
            this.effects.addHitSpark(p.x, p.y, '#ff4444');
          }
          this.projectiles.splice(i, 1);
          break;
        }
      }

      // 超出范围
      if (p.life <= 0 || p.x < -50 || p.x > CONFIG.WORLD_WIDTH + 50) {
        this.projectiles.splice(i, 1);
      }
    }
  }

  _processHitEffects() {
    for (const hit of this.combat.hitEffects) {
      this.effects.addHitSpark(hit.x, hit.y, '#ffdf00');
      this.effects.addFloatingText(hit.x + 10, hit.y - 10, '-' + hit.damage, '#ff4444');

      // 检查击杀
      const target = this.fighters.find(f => f.id === hit.targetId);
      if (target && !target.alive) {
        this.eliminationCount++;
        target.eliminationOrder = this.eliminationCount;
        this.effects.addKOEffect(target.x, target.y - 30);
        this.effects.addFloatingText(target.x, target.y - 80, 'K.O.!', '#ff0044');
      }
    }
  }

  _updateTimer(dt) {
    if (!this.roundInProgress) return;
    this.roundTimer -= dt;
    if (this.roundTimer <= 0) {
      this.roundTimer = 0;
      this._endRound();
    }
  }

  _checkRoundEnd() {
    const alive = this.fighters.filter(f => f.alive);
    if (alive.length <= 1 && this.countdown <= 0 && this.roundInProgress) {
      this._endRound(alive.length === 1 ? alive[0] : null);
    }
  }

  _endRound(winner) {
    this.roundInProgress = false;

    if (!winner) {
      // 时间到，找HP最高的
      let maxHp = -1;
      for (const f of this.fighters) {
        if (f.hp > maxHp) { maxHp = f.hp; winner = f; }
      }
    }

    if (winner) {
      winner.wins++;
      this.roundWinner = winner;
    }

    // 检查比赛胜利
    let matchWinner = null;
    for (const f of this.fighters) {
      if (f.wins >= CONFIG.WINS_NEEDED) {
        matchWinner = f;
        break;
      }
    }

    if (matchWinner) {
      this.matchWinner = matchWinner;
      this._buildResults();
      if (this.onMatchEnd) this.onMatchEnd(matchWinner, this.gameResults);
    } else {
      // 下一回合
      setTimeout(() => this._startNextRound(), 2000);
    }
  }

  _startNextRound() {
    this.round++;
    this.roundTimer = CONFIG.ROUND_TIME;
    this.countdown = 120;
    this.countdownText = '';
    this.combat.reset();
    this.projectiles = [];

    // 重置存活玩家的位置
    const alivePlayers = this.fighters.filter(f => f.alive);
    alivePlayers.forEach((f, i) => {
      const pos = Physics.getStartPosition(f.playerIndex, this.fighters.length);
      f.resetPosition(pos.x, pos.y, pos.facing);
    });

    // 死亡玩家重置但标记不活跃
    this.fighters.filter(f => !f.alive).forEach(f => {
      f.resetMatch();
      const pos = Physics.getStartPosition(f.playerIndex, this.fighters.length);
      f.resetPosition(pos.x, pos.y, pos.facing);
      f.alive = true;
      f.eliminated = false;
      f.eliminationOrder = 0;
    });

    this._updateHUD();
  }

  _buildResults() {
    // 按胜场排序
    const sorted = [...this.fighters].sort((a, b) => b.wins - a.wins || (a.alive ? -1 : 1) || a.eliminationOrder - b.eliminationOrder);
    this.gameResults = sorted.map((f, i) => ({
      rank: i + 1,
      nickname: f.nickname,
      color: f.color,
      wins: f.wins,
      alive: f.alive,
      hp: f.hp
    }));
  }

  _updateHUD() {
    const hudTimer = document.getElementById('hud-timer');
    const hudRound = document.getElementById('hud-round');
    const hudPlayers = document.getElementById('hud-players');

    if (!hudTimer || !hudPlayers) return;

    if (this.roundInProgress) {
      hudTimer.textContent = Math.ceil(this.roundTimer).toString();
    } else if (this.countdown > 0) {
      hudTimer.textContent = this.countdownText;
    } else {
      hudTimer.textContent = Math.ceil(this.roundTimer).toString();
    }

    hudRound.textContent = `ROUND ${this.round}`;
    hudPlayers.innerHTML = '';

    const sortedFighters = [...this.fighters].sort((a, b) => b.wins - a.wins);
    for (const f of sortedFighters) {
      const el = document.createElement('div');
      el.className = 'hud-player';
      const hpPct = Math.max(0, (f.hp / f.maxHp) * 100);
      el.innerHTML = `
        <span class="player-label" style="color:${f.color}">${f.nickname} ${!f.alive ? '💀' : ''} [${f.wins}]</span>
        <div class="hp-bar-bg">
          <div class="hp-bar" style="width:${hpPct}%;background:${hpPct > 50 ? '#4ade80' : hpPct > 25 ? '#fbbf24' : '#e94560'}"></div>
        </div>
        <div class="rage-bar-bg">
          <div class="rage-bar" style="width:${(f.rage / f.maxRage) * 100}%"></div>
        </div>
      `;
      hudPlayers.appendChild(el);
    }
  }

  _render() {
    this.renderer.render(this.fighters, this.skinManager, this.frame);

    // 额外渲染：飞行道具
    const ctx = this.renderer.ctx;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const scale = this.renderer.scale;
    const offsetX = (w - CONFIG.WORLD_WIDTH * scale) / 2;
    const offsetY = (h - CONFIG.WORLD_HEIGHT * scale) / 2;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    for (const p of this.projectiles) {
      ctx.fillStyle = p.color || '#4fc3f7';
      ctx.shadowBlur = 15;
      ctx.shadowColor = ctx.fillStyle;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.w / 2, p.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

export default GameEngine;
