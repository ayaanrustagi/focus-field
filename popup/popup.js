const $ = (id) => document.getElementById(id);

function fmt(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function paint(state) {
  $("focus-min").value = state.focusMinutes ?? 25;
  $("break-min").value = state.breakMinutes ?? 5;
  $("always").checked = !!state.alwaysOn;
  $("timelapse").checked = !!state.timelapseEnabled;
  $("timelapse-interval").value = state.timelapseIntervalSec ?? 2;
  $("list").value = (state.blocklist || []).join("\n");
  $("done").textContent = String(state.sessionsCompleted || 0);

  const phase = state.phase || "idle";
  if (phase === "focus") {
    $("phase-title").textContent = state.timelapseEnabled
      ? "Focus · rec"
      : "Focus";
    $("timer").textContent = fmt((state.endsAt || 0) - Date.now());
  } else if (phase === "break") {
    $("phase-title").textContent = "Break";
    $("timer").textContent = fmt((state.endsAt || 0) - Date.now());
  } else {
    $("phase-title").textContent = state.alwaysOn ? "Blocking" : "Ready";
    const m = state.focusMinutes || 25;
    $("timer").textContent = `${String(m).padStart(2, "0")}:00`;
  }
}

function load() {
  chrome.runtime.sendMessage({ type: "ff:get" }, (r) => {
    if (r?.state) paint(r.state);
  });
}

function save(patch) {
  chrome.runtime.sendMessage({ type: "ff:set", patch }, (r) => {
    if (r?.state) paint(r.state);
  });
}

$("start").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "ff:start-focus" }, (r) => {
    if (r?.state) paint(r.state);
  });
});
$("stop").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "ff:stop" }, (r) => {
    if (r?.state) paint(r.state);
  });
});

$("focus-min").addEventListener("change", (e) =>
  save({ focusMinutes: Math.max(1, Number(e.target.value) || 25) })
);
$("break-min").addEventListener("change", (e) =>
  save({ breakMinutes: Math.max(1, Number(e.target.value) || 5) })
);
$("always").addEventListener("change", (e) => save({ alwaysOn: e.target.checked }));
$("timelapse").addEventListener("change", (e) => {
  const on = e.target.checked;
  save({ timelapseEnabled: on });
  if (on) {
    chrome.runtime.sendMessage({ type: "ff:open-timelapse" });
  }
});
$("timelapse-interval").addEventListener("change", (e) => {
  const n = Math.min(30, Math.max(1, Number(e.target.value) || 2));
  e.target.value = n;
  save({ timelapseIntervalSec: n });
});
$("open-timelapse").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "ff:open-timelapse" });
});
$("list").addEventListener("change", (e) => {
  const blocklist = e.target.value
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  save({ blocklist });
});

load();
setInterval(load, 1000);
