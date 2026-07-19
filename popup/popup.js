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
  $("list").value = (state.blocklist || []).join("\n");
  $("done").textContent = String(state.sessionsCompleted || 0);

  const phase = state.phase || "idle";
  if (phase === "focus") {
    $("phase-title").textContent = "Focus";
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
$("list").addEventListener("change", (e) => {
  const blocklist = e.target.value
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  save({ blocklist });
});

load();
setInterval(load, 1000);
