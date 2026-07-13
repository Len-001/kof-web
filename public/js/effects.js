// 视觉效果 - 粒子系统
export class EffectsManager {
  constructor() {
    this.particles = [];
    this.screenShake = 0;
    this.flashEffects = [];
  }

  // 命中火花
  addHitSpark(x, y, color = '#fff') {
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 150;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 20 + Math.random() * 20,
        maxLife: 40,
        size: 2 + Math.random() * 4,
        color: Math.random() > 0.5 ? '#ffdf00' : '#ff4500',
        type: 'spark'
      });
    }
    this.screenShake = 5;
  }

  // 爆气特效
  addRageBurst(x, y, color) {
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 100 + Math.random() * 200;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 30 + Math.random() * 30,
        maxLife: 60,
        size: 3 + Math.random() * 5,
        color: color || '#ff4444',
        type: 'rage'
      });
    }
    this.screenShake = 10;
  }

  // 爆气光环（持续）
  addRageAura(x, y, color, facing) {
    for (let i = 0; i < 2; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 30,
        y: y - Math.random() * 40 - 10,
        vx: (Math.random() - 0.5) * 20,
        vy: -20 - Math.random() * 30,
        life: 20 + Math.random() * 10,
        maxLife: 30,
        size: 3 + Math.random() * 3,
        color: Math.random() > 0.5 ? '#ff6666' : '#ffaa00',
        type: 'aura'
      });
    }
  }

  // 文字显示
  addFloatingText(x, y, text, color = '#fff') {
    this.particles.push({
      x, y,
      vx: 0,
      vy: -60,
      life: 40,
      maxLife: 40,
      size: 16,
      color,
      text,
      type: 'text'
    });
  }

  // KO 特效
  addKOEffect(x, y) {
    for (let i = 0; i < 50; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 300;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 50,
        life: 40 + Math.random() * 40,
        maxLife: 80,
        size: 2 + Math.random() * 6,
        color: ['#ff0044', '#ff6600', '#ffcc00', '#ffffff'][Math.floor(Math.random() * 4)],
        type: 'ko'
      });
    }
    this.screenShake = 15;
  }

  // 更新粒子
  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 100 * dt;
      p.life--;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
    if (this.screenShake > 0) this.screenShake -= 0.5;
    if (this.screenShake < 0) this.screenShake = 0;
  }

  // 渲染粒子
  draw(ctx, offsetX, offsetY) {
    for (const p of this.particles) {
      const alpha = p.life / p.maxLife;
      const sx = p.x + offsetX;
      const sy = p.y + offsetY;

      if (p.type === 'text') {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.font = `bold ${p.size}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(p.text, sx, sy);
        ctx.restore();
      } else {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(sx, sy, p.size * alpha, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  reset() {
    this.particles = [];
    this.screenShake = 0;
    this.flashEffects = [];
  }
}

export default EffectsManager;
