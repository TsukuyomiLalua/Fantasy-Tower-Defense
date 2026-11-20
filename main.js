import {
  formatNum,
  calcCritMultiplier,
  rollCritHits,
  calcAcceleratedCost,
  calcRampageScoreMultiplier,
} from "./math.js";
import { PerformanceController } from "./perf.js";

const TOWER_SPECS = {
  sniper: {
    id: "sniper",
    name: "スナイパー塔",
    cost: 120,
    color: "#63b3ed",
    range: 240,
    rate: 0.5,
    dmg: 180,
    unlockNode: "cmb_005",
  },
  frost: {
    id: "frost",
    name: "霜柱塔",
    cost: 180,
    color: "#76e4f7",
    range: 115,
    rate: 1.3,
    dmg: 16,
    unlockNode: "cmb_012",
  },
  tractor: {
    id: "tractor",
    name: "牽引塔",
    cost: 240,
    color: "#f6ad55",
    range: 135,
    rate: 0.8,
    dmg: 29,
    unlockNode: "cmb_018",
  },
  recruitment: {
    id: "recruitment",
    name: "徴兵塔",
    cost: 300,
    color: "#68d391",
    range: 140,
    rate: 0.7,
    dmg: 35,
    unlockNode: "cmb_024",
  },
  laser: {
    id: "laser",
    name: "レーザー塔",
    cost: 500,
    color: "#f687b3",
    range: 165,
    rate: 8.0,
    dmg: 24,
    unlockNode: "cmb_031",
  },
  lightning: {
    id: "lightning",
    name: "電撃塔",
    cost: 900,
    color: "#faf089",
    range: 130,
    rate: 1.8,
    dmg: 45,
    unlockNode: "cmb_039",
  },
  gravity: {
    id: "gravity",
    name: "重力塔",
    cost: 5000,
    color: "#b794f4",
    range: 260,
    rate: 1.2,
    dmg: 90,
    unlockNode: "cmb_048",
  },
};

const state = {
  wave: 1,
  rampageLevel: 0,
  gold: 1500,
  rp: 25,
  score: 0,
  baseHp: 100,
  maxBaseHp: 100,
  growthLv: 1,
  speedMult: 1,
  autoWave: true,
  paused: false,
  towerCap: 15,
  unlockedNodes: new Set(["cmb_001", "eco_001", "def_001", "con_001", "tac_001"]),
  activeTab: "combat",
  selectedTowerId: null,
  towers: [],
  enemies: [],
  spawnQueue: 8,
  spawnTimer: 0,
  popups: [],
  beams: [],
  toastTimer: 0,
};

let researchNodes = [];
const perf = new PerformanceController();

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const appShell = document.getElementById("app");

function showToast(msg) {
  const el = document.getElementById("toast-banner");
  el.textContent = msg;
  el.classList.add("show");
  state.toastTimer = 2.2;
}

function getStatBonus(statKey) {
  let sum = 0;
  for (const node of researchNodes) {
    if (state.unlockedNodes.has(node.id) && node.effect.stat === statKey) {
      sum += node.effect.value;
    }
  }
  return sum;
}

function getBuildSlots(width, height) {
  const padX = width * 0.16;
  const topY = height * 0.18;
  const botY = height * 0.82;
  const midY = height * 0.5;
  return [
    { x: padX, y: topY },
    { x: width - padX, y: topY },
    { x: padX, y: midY - 40 },
    { x: width - padX, y: midY + 40 },
    { x: padX, y: botY },
    { x: width - padX, y: botY },
    { x: width * 0.5, y: topY - 12 },
    { x: width * 0.5, y: botY + 12 },
  ];
}

function getPathPoints(width, height) {
  return [
    { x: width * 0.5, y: height * 0.08 },
    { x: width * 0.25, y: height * 0.26 },
    { x: width * 0.75, y: height * 0.44 },
    { x: width * 0.28, y: height * 0.64 },
    { x: width * 0.72, y: height * 0.80 },
    { x: width * 0.5, y: height * 0.92 },
  ];
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, perf.tier >= 2 ? 1.25 : 2);
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function startWave(isRampage = false) {
  if (isRampage) {
    state.rampageLevel += 1;
  } else {
    state.wave += 1;
  }
  const baseCount = 8 + state.wave * 2 + state.rampageLevel * 3;
  state.spawnQueue += baseCount;
  showToast(isRampage ? `暴走ウェーブ Lv.${state.rampageLevel} 突入！` : `WAVE ${state.wave} 開始！`);
}

function spawnEnemy(width, height) {
  const path = getPathPoints(width, height);
  const start = path[0];
  const hpScale = Math.pow(1.22, state.wave - 1) * Math.pow(1.65, state.rampageLevel);
  const maxHp = Math.round(60 * hpScale);
  state.enemies.push({
    id: Math.random().toString(36).slice(2, 8),
    x: start.x,
    y: start.y,
    seg: 0,
    hp: maxHp,
    maxHp,
    speed: 42 + Math.min(45, state.wave * 0.6),
    slowFactor: 1.0,
    freezeTimer: 0,
  });
}

function placeTower(specId) {
  const spec = TOWER_SPECS[specId];
  if (!spec) return;
  if (spec.unlockNode && !state.unlockedNodes.has(spec.unlockNode)) {
    showToast(`${spec.name} は研究ツリーで解放が必要です`);
    return;
  }
  const cap = state.towerCap + getStatBonus("tower_cap_add");
  if (state.towers.length >= cap) {
    showToast(`タワー配置上限（${cap}基）に達しています`);
    return;
  }
  const discount = Math.min(0.6, getStatBonus("build_cost_discount_pct"));
  const cost = Math.max(10, Math.round(spec.cost * (1 - discount)));
  if (state.gold < cost) {
    showToast("ゴールドが足りません");
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const slots = getBuildSlots(rect.width, rect.height);
  const slot = slots[state.towers.length % slots.length];
  const jitterX = (Math.random() - 0.5) * 18;
  const jitterY = (Math.random() - 0.5) * 18;

  state.gold -= cost;
  state.towers.push({
    id: `${spec.id}_${Date.now()}_${state.towers.length}`,
    specId: spec.id,
    name: spec.name,
    x: slot.x + jitterX,
    y: slot.y + jitterY,
    level: 1,
    cd: 0,
    color: spec.color,
    range: spec.range,
    rate: spec.rate,
    dmg: spec.dmg,
  });
  showToast(`${spec.name} を配置しました`);
  renderTowerDrawer();
}

function upgradeTower(tower) {
  const mit = getStatBonus("upg_cost_accel_mitigate");
  const cost = calcAcceleratedCost(80, tower.level, 1.15, mit);
  if (state.gold < cost) {
    showToast("アップグレード資金が足りません");
    return;
  }
  state.gold -= cost;
  tower.level += 1;
  tower.dmg *= 1.25;
  renderTowerDrawer();
}

function triggerGrowth() {
  const mit = getStatBonus("growth_cost_accel_mitigate");
  const cost = calcAcceleratedCost(200, state.growthLv, 1.18, mit);
  if (state.gold < cost) {
    showToast("成長促進のゴールドが足りません");
    return;
  }
  state.gold -= cost;
  state.growthLv += 1;
  state.rp += 15 + state.growthLv * 5;
  for (const t of state.towers) {
    t.dmg *= 1.08;
  }
  showToast(`成長促進 Lv.${state.growthLv} 達成！`);
  renderTowerDrawer();
}

function stepSimulation(dt, width, height) {
  const simDt = state.paused ? 0 : dt * state.speedMult;
  if (simDt <= 0) return;

  if (state.spawnQueue > 0) {
    state.spawnTimer -= simDt;
    if (state.spawnTimer <= 0) {
      spawnEnemy(width, height);
      state.spawnQueue -= 1;
      state.spawnTimer = Math.max(0.18, 0.75 - state.wave * 0.01);
    }
  } else if (state.enemies.length === 0 && state.autoWave) {
    startWave(state.wave % 5 === 0);
  }

  const path = getPathPoints(width, height);
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i];
    if (e.freezeTimer > 0) {
      e.freezeTimer -= simDt;
    } else {
      const target = path[e.seg + 1];
      if (!target) {
        state.baseHp = Math.max(0, state.baseHp - 1);
        state.enemies.splice(i, 1);
        continue;
      }
      const dx = target.x - e.x;
      const dy = target.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      const move = e.speed * e.slowFactor * simDt;
      if (move >= dist) {
        e.x = target.x;
        e.y = target.y;
        e.seg += 1;
      } else {
        e.x += (dx / dist) * move;
        e.y += (dy / dist) * move;
      }
    }
    e.slowFactor = Math.min(1.0, e.slowFactor + simDt * 0.25);
  }

  const globalDmgMult = (1 + getStatBonus("all_dmg_pct")) * Math.pow(1.08, state.growthLv - 1);
  const globalAspdMult = 1 + getStatBonus("all_aspd_pct");
  const critRate = 0.15 + getStatBonus("crit_rate");

  for (const t of state.towers) {
    t.cd -= simDt * globalAspdMult;
    if (t.cd > 0) continue;

    // Pick target in range
    let target = null;
    for (const e of state.enemies) {
      if (Math.hypot(e.x - t.x, e.y - t.y) <= t.range) {
        target = e;
        break;
      }
    }
    if (!target) continue;

    const effectiveRate = t.rate * globalAspdMult;
    t.cd = 1 / Math.max(0.1, effectiveRate);

    if (t.specId === "frost") {
      target.slowFactor = Math.max(0.2, target.slowFactor - 0.14);
      target.freezeTimer = Math.max(target.freezeTimer, 0.25);
    }

    const critHits = rollCritHits(critRate);
    const critMult = calcCritMultiplier(critHits);
    const finalDmg = t.dmg * globalDmgMult * critMult;
    target.hp -= finalDmg;

    // High attack speed (10/s - 20/s) switches to beam-like visual
    const useBeam = effectiveRate >= 10 || t.specId === "laser";
    if (perf.tier < 3 && state.beams.length < 40) {
      state.beams.push({
        x1: t.x,
        y1: t.y,
        x2: target.x,
        y2: target.y,
        color: t.color,
        life: useBeam ? 0.06 : 0.11,
      });
    }

    if (perf.tier < 2 && state.popups.length < 35) {
      state.popups.push({
        x: target.x + (Math.random() - 0.5) * 14,
        y: target.y - 10,
        text: formatNum(finalDmg),
        color: critHits > 0 ? "#ffd166" : "#ffffff",
        life: 0.55,
      });
    }

    if (target.hp <= 0) {
      const idx = state.enemies.indexOf(target);
      if (idx !== -1) state.enemies.splice(idx, 1);

      const goldGain = (12 + state.wave * 3) * (1 + getStatBonus("gold_gain_pct"));
      const rpGain = (1 + state.wave * 0.25) * (1 + getStatBonus("rp_gain_pct"));
      const rampageMult = calcRampageScoreMultiplier(target.maxHp, state.rampageLevel);
      const scoreGain = (25 + state.wave * 10) * rampageMult;

      state.gold += goldGain;
      state.rp += rpGain;
      state.score += scoreGain;
    }
  }

  for (let i = state.beams.length - 1; i >= 0; i--) {
    state.beams[i].life -= simDt;
    if (state.beams[i].life <= 0) state.beams.splice(i, 1);
  }
  for (let i = state.popups.length - 1; i >= 0; i--) {
    state.popups[i].y -= 24 * simDt;
    state.popups[i].life -= simDt;
    if (state.popups[i].life <= 0) state.popups.splice(i, 1);
  }
}

function renderScene(width, height) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#13212d";
  ctx.fillRect(0, 0, width, height);

  const path = getPathPoints(width, height);
  ctx.save();
  ctx.strokeStyle = "#2f4359";
  ctx.lineWidth = perf.tier >= 2 ? 22 : 30;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  path.forEach((pt, idx) => {
    if (idx === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  });
  ctx.stroke();
  ctx.restore();

  // Draw towers
  for (const t of state.towers) {
    ctx.fillStyle = t.color;
    ctx.beginPath();
    ctx.arc(t.x, t.y, 13, 0, Math.PI * 2);
    ctx.fill();
    if (perf.tier < 2) {
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`Lv.${t.level}`, t.x, t.y + 23);
    }
  }

  // Draw enemies
  for (const e of state.enemies) {
    ctx.fillStyle = e.freezeTimer > 0 ? "#63b3ed" : "#f56565";
    ctx.beginPath();
    ctx.arc(e.x, e.y, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw attack beams/lines
  if (perf.tier < 3) {
    for (const b of state.beams) {
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();
    }
  }

  // Draw damage popups
  if (perf.tier < 2) {
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    for (const p of state.popups) {
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
  }
}

function updateHud() {
  document.getElementById("hud-wave").textContent = formatNum(state.wave);
  document.getElementById("hud-rampage").textContent = formatNum(state.rampageLevel);
  document.getElementById("hud-enemies").textContent = `${state.enemies.length}/${state.spawnQueue}`;
  document.getElementById("hud-fps").textContent = `${perf.fps}`;
  document.getElementById("hud-gold").textContent = formatNum(state.gold);
  document.getElementById("hud-rp").textContent = formatNum(state.rp);
  document.getElementById("hud-base").textContent = `${formatNum(state.baseHp)}/${formatNum(state.maxBaseHp)}`;
  document.getElementById("hud-score").textContent = formatNum(state.score);

  appShell.setAttribute("data-perf-tier", String(perf.tier));
  document.getElementById("perf-badge").textContent = perf.getTierLabel();
}

function renderTreeDrawer() {
  const tabsEl = document.getElementById("tree-tabs");
  const listEl = document.getElementById("tree-list");
  const tabs = [
    ["combat", "戦闘(55)"],
    ["economy", "経済(45)"],
    ["defense", "防衛(45)"],
    ["construction", "建設(40)"],
    ["tactics", "戦術(40)"],
  ];
  tabsEl.innerHTML = "";
  for (const [catId, label] of tabs) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `tab-btn ${state.activeTab === catId ? "active" : ""}`;
    btn.textContent = label;
    btn.addEventListener("click", () => {
      state.activeTab = catId;
      renderTreeDrawer();
    });
    tabsEl.appendChild(btn);
  }

  listEl.innerHTML = "";
  const filtered = researchNodes.filter((n) => n.category === state.activeTab);
  for (const node of filtered) {
    const unlocked = state.unlockedNodes.has(node.id);
    const parentOk = !node.parent_id || state.unlockedNodes.has(node.parent_id);
    const affordable = state.rp >= node.cost_rp;

    const card = document.createElement("div");
    card.className = `node-card ${unlocked ? "unlocked" : ""}`;
    card.innerHTML = `
      <div class="node-top">
        <span class="node-title">[${node.id}] ${node.name}</span>
        <span class="node-cost">${unlocked ? "習得済" : formatNum(node.cost_rp) + " RP"}</span>
      </div>
      <p class="node-desc">${node.description}</p>
    `;

    if (!unlocked) {
      const actBtn = document.createElement("button");
      actBtn.type = "button";
      actBtn.className = "btn-primary";
      actBtn.disabled = !parentOk || !affordable;
      actBtn.textContent = !parentOk ? "前提ノード未解放" : affordable ? "研究する" : "RP不足";
      actBtn.addEventListener("click", () => {
        state.rp -= node.cost_rp;
        state.unlockedNodes.add(node.id);
        renderTreeDrawer();
        updateHud();
      });
      card.appendChild(actBtn);
    }
    listEl.appendChild(card);
  }
}

function renderTowerDrawer() {
  const mit = getStatBonus("growth_cost_accel_mitigate");
  const gCost = calcAcceleratedCost(200, state.growthLv, 1.18, mit);
  document.getElementById("growth-lv").textContent = formatNum(state.growthLv);
  document.getElementById("growth-cost").textContent = formatNum(gCost);

  const shopEl = document.getElementById("tower-shop-list");
  shopEl.innerHTML = "";
  const discount = Math.min(0.6, getStatBonus("build_cost_discount_pct"));

  for (const spec of Object.values(TOWER_SPECS)) {
    const isUnlocked = !spec.unlockNode || state.unlockedNodes.has(spec.unlockNode);
    const cost = Math.max(10, Math.round(spec.cost * (1 - discount)));
    const card = document.createElement("div");
    card.className = "shop-card";
    card.innerHTML = `
      <div class="shop-row">
        <div>
          <div class="node-title">${spec.name}</div>
          <div class="muted">${isUnlocked ? `コスト: ${formatNum(cost)} G` : `要研究: ${spec.unlockNode}`}</div>
        </div>
      </div>
    `;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-primary";
    btn.disabled = !isUnlocked || state.gold < cost;
    btn.textContent = isUnlocked ? "配置" : "未解放";
    btn.addEventListener("click", () => placeTower(spec.id));
    card.querySelector(".shop-row").appendChild(btn);
    shopEl.appendChild(card);
  }

  const selBox = document.getElementById("selected-tower-box");
  const sel = state.towers.find((t) => t.id === state.selectedTowerId);
  if (!sel) {
    selBox.innerHTML = `<p class="muted">配置済みタワー（${state.towers.length}基）をタップすると個別強化できます。</p>`;
  } else {
    const uMit = getStatBonus("upg_cost_accel_mitigate");
    const uCost = calcAcceleratedCost(80, sel.level, 1.15, uMit);
    selBox.innerHTML = `<div class="node-title">${sel.name} (Lv.${sel.level}) — 次強化: ${formatNum(uCost)} G</div>`;
    const upgBtn = document.createElement("button");
    upgBtn.type = "button";
    upgBtn.className = "btn-primary";
    upgBtn.style.marginTop = "6px";
    upgBtn.disabled = state.gold < uCost;
    upgBtn.textContent = "レベルアップ";
    upgBtn.addEventListener("click", () => upgradeTower(sel));
    selBox.appendChild(upgBtn);
  }
}

function bindEvents() {
  window.addEventListener("resize", resizeCanvas);

  canvas.addEventListener("click", (ev) => {
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const hit = state.towers.find((t) => Math.hypot(t.x - x, t.y - y) <= 22);
    if (hit) {
      state.selectedTowerId = hit.id;
      document.getElementById("tower-drawer").classList.remove("hidden");
      renderTowerDrawer();
    }
  });

  document.getElementById("btn-rush").addEventListener("click", () => startWave(false));
  document.getElementById("btn-auto").addEventListener("click", (e) => {
    state.autoWave = !state.autoWave;
    e.currentTarget.classList.toggle("active", state.autoWave);
    e.currentTarget.textContent = `自動: ${state.autoWave ? "ON" : "OFF"}`;
  });
  document.getElementById("btn-pause").addEventListener("click", (e) => {
    state.paused = !state.paused;
    e.currentTarget.classList.toggle("active", state.paused);
  });

  document.getElementById("btn-open-tree").addEventListener("click", () => {
    renderTreeDrawer();
    document.getElementById("tree-drawer").classList.remove("hidden");
  });
  document.getElementById("btn-close-tree").addEventListener("click", () => {
    document.getElementById("tree-drawer").classList.add("hidden");
  });

  document.getElementById("btn-open-tower").addEventListener("click", () => {
    renderTowerDrawer();
    document.getElementById("tower-drawer").classList.remove("hidden");
  });
  document.getElementById("btn-close-tower").addEventListener("click", () => {
    document.getElementById("tower-drawer").classList.add("hidden");
  });
  document.getElementById("btn-growth").addEventListener("click", triggerGrowth);

  document.querySelectorAll(".btn-spd").forEach((btn) => {
    btn.addEventListener("click", () => {
      const spd = Number(btn.dataset.spd) || 1;
      state.speedMult = spd;
      document.querySelectorAll(".btn-spd").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });
}

async function init() {
  const res = await fetch("./research_tree_225.json");
  const data = await res.json();
  researchNodes = data.nodes || [];

  bindEvents();
  resizeCanvas();
  placeTower("sniper");
  updateHud();

  let lastTime = performance.now();
  function loop(now) {
    const rawDt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;

    const prevTier = perf.tier;
    perf.update(rawDt);
    if (perf.tier !== prevTier) {
      resizeCanvas();
    }

    if (state.toastTimer > 0) {
      state.toastTimer -= rawDt;
      if (state.toastTimer <= 0) {
        document.getElementById("toast-banner").classList.remove("show");
      }
    }

    const rect = canvas.getBoundingClientRect();
    stepSimulation(rawDt, rect.width, rect.height);
    renderScene(rect.width, rect.height);
    updateHud();

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

init();
