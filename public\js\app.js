import { CONFIG } from "./config.js";
import { P2PManager } from "./p2p.js";
import { SkinManager } from "./skin.js";
import { GameEngine } from "./game.js";

const $ = id => document.getElementById(id);
const views = ["home", "host", "join", "skin", "game"];
function showView(name) {
  views.forEach(v => $(v + "-view").classList.toggle("active", v === name));
}
window._showView = showView;

let p2p = null, game = null, skinManager = new SkinManager();
let isHost = false, myNickname = "", remoteNickname = "";
let generatedRoomCode = "", generatedJoinCode = "";

// HOME
$("host-btn").addEventListener("click", async () => {
  myNickname = $("nickname-input").value.trim() || ("格斗家" + Math.floor(Math.random() * 100));
  isHost = true; showView("host");
  $("room-code-box").textContent = "生成中...";
  $("host-status").textContent = "创建中...";
  $("host-status").className = "status-text";
  $("host-join-input").classList.add("hidden");
  $("host-connected").classList.add("hidden");
  try {
    p2p = new P2PManager();
    generatedRoomCode = await p2p.createRoom(myNickname);
    $("room-code-box").textContent = generatedRoomCode;
    $("host-status").textContent = "已创建! 复制房间码发给朋友，然后在下方粘贴他返回的连接码";
    $("host-join-input").classList.remove("hidden");
  } catch(e) {
    $("host-status").textContent = "创建失败: " + e.message;
    $("host-status").className = "status-text error";
  }
});
$("join-btn").addEventListener("click", () => {
  myNickname = $("nickname-input").value.trim() || ("格斗家" + Math.floor(Math.random() * 100));
  isHost = false; showView("join");
});

// HOST
$("copy-code-btn").addEventListener("click", () => {
  navigator.clipboard.writeText(generatedRoomCode).then(() => {
    $("copy-code-btn").textContent = "✅ 已复制!";
    setTimeout(() => $("copy-code-btn").textContent = "📋 复制房间码", 2000);
  }).catch(() => { /* fallback */ });
});
$("accept-join-btn").addEventListener("click", async () => {
  const jc = $("join-code-input").value.trim();
  if (!jc) return;
  $("host-status").textContent = "确认连接中...";
  try {
    remoteNickname = await p2p.acceptJoiner(jc);
    $("host-connected").classList.remove("hidden");
    $("joiner-name").textContent = remoteNickname;
    $("host-join-input").classList.add("hidden");
    $("host-status").textContent = "✅ " + remoteNickname + " 已连接!";
    $("host-status").className = "status-text connected";
  } catch(e) {
    $("host-status").textContent = "连接失败: " + e.message;
    $("host-status").className = "status-text error";
  }
});
$("start-game-btn").addEventListener("click", () => showView("skin"));
$("cancel-host-btn").addEventListener("click", () => {
  if (p2p) { p2p.destroy(); p2p = null; } showView("home");
});

// JOIN
$("join-room-btn").addEventListener("click", async () => {
  const rc = $("room-code-input").value.trim();
  if (!rc) { $("join-status").textContent = "请粘贴房间码"; return; }
  $("join-status").textContent = "连接中...";
  $("join-room-btn").disabled = true;
  try {
    p2p = new P2PManager();
    generatedJoinCode = await p2p.joinRoom(rc, myNickname);
    $("join-code-box").textContent = generatedJoinCode;
    $("join-status").textContent = "连接码已生成! 复制发给房主，等待他确认";
    $("join-status").className = "status-text connected";
    $("join-result").classList.remove("hidden");
    $("join-room-btn").disabled = false;
    // Wait for host to accept and start game
    p2p.onGameStart = (data) => {
      remoteNickname = data.players.find(p => p.id !== "joiner")?.nickname || "房主";
      startGameFromHost(data.players);
    };
  } catch(e) {
    $("join-status").textContent = "加入失败: " + e.message;
    $("join-status").className = "status-text error";
    $("join-room-btn").disabled = false;
  }
});
$("copy-join-btn").addEventListener("click", () => {
  navigator.clipboard.writeText(generatedJoinCode).then(() => {
    $("copy-join-btn").textContent = "✅ 已复制!";
    setTimeout(() => $("copy-join-btn").textContent = "📋 复制连接码", 2000);
  });
});
$("cancel-join-btn").addEventListener("click", () => {
  if (p2p) { p2p.destroy(); p2p = null; } showView("home");
});

// SKIN
$("skin-upload").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const dataUrl = await skinManager.upload(file);
    $("skin-preview").innerHTML = '<img src="' + dataUrl + '" alt="skin">';
    if (p2p && p2p.isConnected()) p2p.sendSkin(0, dataUrl);
  } catch(err) { console.warn(err); }
});
$("done-btn").addEventListener("click", startGame);
$("skip-skin-btn").addEventListener("click", startGame);

// START GAME (Host)
async function startGame() {
  const canvas = $("game-canvas");
  if (game) { game.stop(); game = null; }
  const players = [
    { id: "host", nickname: myNickname, playerIndex: 0 },
    { id: "joiner", nickname: remoteNickname || "对手", playerIndex: 1 }
  ];
  game = new GameEngine(canvas);
  game.init(players, 0, p2p, skinManager, true);
  game.onMatchEnd = (winner, results) => showGameResults(winner, results);
  p2p.sendGameStart(players);
  setTimeout(() => { showView("game"); $("game-hud").classList.remove("hidden"); $("game-overlay").classList.add("hidden"); game.start(); }, 500);
}

function startGameFromHost(players) {
  const canvas = $("game-canvas");
  if (game) { game.stop(); game = null; }
  game = new GameEngine(canvas);
  game.init(players, 1, p2p, skinManager, false);
  game.onMatchEnd = (winner, results) => showGameResults(winner, results);
  showView("game");
  $("game-hud").classList.remove("hidden");
  $("game-overlay").classList.add("hidden");
  game.start();
}

function showGameResults(winner, results) {
  let html = '<div class="overlay-box">';
  html += "<h2 style=\"color:" + winner.color + "\">🏆 " + winner.nickname + " 获胜!</h2>";
  html += "<p style=\"margin:16px 0;color:#888\">=== 排名 ===</p>";
  results.forEach((r, i) => {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : (i + 1) + ".";
    html += "<p style=\"color:" + r.color + "\">" + medal + " " + r.nickname + "</p>";
  });
  html += '<br><button class="btn btn-primary" onclick="backToHome()">返回首页</button></div>';
  $("overlay-content").innerHTML = html;
  $("game-overlay").classList.remove("hidden");
}
window.backToHome = function() {
  if (game) { game.stop(); game = null; }
  if (p2p) { p2p.destroy(); p2p = null; }
  $("game-overlay").classList.add("hidden");
  $("game-hud").classList.add("hidden");
  showView("home");
};

console.log("🥊 网页拳皇 - 纯P2P模式");
console.log("玩法: 房主创建房间 -> 复制房间码发朋友 -> 朋友粘贴加入 -> 房主粘贴连接码 -> 开始对战!");
console.log("键盘: WASD移动, J/K/L攻击, Space爆气");
console.log("连招: ↓→J气功波, →↓→J升龙拳, ↓↑L旋风腿, →→J冲刺");
