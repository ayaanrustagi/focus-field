/**
 * Focus Field · webcam timelapse for Pomodoro focus sessions.
 * Captures a JPEG frame every N seconds while phase === "focus",
 * then stitches them into a short WebM when focus ends.
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const CAPTURE_W = 640;
  const CAPTURE_H = 480;
  const OUTPUT_FPS = 12;
  const JPEG_Q = 0.72;

  const preview = $("preview");
  const snap = $("snap");
  const ctx = snap.getContext("2d", { willReadFrequently: true });
  snap.width = CAPTURE_W;
  snap.height = CAPTURE_H;

  let stream = null;
  let frames = []; // data URLs
  let captureTimer = null;
  let lastPhase = "idle";
  let recording = false;
  let encoding = false;
  let lastBlobUrl = null;
  let intervalSec = 2;

  function fmt(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }

  function showError(msg) {
    const el = $("error");
    if (!msg) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = msg;
  }

  function setUi({ title, sub, phase, timerText }) {
    if (title != null) $("status-title").textContent = title;
    if (sub != null) $("status-sub").textContent = sub;
    if (phase != null) $("phase").textContent = phase;
    if (timerText != null) $("timer").textContent = timerText;
    $("frame-count").textContent = `${frames.length} frame${frames.length === 1 ? "" : "s"}`;
    $("interval-label").textContent = `${intervalSec}s`;
  }

  async function enableCamera() {
    showError("");
    try {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
      }
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: CAPTURE_W },
          height: { ideal: CAPTURE_H },
          facingMode: "user",
        },
        audio: false,
      });
      preview.srcObject = stream;
      await preview.play().catch(() => {});
      $("enable-cam").textContent = "camera on";
      $("enable-cam").disabled = true;
      setUi({
        title: recording ? "Recording" : "Camera ready",
        sub: recording
          ? "Snapping frames during focus. Keep this window open."
          : "Start a focus session from the Focus Field popup.",
      });
    } catch (err) {
      console.error(err);
      showError(
        "Camera permission denied or unavailable. Allow camera access for this extension page, then try again."
      );
      $("enable-cam").textContent = "enable camera";
      $("enable-cam").disabled = false;
    }
  }

  function captureFrame() {
    if (!stream || !preview.videoWidth) return;
    // mirror to match preview feel
    ctx.save();
    ctx.translate(CAPTURE_W, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(preview, 0, 0, CAPTURE_W, CAPTURE_H);
    ctx.restore();

    // subtle timestamp bar
    const now = new Date();
    const stamp = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    ctx.fillStyle = "rgba(15, 23, 42, 0.55)";
    ctx.fillRect(0, CAPTURE_H - 28, CAPTURE_W, 28);
    ctx.fillStyle = "#e0e7ff";
    ctx.font = "600 13px system-ui, sans-serif";
    ctx.fillText(`Focus Field · ${stamp} · #${frames.length + 1}`, 10, CAPTURE_H - 10);

    try {
      frames.push(snap.toDataURL("image/jpeg", JPEG_Q));
    } catch (e) {
      console.warn("frame capture failed", e);
    }
    $("frame-count").textContent = `${frames.length} frame${frames.length === 1 ? "" : "s"}`;
  }

  function startCapturing() {
    if (recording) return;
    recording = true;
    frames = [];
    clearResult();
    $("download").disabled = true;
    captureFrame();
    const ms = Math.max(1000, (intervalSec || 2) * 1000);
    captureTimer = setInterval(captureFrame, ms);
    setUi({
      title: "Recording",
      sub: "Snapping frames during focus. Keep this window open.",
    });
  }

  function stopCapturing() {
    if (captureTimer) {
      clearInterval(captureTimer);
      captureTimer = null;
    }
    recording = false;
  }

  function clearResult() {
    if (lastBlobUrl) {
      URL.revokeObjectURL(lastBlobUrl);
      lastBlobUrl = null;
    }
    const result = $("result");
    result.hidden = true;
    result.removeAttribute("src");
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function encodeWebm() {
    if (encoding) return null;
    if (!frames.length) {
      showError("No frames captured — was the camera on during focus?");
      return null;
    }

    encoding = true;
    setUi({
      title: "Encoding…",
      sub: `Stitching ${frames.length} frames into a timelapse video.`,
    });
    $("download").disabled = true;

    const canvas = document.createElement("canvas");
    canvas.width = CAPTURE_W;
    canvas.height = CAPTURE_H;
    const c = canvas.getContext("2d");
    // 0 = manual frames via requestFrame()
    const outStream = canvas.captureStream(0);
    const track = outStream.getVideoTracks()[0];
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
        ? "video/webm;codecs=vp8"
        : "video/webm";

    const chunks = [];
    const rec = new MediaRecorder(outStream, {
      mimeType: mime,
      videoBitsPerSecond: 2_500_000,
    });
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };

    const blobPromise = new Promise((resolve, reject) => {
      rec.onstop = () => {
        outStream.getTracks().forEach((t) => t.stop());
        resolve(new Blob(chunks, { type: mime.split(";")[0] }));
      };
      rec.onerror = (e) => reject(e.error || new Error("MediaRecorder failed"));
    });

    const pushFrame = async (drawFn) => {
      drawFn();
      if (track && typeof track.requestFrame === "function") {
        track.requestFrame();
      }
      await sleep(Math.round(1000 / OUTPUT_FPS));
    };

    try {
      rec.start(100);
      await pushFrame(() => {
        c.fillStyle = "#0f172a";
        c.fillRect(0, 0, CAPTURE_W, CAPTURE_H);
      });

      for (let i = 0; i < frames.length; i++) {
        const img = await loadImage(frames[i]);
        await pushFrame(() => {
          c.drawImage(img, 0, 0, CAPTURE_W, CAPTURE_H);
        });
      }
      // hold last frame a beat
      await sleep(120);
      if (rec.state === "recording") rec.stop();
      const blob = await blobPromise;
      encoding = false;
      return blob;
    } catch (err) {
      encoding = false;
      console.error(err);
      showError("Could not encode video. Try again after another focus session.");
      try {
        if (rec.state === "recording") rec.stop();
      } catch (_) {
        /* */
      }
      outStream.getTracks().forEach((t) => t.stop());
      return null;
    }
  }

  async function finalizeSession(reason) {
    stopCapturing();
    if (!frames.length) {
      setUi({
        title: reason === "stop" ? "Stopped" : "Focus done",
        sub: "No frames were captured this session.",
      });
      return;
    }

    const blob = await encodeWebm();
    if (!blob) {
      setUi({
        title: "Almost",
        sub: "Encoding failed — frames were kept in memory only.",
      });
      return;
    }

    clearResult();
    lastBlobUrl = URL.createObjectURL(blob);
    const result = $("result");
    result.src = lastBlobUrl;
    result.hidden = false;
    $("download").disabled = false;
    $("download").onclick = () => {
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      a.href = lastBlobUrl;
      a.download = `focus-field-timelapse-${stamp}.webm`;
      a.click();
    };

    const secs = Math.max(1, Math.round(frames.length / OUTPUT_FPS));
    setUi({
      title: reason === "stop" ? "Session stopped" : "Timelapse ready",
      sub: `${frames.length} frames → ~${secs}s video at ${OUTPUT_FPS}fps. Download below.`,
    });

    chrome.runtime.sendMessage({
      type: "ff:timelapse-done",
      frames: frames.length,
    }).catch(() => {});
  }

  function applyState(state) {
    if (!state) return;
    intervalSec = Math.max(1, Number(state.timelapseIntervalSec) || 2);
    $("interval-label").textContent = `${intervalSec}s`;

    const phase = state.phase || "idle";
    const left =
      phase === "focus" || phase === "break"
        ? fmt((state.endsAt || 0) - Date.now())
        : "--:--";

    setUi({ phase, timerText: left });

    // start recording when entering focus with timelapse on
    if (
      state.timelapseEnabled &&
      phase === "focus" &&
      lastPhase !== "focus"
    ) {
      if (!stream) {
        enableCamera().then(() => startCapturing());
      } else {
        startCapturing();
      }
    }

    // end of focus → encode (break or idle after focus)
    if (lastPhase === "focus" && phase !== "focus" && recording) {
      finalizeSession(phase === "idle" ? "stop" : "done");
    }

    // user stopped while recording
    if (lastPhase === "focus" && phase === "idle" && !recording && frames.length) {
      // already handled above if recording; otherwise nothing
    }

    if (phase === "focus" && recording) {
      setUi({
        title: "Recording",
        sub: "Snapping frames during focus. Keep this window open.",
        phase,
        timerText: left,
      });
    } else if (phase === "break" && !encoding && !lastBlobUrl) {
      setUi({
        title: "Break",
        sub: frames.length
          ? "Focus ended — encoding your timelapse…"
          : "Break time. Start another focus to record.",
        phase,
        timerText: left,
      });
    } else if (phase === "idle" && !encoding && !lastBlobUrl) {
      setUi({
        title: stream ? "Camera ready" : "Ready",
        sub: state.timelapseEnabled
          ? "Start focus from the popup — this window will record the session."
          : "Turn on “record timelapse” in the popup, then start focus.",
        phase,
        timerText: left,
      });
    }

    lastPhase = phase;
  }

  function poll() {
    chrome.runtime.sendMessage({ type: "ff:get" }, (r) => {
      if (chrome.runtime.lastError) return;
      if (r?.state) applyState(r.state);
    });
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "ff:state" && msg.state) {
      applyState(msg.state);
    }
    if (msg?.type === "ff:timelapse-stop") {
      if (recording) finalizeSession("stop");
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.focusfield) return;
    applyState(changes.focusfield.newValue);
  });

  $("enable-cam").addEventListener("click", () => enableCamera());

  // boot
  poll();
  setInterval(poll, 1000);

  // auto-request camera if timelapse already enabled
  chrome.runtime.sendMessage({ type: "ff:get" }, (r) => {
    if (r?.state?.timelapseEnabled) {
      enableCamera();
    }
  });

  window.addEventListener("beforeunload", () => {
    stopCapturing();
    if (stream) stream.getTracks().forEach((t) => t.stop());
  });
})();
