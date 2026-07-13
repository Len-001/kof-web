import { CONFIG } from './config.js';

// 格斗角色状态
export const STATE = {
  IDLE: 'idle',
  WALK: 'walk',
  JUMP: 'jump',
  ATTACK_LIGHT: 'attack_light',
  ATTACK_HEAVY: 'attack_heavy',
  ATTACK_KICK: 'attack_kick',
  ATTACK_SPECIAL: 'attack_special',
  ATTACK_PROJECTILE: 'attack_projectile',
  HIT: 'hit',
  GUARD: 'guard',
  RAGE: 'rage',
  DOWN: 'down',
  DEAD: 'dead'
};

export class Fighter {
  constructor(config) {
    this.id = config.id;
    this.nickname = config.nickname;
    this.playerIndex = config.playerIndex;
    this.color = CONFIG.PLAYER_COLORS[config.playerIndex % CONFIG.PLAYER_COLORS.length];

    // 位置
    this.x = config.x || 0;
    this.y = config.y || 0;
    this.vx = 0;
    this.vy = 0;

    // 属性
    this.hp = CONFIG.MAX_HP;
    this.maxHp = CONFIG.MAX_HP;
    this.rage = 0;
    this.maxRage = CONFIG.MAX_RAGE;
    this.state = STATE.IDLE;
    this.facing = 1; // 1=右, -1=左

    // 状态计时
    this.stateTimer = 0;
    this.invincibleTimer = 0;
    this.rageTimer = 0;
    this.rageActive = false;

    // 连击
    this.comboCount = 0;
    this.lastHitTime = 0;

    // 碰撞框
    this.width = CONFIG.FIGHTER_WIDTH;
    this.height = CONFIG.FIGHTER_HEIGHT;

    // 攻击判定
    this.activeHitbox = null; // { x, y, w, h, damage, knockback }
    this.canAct = true;
    this.guarding = false;

    // 战绩
    this.wins = 0;
    this.alive = true;
    this.eliminated = false;
    this.eliminationOrder = 0;
  }

  // 重置位置（每局开始）
  resetPosition(x, y, facing) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.state = STATE.IDLE;
    this.stateTimer = 0;
    this.invincibleTimer = 60; // 1秒无敌
    this.activeHitbox = null;
    this.canAct = true;
    this.guarding = false;
    this.facing = facing;
  }

  // 重置全局（新比赛）
  resetMatch() {
    this.hp = CONFIG.MAX_HP;
    this.rage = 0;
    this.rageActive = false;
    this.rageTimer = 0;
    this.alive = true;
    this.eliminated = false;
    this.eliminationOrder = 0;
    this.comboCount = 0;
    this.state = STATE.IDLE;
    this.stateTimer = 0;
    this.activeHitbox = null;
  }

  // 方向朝向
  faceTowards(targetX) {
    this.facing = targetX > this.x ? 1 : -1;
  }

  // 受击
  takeDamage(damage, knockbackX, attackerFacing) {
    if (this.invincibleTimer > 0) return false;
    if (this.state === STATE.DEAD || this.state === STATE.DOWN) return false;

    if (this.guarding) {
      damage = Math.floor(damage * 0.3);
      this.vx = knockbackX * 0.3;
      this.state = STATE.GUARD;
      this.stateTimer = 10;
      this.rage = Math.min(this.maxRage, this.rage + 2);
      return false;
    }

    this.hp = Math.max(0, this.hp - damage);
    this.vx = knockbackX * attackerFacing;
    this.vy = -150;
    this.state = STATE.HIT;
    this.stateTimer = 15;
    this.activeHitbox = null;
    this.rage = Math.min(this.maxRage, this.rage + damage * 0.5);

    if (this.hp <= 0) {
      this.state = STATE.DOWN;
      this.stateTimer = 60;
      this.alive = false;
    }
    return true;
  }

  // 更新状态
  update(dt) {
    if (this.stateTimer > 0) this.stateTimer--;
    if (this.invincibleTimer > 0) this.invincibleTimer--;
    if (this.rageTimer > 0) {
      this.rageTimer--;
      if (this.rageTimer <= 0) {
        this.rageActive = false;
      }
    }

    // 自然回气
    if (!this.rageActive) {
      this.rage = Math.min(this.maxRage, this.rage + 0.5);
    }

    // 物理更新
    this.vy += CONFIG.GRAVITY * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // 地面碰撞
    if (this.y >= CONFIG.GROUND_Y) {
      this.y = CONFIG.GROUND_Y;
      if (this.vy > 0) {
        if (this.state === STATE.HIT || this.state === STATE.DOWN) {
          // 倒地恢复
        }
        this.vy = 0;
      }
    }

    // 边界限制
    this.x = Math.max(this.width / 2, Math.min(CONFIG.WORLD_WIDTH - this.width / 2, this.x));

    // 摩擦
    if (this.state !== STATE.WALK && this.state !== STATE.JUMP) {
      this.vx *= 0.85;
    }

    // 状态自动恢复
    if (this.stateTimer <= 0) {
      if (this.state === STATE.HIT || this.state === STATE.GUARD) {
        this.state = STATE.IDLE;
        this.canAct = true;
      }
      if (this.state === STATE.ATTACK_LIGHT || this.state === STATE.ATTACK_HEAVY ||
          this.state === STATE.ATTACK_KICK || this.state === STATE.ATTACK_SPECIAL ||
          this.state === STATE.ATTACK_PROJECTILE) {
        this.state = STATE.IDLE;
        this.canAct = true;
        this.activeHitbox = null;
      }
      if (this.state === STATE.DOWN && this.alive === false) {
        this.state = STATE.DEAD;
      }
    }

    // 空中状态
    if (this.y < CONFIG.GROUND_Y && this.state !== STATE.HIT && this.state !== STATE.DOWN && this.state !== STATE.DEAD) {
      // Keep jump state
    }

    // 爆气状态加速
    if (this.rageActive) {
      this.rage = Math.max(0, this.rage - 0.3);
      if (this.rage <= 0) {
        this.rageActive = false;
        this.rageTimer = 0;
      }
    }
  }

  getSpeedMultiplier() {
    return this.rageActive ? 1.3 : 1.0;
  }

  getDamageMultiplier() {
    return this.rageActive ? 1.5 : 1.0;
  }
}

export default Fighter;
