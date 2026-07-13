import { CONFIG } from './config.js';

// 物理工具
export class Physics {
  // AABB 碰撞检测
  static checkRectCollision(a, b) {
    return (
      a.x - a.w / 2 < b.x + b.w / 2 &&
      a.x + a.w / 2 > b.x - b.w / 2 &&
      a.y - a.h < b.y + b.h / 2 &&
      a.y > b.y - b.h / 2
    );
  }

  // 攻击框 vs 受击框
  static checkAttackHit(attack, target) {
    const ax = attack.x;
    const ay = attack.y;
    const aw = attack.w;
    const ah = attack.h;

    const bx = target.x;
    const by = target.y;
    const bw = target.w;
    const bh = target.h;

    if (ax + aw / 2 < bx - bw / 2) return false;
    if (ax - aw / 2 > bx + bw / 2) return false;
    if (ay + ah / 2 < by - bh / 2) return false;
    if (ay - ah / 2 > by + bh / 2) return false;
    return true;
  }

  // 计算两点距离
  static distance(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  }

  // 获取初始位置（按玩家索引分配角落）
  static getStartPosition(playerIndex, totalPlayers) {
    const margin = 60;
    const positions = [
      { x: margin, y: CONFIG.GROUND_Y, face: 1 },
      { x: CONFIG.WORLD_WIDTH - margin, y: CONFIG.GROUND_Y, face: -1 },
      { x: margin, y: CONFIG.GROUND_Y - 100, face: 1 },
      { x: CONFIG.WORLD_WIDTH - margin, y: CONFIG.GROUND_Y - 100, face: -1 }
    ];
    const pos = positions[playerIndex % positions.length];
    return { x: pos.x, y: pos.y, facing: pos.face };
  }

  // 检查玩家是否在屏幕内
  static isOnScreen(x, y) {
    return x >= -100 && x <= CONFIG.WORLD_WIDTH + 100;
  }
}

export default Physics;
