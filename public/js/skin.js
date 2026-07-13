import { CONFIG } from './config.js';

// 皮肤管理器
export class SkinManager {
  constructor() {
    this.skins = {}; // playerId -> HTMLImageElement
    this.localSkinData = null;
  }

  // 上传图片并压缩
  upload(file) {
    return new Promise((resolve, reject) => {
      if (!file) { reject('No file'); return; }
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = CONFIG.SKIN_SIZE;
          canvas.height = CONFIG.SKIN_SIZE;
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, CONFIG.SKIN_SIZE, CONFIG.SKIN_SIZE);
          const s = Math.min(img.width, img.height);
          const sx = (img.width - s) / 2;
          const sy = (img.height - s) / 2;
          ctx.drawImage(img, sx, sy, s, s, 0, 0, CONFIG.SKIN_SIZE, CONFIG.SKIN_SIZE);
          const dataUrl = canvas.toDataURL('image/png');
          this.localSkinData = dataUrl;
          this.skins['local'] = img;
          resolve(dataUrl);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // 接收远端皮肤
  applySkin(playerId, dataUrl) {
    const img = new Image();
    img.src = dataUrl;
    this.skins[playerId] = img;
  }

  // 获取皮肤图片
  getSkin(playerId) {
    return this.skins[playerId] || null;
  }

  // 渲染时应用皮肤
  drawSkin(ctx, playerId, x, y, w, h, rageActive) {
    const img = this.getSkin(playerId);
    if (img) {
      ctx.save();
      if (rageActive) {
        ctx.globalAlpha = 0.8;
      }
      ctx.drawImage(img, x - w/2, y - h, w, h);
      if (rageActive) {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(x - w/2, y - h, w, h);
      }
      ctx.restore();
    }
  }
}

export default SkinManager;
