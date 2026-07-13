import { CONFIG } from './config.js';
import { STATE } from './fighter.js';
import { EffectsManager } from './effects.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.effects = new EffectsManager();
    this.bgGradient = null;
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width || window.innerWidth;
    this.canvas.height = rect.height || window.innerHeight;
    this.scaleX = this.canvas.width / CONFIG.WORLD_WIDTH;
    this.scaleY = this.canvas.height / CONFIG.WORLD_HEIGHT;
    this.scale = Math.min(this.scaleX, this.scaleY);
  }

  getCanvasSize() {
    return { w: this.canvas.width, h: this.canvas.height };
  }

  // 主渲染循环
  render(fighters, skinManager, frame) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    // 屏幕抖动
    const shakeX = this.effects.screenShake ? (Math.random() - 0.5) * this.effects.screenShake * 2 : 0;
    const shakeY = this.effects.screenShake ? (Math.random() - 0.5) * this.effects.screenShake * 2 : 0;

    ctx.save();
    ctx.translate(shakeX, shakeY);

    // 计算视图缩放
    const scale = this.scale;
    const offsetX = (w - CONFIG.WORLD_WIDTH * scale) / 2;
    const offsetY = (h - CONFIG.WORLD_HEIGHT * scale) / 2;

    // 背景
    this._drawBackground(ctx, offsetX, offsetY, scale);

    // 地面
    this._drawGround(ctx, offsetX, offsetY, scale);

    // 玩家
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    for (const fighter of fighters) {
      this._drawFighter(ctx, fighter, skinManager, frame);
    }

    // 粒子
    this.effects.draw(ctx, 0, 0);

    ctx.restore();

    // 屏幕边缘HUD
    ctx.restore();

    // UI元素（不受缩放影响）
    this._drawGameUI(ctx, fighters);
  }

  _drawBackground(ctx, ox, oy, sc) {
    const w = this.canvas.width;
    const h = this.canvas.height;

    // 天空渐变
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#0a0a1a');
    grad.addColorStop(0.6, '#1a1a2e');
    grad.addColorStop(1, '#2a1a1a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // 远山/建筑剪影
    ctx.fillStyle = '#15152a';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.6);
    for (let x = 0; x <= w; x += 10) {
      const bh = Math.sin(x * 0.01) * 20 + Math.sin(x * 0.025) * 10 + 50;
      ctx.lineTo(x, h * 0.6 - bh);
    }
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.fill();
  }

  _drawGround(ctx, ox, oy, sc) {
    const gx = ox;
    const gy = oy + CONFIG.GROUND_Y * sc;
    const gw = CONFIG.WORLD_WIDTH * sc;

    // 地面
    const grad = ctx.createLinearGradient(gx, gy, gx, gy + 40 * sc);
    grad.addColorStop(0, '#2a2a3a');
    grad.addColorStop(1, '#1a1a2a');
    ctx.fillStyle = grad;
    ctx.fillRect(gx, gy, gw, 40 * sc);

    // 地面线
    ctx.strokeStyle = '#4a4a6a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx + gw, gy);
    ctx.stroke();

    // 地面网格线
    ctx.strokeStyle = '#2a2a3a';
    ctx.lineWidth = 1;
    for (let x = 0; x < CONFIG.WORLD_WIDTH; x += 50) {
      ctx.beginPath();
      ctx.moveTo(ox + x * sc, gy);
      ctx.lineTo(ox + x * sc, gy + 30 * sc);
      ctx.stroke();
    }
  }

  _drawFighter(ctx, fighter, skinManager, frame) {
    if (fighter.state === STATE.DEAD && frame - fighter.stateTimer > 120) return;

    const x = fighter.x;
    const y = fighter.y;
    const w = fighter.width;
    const h = fighter.height;
    const f = fighter.facing;

    ctx.save();

    // 无敌闪烁
    if (fighter.invincibleTimer > 0 && Math.floor(fighter.invincibleTimer / 4) % 2 === 0) {
      ctx.globalAlpha = 0.5;
    }

    // 爆气光环
    if (fighter.rageActive) {
      ctx.shadowBlur = 30;
      ctx.shadowColor = '#ff4444';
      this.effects.addRageAura(x, y, fighter.color, f);
    }

    // 尝试绘制皮肤
    let drewSkin = false;
    if (skinManager) {
      const skin = skinManager.getSkin(fighter.id);
      if (skin) {
        ctx.save();
        // 朝向翻转
        if (f === -1) {
          ctx.translate(x, y - h);
          ctx.scale(-1, 1);
          skinManager.drawSkin(ctx, fighter.id, 0, 0, w * 1.2, h * 1.2, fighter.rageActive);
        } else {
          skinManager.drawSkin(ctx, fighter.id, x + w * 0.1, y, w * 1.2, h * 1.2, fighter.rageActive);
        }
        ctx.restore();
        drewSkin = true;
      }
    }

    if (!drewSkin) {
      // 默认方块绘制
      ctx.fillStyle = fighter.rageActive ? '#ff4444' : fighter.color;
      ctx.shadowBlur = fighter.rageActive ? 20 : 5;
      ctx.shadowColor = fighter.rageActive ? '#ff0000' : fighter.color;
      ctx.fillRect(x - w / 2, y - h, w, h);

      // 头部
      ctx.fillStyle = fighter.rageActive ? '#ff6666' : '#f0d0a0';
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(x, y - h - 8, 12, 0, Math.PI * 2);
      ctx.fill();

      // 身体线条
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - w/2 + 5, y - 10);
      ctx.lineTo(x + (f === 1 ? 20 : -20), y - 25);
      ctx.moveTo(x + w/2 - 5, y - 10);
      ctx.lineTo(x + (f === 1 ? 25 : -25), y - 20);
      ctx.stroke();
    }

    // 朝向标识
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    const arrow = f === 1 ? '→' : '←';
    if (!drewSkin) ctx.fillText(arrow, x + f * 18, y - h - 15);

    // 名字
    ctx.fillStyle = '#fff';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(fighter.nickname, x, y - h - 32);

    // 血条（玩家头上）
    const hpPct = fighter.hp / fighter.maxHp;
    ctx.fillStyle = '#333';
    ctx.fillRect(x - 25, y - h - 42, 50, 5);
    ctx.fillStyle = hpPct > 0.5 ? '#4ade80' : hpPct > 0.25 ? '#fbbf24' : '#e94560';
    ctx.fillRect(x - 25, y - h - 42, 50 * hpPct, 5);

    // 气槽
    if (fighter.rageActive) {
      ctx.fillStyle = '#ff4444';
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#ff0000';
      ctx.fillRect(x - 25, y - h - 49, 50, 4);
      ctx.shadowBlur = 0;
    } else {
      const ragePct = fighter.rage / fighter.maxRage;
      ctx.fillStyle = '#222';
      ctx.fillRect(x - 25, y - h - 49, 50, 4);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(x - 25, y - h - 49, 50 * ragePct, 4);
    }

    ctx.restore();
  }

  _drawGameUI(ctx, fighters) {
    // 游戏状态信息已经由 HUD 的 DOM 元素显示
    // 这里留空，由 game.js 更新 DOM
  }
}

export default Renderer;
