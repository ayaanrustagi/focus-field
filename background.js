/**
 * Focus Field — block list + Pomodoro + optional webcam timelapse window.
 * Blocks via declarativeNetRequest dynamic rules when focus session is active
 * or "always block" mode is on.
 */

const DEFAULTS = {
  blocklist: [
    "twitter.com",
    "x.com",
    "instagram.com",
    "reddit.com",
    "youtube.com",
    "tiktok.com",
    "facebook.com",
    "netflix.com",
  ],
  alwaysOn: false,
  focusMinutes: 25,
  breakMinutes: 5,
  // session
  phase: "idle", // idle | focus | break
  endsAt: 0,
  sessionsCompleted: 0,
  // timelapse
  timelapseEnabled: false,
  timelapseIntervalSec: 2,
  timelapseWindowId: null,
};

async function getState() {
  const r = await chrome.storage.local.get("focusfield");
  return { ...DEFAULTS, ...(r.focusfield || {}) };
}

async function setState(partial) {
  const cur = await getState();
  const next = { ...cur, ...partial };
  if (partial.blocklist) next.blocklist = partial.blocklist;
  await chrome.storage.local.set({ focusfield: next });
  await syncRules(next);
  await updateBadge(next);
  // notify open pages (popup / timelapse)
  try {
    chrome.runtime.sendMessage({ type: "ff:state", state: next }).catch(() => {});
  } catch (_) {
    /* no listeners */
  }
  return next;
}

function hostToRule(id, host) {
  const h = host.replace(/^www\./, "").toLowerCase();
  return {
    id,
    priority: 1,
    action: {
      type: "redirect",
      redirect: { extensionPath: "/content/blocked.html" },
    },
    condition: {
      urlFilter: `||${h}^`,
      resourceTypes: ["main_frame"],
    },
  };
}

async function syncRules(state) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existing.map((r) => r.id);

  const active = state.alwaysOn || state.phase === "focus";
  const addRules = [];

  if (active) {
    let id = 1;
    for (const host of state.blocklist || []) {
      if (!host.trim()) continue;
      addRules.push(hostToRule(id++, host.trim()));
    }
  }

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: removeIds,
    addRules,
  });
}

async function updateBadge(state) {
  if (state.phase === "focus") {
    const left = Math.max(0, (state.endsAt || 0) - Date.now());
    const m = Math.ceil(left / 60000);
    await chrome.action.setBadgeText({ text: String(m) });
    await chrome.action.setBadgeBackgroundColor({ color: "#4338ca" });
  } else if (state.phase === "break") {
    const left = Math.max(0, (state.endsAt || 0) - Date.now());
    const m = Math.ceil(left / 60000);
    await chrome.action.setBadgeText({ text: String(m) });
    await chrome.action.setBadgeBackgroundColor({ color: "#818cf8" });
  } else if (state.alwaysOn) {
    await chrome.action.setBadgeText({ text: "ON" });
    await chrome.action.setBadgeBackgroundColor({ color: "#4338ca" });
  } else {
    await chrome.action.setBadgeText({ text: "" });
  }
}

/** Open or focus the webcam timelapse window. */
async function ensureTimelapseWindow(state) {
  const url = chrome.runtime.getURL("timelapse/timelapse.html");

  if (state.timelapseWindowId) {
    try {
      const win = await chrome.windows.get(state.timelapseWindowId);
      if (win) {
        await chrome.windows.update(state.timelapseWindowId, { focused: true });
        return state.timelapseWindowId;
      }
    } catch (_) {
      /* gone */
    }
  }

  const win = await chrome.windows.create({
    url,
    type: "popup",
    width: 420,
    height: 640,
    focused: true,
  });
  const id = win?.id ?? null;
  if (id != null) {
    // persist window id without re-broadcasting a full session reset
    const cur = await getState();
    const next = { ...cur, timelapseWindowId: id };
    await chrome.storage.local.set({ focusfield: next });
  }
  return id;
}

async function tick() {
  const s = await getState();
  if (s.phase === "idle") {
    await updateBadge(s);
    return;
  }
  if (Date.now() >= (s.endsAt || 0)) {
    if (s.phase === "focus") {
      const endsAt = Date.now() + Math.max(1, s.breakMinutes) * 60 * 1000;
      await setState({
        phase: "break",
        endsAt,
        sessionsCompleted: (s.sessionsCompleted || 0) + 1,
      });
      try {
        chrome.notifications?.create?.({
          type: "basic",
          iconUrl: "icons/icon128.png",
          title: "Focus Field",
          message: s.timelapseEnabled
            ? "Focus done. Break time — check your timelapse window."
            : "Focus done. Break time.",
        });
      } catch (_) {
        /* optional */
      }
    } else if (s.phase === "break") {
      await setState({ phase: "idle", endsAt: 0 });
    }
  } else {
    await updateBadge(s);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const r = await chrome.storage.local.get("focusfield");
  if (!r.focusfield) await chrome.storage.local.set({ focusfield: DEFAULTS });
  const s = await getState();
  await syncRules(s);
  chrome.alarms.create("focus-tick", { periodInMinutes: 0.5 });
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "focus-tick") tick();
});

// clear window id if user closes the timelapse popup
chrome.windows.onRemoved.addListener(async (windowId) => {
  const s = await getState();
  if (s.timelapseWindowId === windowId) {
    await setState({ timelapseWindowId: null });
  }
});

chrome.runtime.onMessage.addListener((msg, _s, send) => {
  if (msg?.type === "ff:get") {
    getState().then((state) => send({ state }));
    return true;
  }
  if (msg?.type === "ff:set") {
    setState(msg.patch || {}).then((state) => send({ ok: true, state }));
    return true;
  }
  if (msg?.type === "ff:start-focus") {
    getState().then(async (s) => {
      const mins = Math.max(1, s.focusMinutes || 25);
      const state = await setState({
        phase: "focus",
        endsAt: Date.now() + mins * 60 * 1000,
      });
      if (state.timelapseEnabled) {
        try {
          await ensureTimelapseWindow(state);
        } catch (e) {
          console.warn("timelapse window", e);
        }
      }
      send({ ok: true, state });
    });
    return true;
  }
  if (msg?.type === "ff:stop") {
    getState().then(async (s) => {
      const state = await setState({ phase: "idle", endsAt: 0 });
      if (s.timelapseEnabled && s.timelapseWindowId) {
        try {
          chrome.runtime.sendMessage({ type: "ff:timelapse-stop" }).catch(() => {});
        } catch (_) {
          /* */
        }
      }
      send({ ok: true, state });
    });
    return true;
  }
  if (msg?.type === "ff:open-timelapse") {
    getState().then(async (s) => {
      const id = await ensureTimelapseWindow(s);
      send({ ok: true, windowId: id });
    });
    return true;
  }
  if (msg?.type === "ff:timelapse-done") {
    send({ ok: true });
    return false;
  }
});
