// ==UserScript==
// @name         EA FC All-in-One SBC, Locks (with names), and Pack Opener
// @namespace    http://tampermonkey.net/
// @version      4.2
// @description  Multi-template SBC auto-fill, named lock system, and pack opener in EA FC Web App
// @match        https://www.ea.com/*/fc/ultimate-team/web-app/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Load lock list, upgrade if needed
    let templates = JSON.parse(localStorage.getItem("sbc_templates")) || {};
    let lockedPlayers = JSON.parse(localStorage.getItem("locked_players")) || [];
    if (lockedPlayers.length && typeof lockedPlayers[0] === "string") {
        // Upgrade old format to new object format
        lockedPlayers = lockedPlayers.map(id => ({ id, name: "Unknown", rating: "-", pos: "-" }));
        localStorage.setItem("locked_players", JSON.stringify(lockedPlayers));
    }

    let autoRunning = false;
    let completedCount = 0;

    /** ---------- GUI CREATION ---------- **/
    function createGUI() {
        if (document.getElementById("eaToolsGUI")) return;

        const gui = document.createElement("div");
        gui.id = "eaToolsGUI";
        gui.style.position = "fixed";
        gui.style.top = "100px";
        gui.style.right = "20px";
        gui.style.background = "#111";
        gui.style.color = "#fff";
        gui.style.padding = "10px";
        gui.style.border = "1px solid #555";
        gui.style.zIndex = "9999";
        gui.style.fontSize = "14px";
        gui.style.width = "240px";

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
                document.querySelectorAll(".tabContent").forEach(tab => tab.style.display = "none");
                document.getElementById(`tab-${btn.dataset.tab}`).style.display = "block";
            };
        });

        document.getElementById("saveTemplateBtn").onclick = saveTemplate;
        document.getElementById("startAutoBtn").onclick = () => { autoRunning = true; runAuto(); };
        document.getElementById("stopAutoBtn").onclick = () => { autoRunning = false; };
        document.getElementById("startPacksBtn").onclick = openAllPacks;

        updateTemplateList();
        updateLockList();
    }

    function updateTemplateList() {
        const select = document.getElementById("templateSelect");
        if (!select) return;
        select.innerHTML = "";
        for (let id in templates) {
            const option = document.createElement("option");
            option.value = id;
            option.textContent = `${id} (${templates[id].positions.length} slots)`;
            select.appendChild(option);
        }
    }

    function updateLockList() {
        const lockDiv = document.getElementById("lockedList");
        if (!lockDiv) return;
        if (!lockedPlayers.length) {
            lockDiv.innerHTML = "<i>No locked players</i>";
            return;
        }
        lockDiv.innerHTML = "<b>Locked Players:</b><br>" + lockedPlayers.map(p =>
            `🔒 ${p.name} – ${p.rating} ${p.pos}`
        ).join("<br>");
    }

    /** ---------- SBC TEMPLATE ---------- **/
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
        const selectedId = select.value;
        if (!templates[selectedId]) {
            alert("No template selected!");
            autoRunning = false;
            return;
        }

        while (autoRunning) {
            const filled = await fillSquadFromTemplate(templates[selectedId]);
            if (!filled) {
                console.log("[EA Tools] No more players.");
                autoRunning = false;
                break;
            }
            await submitSBC();
            completedCount++;
            document.getElementById("completedCount").textContent = completedCount;
            await delay(2500 + Math.random() * 2000);
        }
    }

    async function fillSquadFromTemplate(template) {
        const clubPlayers = await services.ClubService.requestClubPlayers();
        const available = clubPlayers
            .filter(p => !p.isInSquad() && !lockedPlayers.some(lp => lp.id === p.id))
            .sort((a, b) => a._auction._startingBid - b._auction._startingBid);

        let filled = false;
        for (let pos of template.positions) {
            const player = available.find(p => p.preferredPosition === pos);
            if (player) {
                await services.SBCChallengeService.placePlayerInSlot(template.challengeId, pos, player.id);
                await delay(400 + Math.random() * 300);
                filled = true;
            }
        }
        return filled;
    }

    async function submitSBC() {
        const challenge = services.SBCChallengeService.getCurrentChallenge();
        await services.SBCChallengeService.submitChallenge(challenge.getDefinition().id);
    }

    /** ---------- PACK OPENER ---------- **/
    async function openAllPacks() {
        console.log("[EA Tools] Opening all packs...");
        const store = services.StoreService.getStore();
        const packs = store.getUnopenedPacks();

        for (let pack of packs) {
            await services.StoreService.openPack(pack.id);
            await delay(1500 + Math.random() * 1000);
            await services.StoreService.sendAllToClubOrUnassigned();
            await delay(1500 + Math.random() * 1000);
        }
        alert("All packs opened!");
    }

    /** ---------- VISUAL LOCKS ---------- **/
    function injectLockIcons() {
        const playerCards = document.querySelectorAll(".listFUTItem");
        playerCards.forEach(card => {
            if (card.querySelector(".lockIcon")) return; // already added
            const playerId = card.getAttribute("data-id");
            if (!playerId) return;

            // Get player details from card DOM
            const name = card.querySelector(".name")?.innerText || "Unknown";
            const rating = card.querySelector(".rating")?.innerText || "-";
            const pos = card.querySelector(".position")?.innerText || "-";

            const lockBtn = document.createElement("div");
            const isLocked = lockedPlayers.some(lp => lp.id === playerId);
            lockBtn.textContent = isLocked ? "🔒" : "🔓";
            lockBtn.className = "lockIcon";
            lockBtn.style.position = "absolute";
            lockBtn.style.top = "5px";
            lockBtn.style.right = "5px";
            lockBtn.style.fontSize = "16px";
            lockBtn.style.cursor = "pointer";
            lockBtn.style.zIndex = "10000";
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

    /** ---------- UTILS ---------- **/
    function delay(ms) {
        return new Promise(res => setTimeout(res, ms));
    }

    /** ---------- INIT ---------- **/
    setInterval(() => {
        if (document.body && !document.getElementById("eaToolsGUI")) {
            createGUI();
        }
        if (document.querySelector(".listFUTItem")) {
            injectLockIcons();
        }
    }, 2000);

})();
