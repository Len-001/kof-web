import { CONFIG } from './config.js';
import { STATE } from './fighter.js';
import { Physics } from './physics.js';

// 战斗系统
export class CombatSystem {
  constructor() {
    this.hitEffects = [];
    this.comboCounters = {};
  }

  // 处理所有攻击判定
  processAttacks(fighters, frame) {
    this.hitEffects = [];

    for (const attacker of fighters) {
      if (!attacker.alive) continue;
      if (!attacker.activeHitbox) continue;
      if (attacker.stateTimer <= 0) continue;

      for (const target of fighters) {
        if (target.id === attacker.id) continue;
        if (!target.alive) continue;
        if (target.invincibleTimer > 0) continue;
        if (attacker.rageActive && this._wasJustHit(target, frame)) continue;

        const hit = Physics.checkAttackHit({
          x: attacker.x + attacker.activeHitbox.offsetX * attacker.facing,
          y: attacker.y + attacker.activeHitbox.offsetY,
          w: attacker.activeHitbox.w,
          h: attacker.activeHitbox.h
        }, {
          x: target.x,
          y: target.y,
          w: target.width,
          h: target.height
        });

        if (hit) {
          const damage = Math.round(attacker.activeHitbox.damage * attacker.getDamageMultiplier());
          const knockback = attacker.activeHitbox.knockback;
          const wasHit = target.takeDamage(damage, knockback, attacker.facing);

          if (wasHit) {
            this.hitEffects.push({
              x: (attacker.x + target.x) / 2,
              y: (target.y - target.height / 2),
              damage,
              attackerId: attacker.id,
              targetId: target.id,
              frame
            });

            // 连击计数
            if (!this.comboCounters[attacker.id]) this.comboCounters[attacker.id] = { count: 0, lastHit: 0 };
            if (frame - this.comboCounters[attacker.id].lastHit < 15) {
              this.comboCounters[attacker.id].count++;
            } else {
              this.comboCounters[attacker.id].count = 1;
            }
            this.comboCounters[attacker.id].lastHit = frame;

            // 确认击杀
            if (!target.alive) {
              attacker.wins++;
            }
          }

          // 每次攻击只命中一个目标
          break;
        }
      }

      // 攻击框只生效一帧
      if (attacker.state === STATE.ATTACK_LIGHT || attacker.state === STATE.ATTACK_HEAVY ||
          attacker.state === STATE.ATTACK_KICK) {
        attacker.activeHitbox = null;
      }
    }
  }

  _wasJustHit(target, frame) {
    return this.hitEffects.some(h => h.targetId === target.id && frame - h.frame < 5);
  }

  // 获取玩家连击数
  getComboCount(playerId) {
    return this.comboCounters[playerId] ? this.comboCounters[playerId].count : 0;
  }

  // 重置
  reset() {
    this.hitEffects = [];
    this.comboCounters = {};
  }
}

export default CombatSystem;
