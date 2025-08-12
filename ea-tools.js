(function () {
  'use strict';

  /******************************
   * Minimal Paletools‑style UI *
   ******************************/

  const THEME = {
    bg: "#0f1115",
    panel: "#141821",
    border: "rgba(255,255,255,.08)",
    text: "#e6e6e6",
    sub: "rgba(230,230,230,.6)",
    accent: "#00d1ff", // cyan-ish accent
    accentSoft: "rgba(0,209,255,.15)"
  };

  let autoRunning = false;
  let completedCount = 0;
  let templates = JSON.parse(localStorage.getItem("sbc_templates")) || {};
  let lockedPlayers = JSON.parse(localStorage.getItem("locked_players")) || [];
  if (lockedPlayers.length && typeof lockedPlayers[0] === "string") {
    lockedPlayers = lockedPlayers.map(id => ({ id, name: "Unknown", rating: "-", pos: "-" }));
    localStorage.setItem("locked_players", JSON.stringify(lockedPlayers));
  }

  // service readiness flags
  const servicesReady = { sbc:false, club:false, store:false };
  function probeServices() {
    try {
      if (window.services?.SBCChallengeService) servicesReady.sbc = true;
      if (window.services?.ClubService)         servicesReady.club = true;
      if (window.services?.StoreService)        servicesReady.store = true;
    } catch (e) {}
  }
  function delay(ms){ return new Promise(res => setTimeout(res, ms)); }

  /*****************
   * UI Construction
   *****************/
  function injectStyles() {
    if (document.getElementById("eaToolsStyles")) return;
    const css = `
      @keyframes eaFade { from{opacity:0; transform:translateY(6px)} to{opacity:1; transform:none} }
      #eaDock { position:fixed; top:80px; right:24px; width:340px; height:460px; display:flex;
        background:${THEME.panel}; color:${THEME.text}; border:1px solid ${THEME.border};
        border-radius:14px; box-shadow:0 20px 60px rgba(0,0,0,.45); z-index:999999;
        backdrop-filter:saturate(1.1) blur(6px); font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,"Helvetica Neue",Arial;
        animation:eaFade .18s ease both; user-select:none; }
      #eaDock.ea-collapsed { height:56px; overflow:hidden; }
      #eaDockSidebar { width:56px; border-right:1px solid ${THEME.border}; display:flex; flex-direction:column; align-items:center; padding:8px 6px; gap:8px; background:${THEME.bg}; border-top-left-radius:14px; border-bottom-left-radius:14px;}
      .eaSideBtn { width:42px; height:42px; border-radius:12px; display:flex; align-items:center; justify-content:center; cursor:pointer;
        border:1px solid ${THEME.border}; color:${THEME.text}; background:transparent; transition:all .15s ease; }
      .eaSideBtn:hover { border-color:${THEME.accent}; box-shadow:0 0 0 3px ${THEME.accentSoft} inset; }
      .eaSideBtn.ea-active { background:${THEME.accentSoft}; border-color:${THEME.accent}; }
      .eaIcon { font-size:18px; line-height:1; }
      #eaDockMain { flex:1; display:flex; flex-direction:column; }
      #eaDockHeader { height:56px; display:flex; align-items:center; justify-content:space-between; padding:0 12px 0 10px;
        border-bottom:1px solid ${THEME.border}; background:linear-gradient(180deg, rgba(255,255,255,.02), transparent); }
      #eaTitle { display:flex; align-items:center; gap:10px; font-weight:600; }
      #eaBadge { width:22px; height:22px; border-radius:7px; background:${THEME.accentSoft}; border:1px solid ${THEME.accent}; display:flex; align-items:center; justify-content:center; font-size:13px; color:${THEME.accent}; }
      #eaHeaderBtns { display:flex; align-items:center; gap:6px; }
      .eaHdrBtn { width:30px; height:30px; border-radius:8px; border:1px solid ${THEME.border}; background:transparent; color:${THEME.sub}; display:flex; align-items:center; justify-content:center; cursor:pointer; }
      .eaHdrBtn:hover { color:${THEME.text}; border-color:${THEME.accent}; box-shadow:0 0 0 2px ${THEME.accentSoft} inset; }
      #eaTabs { display:flex; gap:6px; padding:10px 10px 0 10px; }
      .eaTab { flex:1; text-align:center; font-size:13px; padding:8px 10px; border-radius:10px; border:1px solid ${THEME.border}; background:#0f121a; color:${THEME.sub}; cursor:pointer; }
      .eaTab.ea-active { color:${THEME.text}; border-color:${THEME.accent}; box-shadow:0 0 0 3px ${THEME.accentSoft} inset; }
      #eaBody { padding:10px; overflow:auto; flex:1; }
      .eaField { margin-bottom:10px; }
      .eaBtn { display:inline-flex; align-items:center; gap:8px; font-weight:600; padding:8px 10px; border-radius:10px;
        border:1px solid ${THEME.border}; background:#0f121a; color:${THEME.text}; cursor:pointer; }
      .eaBtn:hover { border-color:${THEME.accent}; box-shadow:0 0 0 3px ${THEME.accentSoft} inset; }
      .eaSelect { width:100%; padding:8px 10px; border-radius:10px; border:1px solid ${THEME.border}; background:#0f121a; color:${THEME.text}; }
      .eaHelp { font-size:12px; color:${THEME.sub}; margin-top:6px; }
      #eaStatus { font-size:12px; color:${THEME.sub}; padding:8px 10px; border-top:1px dashed ${THEME.border}; }
      /* lock icons on cards */
      .lockIcon { position:absolute; top:6px; right:6px; font-size:16px; cursor:pointer; z-index:10000; }
    `;
    const style = document.createElement("style");
    style.id = "eaToolsStyles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  // Dock structure
  function createDock() {
    if (document.getElementById("eaDock")) return;

    const dock = document.createElement("div");
    dock.id = "eaDock";
    dock.innerHTML = `
      <div id="eaDockSidebar">
        <div class="eaSideBtn ea-active" data-tab="sbc" title="SBC"><span class="eaIcon">⏯</span></div>
        <div class="eaSideBtn" data-tab="pack" title="Packs"><span class="eaIcon">🎁</span></div>
        <div class="eaSideBtn" data-tab="locks" title="Locks"><span class="eaIcon">🔒</span></div>
      </div>
      <div id="eaDockMain">
        <div id="eaDockHeader">
          <div id="eaTitle">
            <div id="eaBadge">EA</div>
            <div>Tools</div>
          </div>
          <div id="eaHeaderBtns">
            <button class="eaHdrBtn" id="eaCollapse" title="Collapse">—</button>
            <button class="eaHdrBtn" id="eaClose" title="Close">✕</button>
          </div>
        </div>

        <div id="eaTabs">
          <div class="eaTab ea-active" data-tab="sbc">SBC Mode</div>
          <div class="eaTab" data-tab="pack">Pack Mode</div>
          <div class="eaTab" data-tab="locks">Locks</div>
        </div>

        <div id="eaBody"></div>
        <div id="eaStatus"></div>
      </div>
    `;
    document.body.appendChild(dock);

    // Draggable dock (desktop convenience)
    makeDraggable(dock, document.getElementById("eaDockHeader"));

    // Wire header buttons
    document.getElementById("eaClose").onclick = () => dock.remove();
    document.getElementById("eaCollapse").onclick = () => dock.classList.toggle("ea-collapsed");

    // Sidebar and tab sync
    dock.querySelectorAll(".eaSideBtn").forEach(btn=>{
      btn.onclick = ()=> switchTab(btn.dataset.tab);
    });
    dock.querySelectorAll(".eaTab").forEach(tab=>{
      tab.onclick = ()=> switchTab(tab.dataset.tab);
    });

    // Initial content
    renderTab("sbc");
    updateStatus();
  }

  function switchTab(tab) {
    const dock = document.getElementById("eaDock");
    if (!dock) return;
    dock.querySelectorAll(".eaSideBtn").forEach(b=>b.classList.toggle("ea-active", b.dataset.tab===tab));
    dock.querySelectorAll(".eaTab").forEach(t=>t.classList.toggle("ea-active", t.dataset.tab===tab));
    renderTab(tab);
  }

  function renderTab(tab) {
    const body = document.getElementById("eaBody");
    if (!body) return;

    if (tab === "sbc") {
      const options = Object.keys(templates).map(id=>`<option value="${id}">${id} (${templates[id].positions.length} slots)</option>`).join("");
      body.innerHTML = `
        <div class="eaField"><select id="templateSelect" class="eaSelect">${options}</select></div>
        <div class="eaField"><button class="eaBtn" id="saveTemplateBtn">💾 Save Template</button></div>
        <div class="eaField" style="display:flex; gap:8px;">
          <button class="eaBtn" id="startAutoBtn">▶ Start Auto</button>
          <button class="eaBtn" id="stopAutoBtn">⏹ Stop Auto</button>
        </div>
        <div class="eaHelp">Completed: <span id="completedCount">${completedCount}</span></div>
        <div class="eaHelp">Tip: Open an SBC first so services load.</div>
      `;
      document.getElementById("saveTemplateBtn").onclick = saveTemplate;
      document.getElementById("startAutoBtn").onclick = () => { autoRunning = true; runAuto(); };
      document.getElementById("stopAutoBtn").onclick  = () => { autoRunning = false; };
    }
    else if (tab === "pack") {
      body.innerHTML = `
        <div class="eaField"><button class="eaBtn" id="startPacksBtn">🎁 Open All Packs</button></div>
        <div class="eaHelp">Go to Store → My Packs first.</div>
      `;
      document.getElementById("startPacksBtn").onclick = openAllPacks;
    }
    else if (tab === "locks") {
      body.innerHTML = `
        <div id="lockedList" class="eaHelp"></div>
        <div class="eaHelp">Lock/unlock from Club view via the 🔒 on each card.</div>
      `;
      updateLockList();
    }
  }

  function updateStatus() {
    const el = document.getElementById("eaStatus");
    if (!el) return;
    el.textContent = `Services — SBC:${servicesReady.sbc?'✔':'…'}  Club:${servicesReady.club?'✔':'…'}  Store:${servicesReady.store?'✔':'…'}`;
  }

  function makeDraggable(el, handle) {
    let ox=0, oy=0, dragging=false;
    handle.style.cursor = "move";
    handle.addEventListener("mousedown", e=>{
      dragging = true; ox = e.clientX - el.getBoundingClientRect().left; oy = e.clientY - el.getBoundingClientRect().top;
      e.preventDefault();
    });
    window.addEventListener("mousemove", e=>{
      if (!dragging) return;
      el.style.top = Math.max(10, e.clientY - oy) + "px";
      el.style.right = "auto";
      el.style.left = Math.max(10, e.clientX - ox) + "px";
    });
    window.addEventListener("mouseup", ()=> dragging=false);
    // touch
    handle.addEventListener("touchstart", e=>{
      const t = e.touches[0];
      dragging = true; ox = t.clientX - el.getBoundingClientRect().left; oy = t.clientY - el.getBoundingClientRect().top;
    }, {passive:true});
    window.addEventListener("touchmove", e=>{
      if (!dragging) return;
      const t = e.touches[0];
      el.style.top = Math.max(10, t.clientY - oy) + "px";
      el.style.right = "auto";
      el.style.left = Math.max(10, t.clientX - ox) + "px";
    }, {passive:true});
    window.addEventListener("touchend", ()=> dragging=false);
  }

  /**********************
   * Logic & Integrations
   **********************/
  function guardSBC() {
    if (!window.services?.SBCChallengeService) {
      alert("Open any SBC challenge (show the squad grid), then press the button again.");
      return false;
    }
    return true;
  }
  function guardClub() {
    if (!window.services?.ClubService) {
      alert("Open Club → Players first so your club loads, then try again.");
      return false;
    }
    return true;
  }
  function guardStore() {
    if (!window.services?.StoreService) {
      alert("Open Store → My Packs first, then press the button again.");
      return false;
    }
    return true;
  }

  function updateTemplateList() {
    const select = document.getElementById("templateSelect");
    if (!select) return;
    select.innerHTML = Object.keys(templates).map(id=>`<option value="${id}">${id} (${templates[id].positions.length} slots)</option>`).join("");
  }

  function updateLockList() {
    const lockDiv = document.getElementById("lockedList");
    if (!lockDiv) return;
    if (!lockedPlayers.length) { lockDiv.innerHTML = "<i>No locked players</i>"; return; }
    lockDiv.innerHTML = lockedPlayers.map(p => `🔒 ${p.name} – ${p.rating} ${p.pos}`).join("<br>");
  }

  function saveTemplate() {
    if (!guardSBC()) return;
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
    if (!guardSBC() || !guardClub()) { autoRunning = false; return; }
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
    if (!guardClub()) return false;
    const clubPlayers = await services.ClubService.requestClubPlayers();
    const available = clubPlayers
      .filter(p => !p.isInSquad() && !lockedPlayers.some(lp => lp.id === p.id))
      .sort((a,b) => (a._auction?._startingBid||0) - (b._auction?._startingBid||0));

    let filled = false;
    for (let pos of template.positions) {
      const player = available.find(p => p.preferredPosition === pos);
      if (player) {
        if (!guardSBC()) return false;
        await services.SBCChallengeService.placePlayerInSlot(template.challengeId, pos, player.id);
        await delay(400 + Math.random()*300);
        filled = true;
      }
    }
    return filled;
  }

  async function submitSBC() {
    if (!guardSBC()) return;
    const challenge = services.SBCChallengeService.getCurrentChallenge();
    await services.SBCChallengeService.submitChallenge(challenge.getDefinition().id);
  }

  async function openAllPacks() {
    if (!guardStore()) return;
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

  // Visual locks on club cards
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

  /********
   * Boot *
   ********/
  injectStyles();
  createDock();
  probeServices(); updateStatus();

  // keep UI alive; add locks when club list exists
  setInterval(() => {
    if (!document.getElementById("eaDock")) { injectStyles(); createDock(); }
    if (document.querySelector(".listFUTItem")) injectLockIcons();
  }, 1500);

  // keep probing services & update footer status
  setInterval(()=>{ probeServices(); updateStatus(); }, 900);

  console.log("[EA Tools] Dock loaded. Navigate to SBC/Club/Store, then use the buttons.");

})();
