/**
 * Focus Field — block list + Pomodoro.
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

  const active =
    state.alwaysOn || state.phase === "focus";
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

async function tick() {
  const s = await getState();
  if (s.phase === "idle") {
    await updateBadge(s);
    return;
  }
  if (Date.now() >= (s.endsAt || 0)) {
    if (s.phase === "focus") {
      // start break
      const endsAt = Date.now() + Math.max(1, s.breakMinutes) * 60 * 1000;
      await setState({
        phase: "break",
        endsAt,
        sessionsCompleted: (s.sessionsCompleted || 0) + 1,
      });
      chrome.notifications?.create?.({
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: "Focus Field",
        message: "Focus done. Break time.",
      });
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
      send({ ok: true, state });
    });
    return true;
  }
  if (msg?.type === "ff:stop") {
    setState({ phase: "idle", endsAt: 0 }).then((state) =>
      send({ ok: true, state })
    );
    return true;
  }
});
