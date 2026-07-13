# 🥊 网页拳皇 - 在线多人 P2P 格斗游戏

纯前端 HTML/CSS/JS + Node.js WebSocket 服务端，支持 2~4 人房间大厅和 P2P 联机的格斗游戏。

## 特性

- **房间大厅**：创建/加入房间、实时列表、准备系统
- **P2P 联机**：WebRTC 直连，失败自动降级 WebSocket 中继
- **格斗系统**：搓招连招、爆气模式、飞行道具
- **对角生成**：玩家按索引分配四个角落初始位置
- **自定义皮肤**：上传图片作为角色皮肤

## 快速开始

### 本地启动

```bash
node server.js
```

浏览器打开 `http://localhost:3000`

### Zeabur 部署（国内可访问）

1. 将本项目推送到 GitHub
2. 在 [Zeabur](https://zeabur.com) 创建项目
3. 选择 GitHub 仓库自动部署
4. 获取分配的 URL 访问

## 操作说明

| 按键 | 功能 |
|------|------|
| WASD / 方向键 | 移动 |
| J | 轻拳 |
| K | 重拳 |
| L | 踢击 |
| S+下 / ↓ | 防御 |
| Space | 爆气（气槽满时） |

### 连招表

| 招式 | 输入 | 效果 |
|------|------|------|
| 气功波 | ↓→ + J | 远程飞行道具 |
| 升龙拳 | →↓→ + K | 上勾拳对空 |
| 旋风腿 | ↓↑ + L | 范围踢击 |
| 冲刺攻击 | →→ + J | 突进攻击 |

### 爆气系统

- 气槽满 100 时可爆气（Space）
- 持续 8 秒，攻击力 +50%，速度 +30%
- 攻击命中/被攻击/时间自然增长充气

## 技术栈

- **前端**：纯 HTML/CSS/JS (ES Module)
- **服务端**：Node.js + ws (WebSocket)
- **P2P**：WebRTC (DataChannel)
- **渲染**：Canvas 2D
- **部署**：Zeabur (支持国内访问)

## 文件结构

```
├── server.js          # WebSocket 服务端
├── public/
│   ├── index.html     # 单页入口
│   ├── css/style.css  # 页面样式
│   └── js/
│       ├── app.js     # 应用主逻辑
│       ├── config.js  # 配置常量
│       ├── ws.js      # WebSocket 通信
│       ├── lobby.js   # 房间大厅
│       ├── room.js    # 房间管理
│       ├── p2p.js     # WebRTC P2P
│       ├── game.js    # 游戏引擎
│       ├── fighter.js # 角色类
│       ├── input.js   # 键盘+搓招
│       ├── physics.js # 物理引擎
│       ├── combat.js  # 战斗系统
│       ├── effects.js # 特效系统
│       ├── renderer.js# Canvas 渲染
│       └── skin.js    # 皮肤管理
```

## 协议

MIT
