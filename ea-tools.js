(function () {
  'use strict';

  // --- wait until EA's internal services are loaded ---
  function waitForServices(keys = ["SBCChallengeService","ClubService"], timeoutMs = 30000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      (function check() {
        if (window.services && keys.every(k => services[k])) return resolve();
        if (Date.now() - start > timeoutMs) return reject(new Error("EA services not found"));
        setTimeout(check, 400);
      })();
    });
  }

  // upgrade old lockedPlayers format (ids only) -> objects
  let templates = JSON.parse(localStorage.getItem("sbc_templates")) || {};
  let lockedPlayers = JSON.parse(localStorage.getItem("locked_players")) || [];
  if (lockedPlayers.length && typeof lockedPlayers[0] === "string") {
    lockedPlayers = lockedPlayers.map(id => ({ id, name: "Unknown", rating: "-", pos: "-" }));
    localStorage.setItem("locked_players", JSON.stringify(lockedPlayers));
  }

  let autoRunning = false;
  let completedCount = 0;

  function delay(ms){ return new Promise(res => setTimeout(res, ms)); }

  function createGUI() {
    if (document.getElementById("eaToolsGUI")) return;
    const gui = document.createElement("div");
    gui.id = "eaToolsGUI";
    Object.assign(gui.style, {
      position:"fixed", top:"100px", right:"20px", background:"#111", color:"#fff",
      padding:"10px", border:"1px solid #555", zIndex:999999, fontSize:"14px", width:"240px"
    });
    gui.innerHTML = `
      <div>
        <button class="tabBtn" data-tab="sbc">SBC Mode</button>
        <button class="tabBtn" data-tab="pack">Pack Mode</button>
        <button class="tabBtn" data-tab="locks">Locks</button>
      </div>
      <div id="tab-sbc" class="tabContent">
        <select id="templateSelect" style="width:220px"></select><br><br>
        <button id="saveTemplateBtn">💾 Save Template</button><br><br>
        <button id="startAutoBtn">▶ Start Auto</button><br><br>
        <button id="stopAutoBtn">⏹ Stop Auto</button><br><br>
        Completed: <span id="completedCount">0</span>
      </div>
      <div id="tab-pack" class="tabContent" style="display:none;">
        <button id="startPacksBtn">📦 Open All Packs</button>
      </div>
      <div id="tab-locks" class="tabContent" style="display:none; max-height:300px; overflow-y:auto;">
        <div id="lockedList"></div>
      </div>
    `;
    document.body.appendChild(gui);

    document.querySelectorAll(".tabBtn").forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll(".tabContent").forEach(t => t.style.display = "none");
        document.getElementById(`tab-${btn.dataset.tab}`).style.display = "block";
      };
    });

    document.getElementById("saveTemplateBtn").onclick = saveTemplate;
    document.getElementById("startAutoBtn").onclick = () => { autoRunning = true; runAuto(); };
    document.getElementById("stopAutoBtn").onclick  = () => { autoRunning = false; };
    document.getElementById("startPacksBtn").onclick = openAllPacks;

    updateTemplateList();
    updateLockList();
  }

  function updateTemplateList() {
    const select = document.getElementById("templateSelect");
    if (!select) return;
    select.innerHTML = "";
    for (let id in templates) {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = `${id} (${templates[id].positions.length} slots)`;
      select.appendChild(opt);
    }
  }

  function updateLockList() {
    const lockDiv = document.getElementById("lockedList");
    if (!lockDiv) return;
    if (!lockedPlayers.length) { lockDiv.innerHTML = "<i>No locked players</i>"; return; }
    lockDiv.innerHTML = "<b>Locked Players:</b><br>" + lockedPlayers.map(p =>
      `🔒 ${p.name} – ${p.rating} ${p.pos}`
    ).join("<br>");
  }

  // --- SBC: save template, fill, submit, loop ---
  function saveTemplate() {
    try {
      const challenge = services.SBCChallengeService.getCurrentChallenge();
      const positions = challenge.getSquad().map(slot => slot.position);
      const challengeId = challenge.getDefinition().id;
      templates[challengeId] = { challengeId, positions };
      localStorage.setItem("sbc_templates", JSON.stringify(templates));
      updateTemplateList();
      alert(`Template saved for SBC: ${challengeId}`);
    } catch (e) {
      alert("Could not save template. Make sure you are inside an SBC.");
    }
  }

  async function runAuto() {
    const select = document.getElementById("templateSelect");
    const selectedId = select?.value;
    if (!selectedId || !templates[selectedId]) {
      alert("No template selected!");
      autoRunning = false;
      return;
    }
    while (autoRunning) {
      const filled = await fillSquadFromTemplate(templates[selectedId]);
      if (!filled) { console.log("[EA Tools] No more players."); autoRunning = false; break; }
      await submitSBC();
      completedCount++;
      const c = document.getElementById("completedCount"); if (c) c.textContent = completedCount;
      await delay(2500 + Math.random()*2000);
    }
  }

  async function fillSquadFromTemplate(template) {
    const clubPlayers = await services.ClubService.requestClubPlayers();
    const available = clubPlayers
      .filter(p => !p.isInSquad() && !lockedPlayers.some(lp => lp.id === p.id))
      .sort((a,b) => (a._auction?._startingBid||0) - (b._auction?._startingBid||0));

    let filled = false;
    for (let pos of template.positions) {
      const player = available.find(p => p.preferredPosition === pos);
      if (player) {
        await services.SBCChallengeService.placePlayerInSlot(template.challengeId, pos, player.id);
        await delay(400 + Math.random()*300);
        filled = true;
      }
    }
    return filled;
  }

  async function submitSBC() {
    const challenge = services.SBCChallengeService.getCurrentChallenge();
    await services.SBCChallengeService.submitChallenge(challenge.getDefinition().id);
  }

  // --- Pack opener ---
  async function openAllPacks() {
    console.log("[EA Tools] Opening all packs…");
    const store = services.StoreService.getStore?.();
    if (!store || !store.getUnopenedPacks) { alert("Store not available"); return; }
    const packs = store.getUnopenedPacks();
    for (let pack of packs) {
      await services.StoreService.openPack(pack.id);
      await delay(1500 + Math.random()*1000);
      if (services.StoreService.sendAllToClubOrUnassigned) {
        await services.StoreService.sendAllToClubOrUnassigned();
      }
      await delay(1500 + Math.random()*1000);
    }
    alert("All packs opened!");
  }

  // --- Visual locks on club cards ---
  function injectLockIcons() {
    const cards = document.querySelectorAll(".listFUTItem");
    cards.forEach(card => {
      if (card.querySelector(".lockIcon")) return;
      const playerId = card.getAttribute("data-id");
      if (!playerId) return;

      const name = card.querySelector(".name")?.innerText || "Unknown";
      const rating = card.querySelector(".rating")?.innerText || "-";
      const pos = card.querySelector(".position")?.innerText || "-";

      const isLocked = lockedPlayers.some(lp => lp.id === playerId);
      const lockBtn = document.createElement("div");
      lockBtn.textContent = isLocked ? "🔒" : "🔓";
      lockBtn.className = "lockIcon";
      Object.assign(lockBtn.style, {
        position:"absolute", top:"5px", right:"5px", fontSize:"16px",
        cursor:"pointer", zIndex:10000
      });
      lockBtn.onclick = () => {
        if (lockedPlayers.some(lp => lp.id === playerId)) {
          lockedPlayers = lockedPlayers.filter(lp => lp.id !== playerId);
          lockBtn.textContent = "🔓";
        } else {
          lockedPlayers.push({ id: playerId, name, rating, pos });
          lockBtn.textContent = "🔒";
        }
        localStorage.setItem("locked_players", JSON.stringify(lockedPlayers));
        updateLockList();
      };

      card.style.position = "relative";
      card.appendChild(lockBtn);
    });
  }

// --- Boot sequence ---
(async () => {
  try {
    await waitForServices(["SBCChallengeService","ClubService","StoreService"]);
    createGUI();
    setInterval(() => {
      if (!document.getElementById("eaToolsGUI")) createGUI();
      if (document.querySelector(".listFUTItem")) injectLockIcons();
    }, 1500);
    console.log("[EA Tools] Loaded.");
  } catch (e) {
    console.warn("[EA Tools] Could not initialize:", e.message);
    alert("EA Tools: services not ready. Open an SBC/Club/Store screen and click the bookmark again.");
  }
})();
