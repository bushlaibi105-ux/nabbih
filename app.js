/* Nabbih — QR awareness simulation.
   Purely visual: no network calls except loading this site's own config/logo,
   no permissions, no data collection, nothing leaves the device. */
(function () {
  "use strict";

  var $ = function (s) { return document.querySelector(s); };
  var body = document.body;
  var params = new URLSearchParams(location.search);
  var calm = params.has("calm") ||
    (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  if (calm) body.classList.add("calm");

  var themeMeta = document.querySelector('meta[name="theme-color"]');
  function theme(c) {
    if (themeMeta) themeMeta.setAttribute("content", c);
    document.documentElement.style.backgroundColor = c;
    body.style.backgroundColor = c; // browsers that tint their UI from the page pick this up
  }

  /* ---------- immersive: real fullscreen only where the browser allows it ----------
     Browsers only grant fullscreen in response to a user gesture, so we ask on the
     visitor's first natural touch (never via a button, never blocking exit).
     iPhone Safari has no page fullscreen; there the layout fills the visible area. */
  function tryFullscreen() {
    var el = document.documentElement;
    var req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req || document.fullscreenElement || document.webkitFullscreenElement) return;
    try { var r = req.call(el, { navigationUI: "hide" }); if (r && r.catch) r.catch(function () {}); } catch (e) {}
  }
  addEventListener("pointerdown", tryFullscreen, { once: true, passive: true });

  /* ---------- config (editable without rebuilding) ---------- */
  var cfg = {};
  function applyConfig(c) {
    cfg = c || {};
    document.querySelectorAll("[data-cfg]").forEach(function (el) {
      var v = cfg[el.getAttribute("data-cfg")];
      if (typeof v === "string" && v) el.textContent = v;
    });
    document.querySelectorAll("[data-cfg-html]").forEach(function (el) {
      var v = cfg[el.getAttribute("data-cfg-html")];
      if (typeof v === "string" && v) el.innerHTML = v;
    });
    if (cfg.pageTitle) document.title = cfg.pageTitle;
  }
  var configReady = fetch("config.json", { cache: "no-cache" })
    .then(function (r) { return r.ok ? r.json() : {}; })
    .catch(function () { return {}; })
    .then(function (c) { applyConfig(c); });

  /* ---------- timeline helpers ---------- */
  var timers = [];
  function at(ms, fn) { timers.push(setTimeout(fn, ms)); }
  function phase(name) {
    body.className = body.className.replace(/\bphase-\S+/g, "").trim() + " phase-" + name;
  }
  function on(c) { body.classList.add(c); }
  function off(c) { body.classList.remove(c); }
  function pulse(fn, undo, ms) { fn(); at(ms, undo); }

  /* ---------- optional sound (only if the browser already allows audio) ---------- */
  var snd = { ctx: null, out: null, noise: null, hum: [] };
  function soundInit() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      snd.ctx = new AC();
      snd.out = snd.ctx.createGain(); snd.out.gain.value = 0.55; snd.out.connect(snd.ctx.destination);
      var len = snd.ctx.sampleRate, buf = snd.ctx.createBuffer(1, len, snd.ctx.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      snd.noise = buf;
      if (snd.ctx.resume) snd.ctx.resume().catch(function () {});
      // a tap anywhere during the scene unlocks audio on browsers that require a gesture
      ["pointerdown", "touchstart", "keydown"].forEach(function (ev) {
        addEventListener(ev, function () { if (snd.ctx.state !== "running") snd.ctx.resume().catch(function () {}); }, { once: true, passive: true });
      });
    } catch (e) { snd.ctx = null; }
  }
  function live() { return snd.ctx && snd.ctx.state === "running"; }
  function sTick(f) {
    if (!live()) return;
    var t = snd.ctx.currentTime, o = snd.ctx.createOscillator(), g = snd.ctx.createGain();
    o.type = "square"; o.frequency.value = f || 2400;
    g.gain.setValueAtTime(0.035, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
    o.connect(g); g.connect(snd.out); o.start(t); o.stop(t + 0.02);
  }
  function sBurst(dur, freq, vol) {
    if (!live()) return;
    var t = snd.ctx.currentTime, s = snd.ctx.createBufferSource(), f = snd.ctx.createBiquadFilter(), g = snd.ctx.createGain();
    s.buffer = snd.noise; f.type = "bandpass"; f.frequency.value = freq || 1800; f.Q.value = 0.9;
    g.gain.setValueAtTime(vol || 0.22, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(snd.out); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
  function sHum() {
    if (!live()) return;
    var t = snd.ctx.currentTime, g = snd.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 3.2); g.connect(snd.out);
    [46, 92.5].forEach(function (fq) {
      var o = snd.ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = fq;
      o.frequency.linearRampToValueAtTime(fq * 1.12, t + 3.2);
      var lp = snd.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 220;
      o.connect(lp); lp.connect(g); o.start(t); snd.hum.push(o);
    });
    snd.hum.push(g);
  }
  function sCut() { // total silence is part of the shock
    if (!snd.ctx) return;
    try { snd.out.gain.cancelScheduledValues(0); snd.out.gain.value = 0; } catch (e) {}
    snd.hum.forEach(function (n) { try { n.stop ? n.stop() : n.disconnect(); } catch (e) {} });
  }

  /* ---------- page-level effects ---------- */
  var intro = $("#intro"), title = $(".intro-title");
  function vanish(el) { el.classList.add("gone"); sTick(1300); }
  function glitchTitle(cls, ms) {
    if (calm) return;
    title.setAttribute("data-text", title.textContent);
    title.classList.add("g"); if (cls) title.classList.add(cls);
    sBurst(ms / 1000, 2600, 0.12);
    at(ms, function () { title.classList.remove("g", "g2"); });
  }
  var bf = $("#bf");
  function blackFrame(ms) {
    if (calm) return;
    bf.classList.add("on");
    at(ms, function () { bf.classList.remove("on"); });
  }
  var frozen = false;
  function freeze(ms) {
    if (calm) return;
    frozen = true; on("frozen"); sCut(); // sound drops out with the picture
    at(ms, function () { frozen = false; off("frozen"); if (snd.ctx) snd.out.gain.value = 0.55; });
  }
  // the signature freeze: the picture just stops (visual only — the browser stays responsive)
  function hang(ms) {
    frozen = true; on("frozen"); on("hang"); sCut();
    at(ms, function () { frozen = false; off("frozen"); off("hang"); });
  }
  // precise tearing: a few designed horizontal bands of the live page, displaced
  var tearBox = $("#tear");
  function tear(bands, ms) {
    if (calm) return;
    tearBox.innerHTML = "";
    bands.forEach(function (b) {
      var s = document.createElement("div");
      s.className = "slice";
      s.style.clipPath = "inset(" + b[0] + "% 0 " + Math.max(0, 100 - b[0] - b[1]) + "% 0)";
      s.style.webkitClipPath = s.style.clipPath;
      s.style.transform = "translateX(" + b[2] + "px)";
      s.appendChild(intro.cloneNode(true));
      tearBox.appendChild(s);
    });
    sBurst(ms / 1000 + 0.03, 1400, 0.25);
    at(ms, function () { tearBox.innerHTML = ""; });
  }
  var TEAR_A = [[21, 6, -11], [63, 3, 17]];
  var TEAR_B = [[7, 13, -24], [37, 2, 31], [69, 10, -15]];
  
  /* ---------- centred alert cards (iOS-inspired, drawn inside this page — not system alerts) ---------- */
  var winsEl = $("#wins");
  var ALERTS = [
    { t: "Connection Interrupted", m: "The connection to this page was reset." },
    { t: "Unexpected Redirect", m: "This page tried to open another address." },
    { t: "Untrusted Script Blocked", m: "A script from an unknown source was stopped." },
    { t: "Session Error", m: "This page session is no longer valid." },
    { t: "Page Not Responding", m: "This page has stopped responding." }
  ];
  function popAlert(a, jolt) {
    // the previous card steps back and fades — limited overlap, one message at a time
    Array.prototype.forEach.call(winsEl.querySelectorAll(".ios:not(.back)"), function (n) {
      n.classList.add("back"); at(calm ? 0 : 220, function () { n.remove(); });
    });
    var el = document.createElement("div");
    el.className = "ios" + (jolt && !calm ? " jolt" : "");
    el.innerHTML = '<div class="t"></div><div class="m"></div><div class="b">OK</div>';
    el.children[0].textContent = a.t; el.children[1].textContent = a.m;
    winsEl.appendChild(el);
    sTick(1100);
  }

  /* ---------- a quarter-second dark digital flash (noise + one faint technical glimpse) ---------- */
  var blog = $("#blog"), logOn = false;
  function noiseTile() { // small grey grain tile, generated locally
    try {
      var c = document.createElement("canvas"); c.width = c.height = 96;
      var x = c.getContext("2d"), d = x.createImageData(96, 96);
      for (var i = 0; i < d.data.length; i += 4) { var v = (Math.random() * 255) | 0; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 46; }
      x.putImageData(d, 0, 0);
      document.documentElement.style.setProperty("--grain", "url(" + c.toDataURL() + ")");
    } catch (e) {}
  }
  function digitalFlash() {
    blog.innerHTML = "<p>net::ERR_CONNECTION_RESET</p>";
    sBurst(0.22, 1200, 0.22);
  }

  function endMiddle() {
    logOn = false; frozen = false;
    tearBox.innerHTML = ""; bf.classList.remove("on"); winsEl.innerHTML = "";
    ["stall", "shift", "shift2", "scrim", "scrim2", "blogging", "frozen", "hang", "dim1", "dim2", "dim3", "dim4"].forEach(off);
    sCut();
  }

  /* ---------- the only ending: reassurance, then it stays put ---------- */
  function relief() {
    endMiddle();
    phase("safe"); theme("#050607");
    at(150, function () { $(".safe-1").classList.add("in"); });
    at(900, function () { $(".safe-2").classList.add("in"); });
    at(1900, function () { $(".safe-club").classList.add("in"); });
    at(4500, function () { var r = $("#replay"); r.hidden = false; requestAnimationFrame(function () { r.classList.add("in"); }); });
  }

  /* ---------- master timeline (ms) ----------
     0.0–2.0  participation page, untouched
     2.0–4.0  the page stalls; centred alert cards appear one after another over a dimmed page
     4.0–4.25 dark digital flash: grain, a torn line, one faint technical glimpse
     4.25–4.75 FREEZE: the picture stops dead (visual only)
     4.75–5.35 pure black — no text, no motion
     5.35→    "لا تخاف، جهازك آمن" — stays until the visitor leaves or replays */
  function run() {
    var badge = $(".intro-badge"), sub = $(".intro-sub");
    on("run");
    soundInit(); noiseTile();

    // 2.0–4.0 — the page stops behaving; alerts take the centre of the screen
    at(2000, function () { on("stall"); sub.textContent = cfg.stallText || "تعذّر تحميل الصفحة"; glitchTitle(null, 80); sBurst(0.05, 3000, 0.15); });
    at(2080, function () { on("shift"); on("scrim"); });
    at(2150, function () { popAlert(ALERTS[0]); });
    at(2600, function () { popAlert(ALERTS[1]); vanish(badge); off("shift"); on("shift2"); });
    at(2750, function () { on("dim1"); theme("#d9dbdf"); });
    at(3020, function () { popAlert(ALERTS[2], true); tear(TEAR_A, 70); });
    at(3200, function () { on("dim2"); theme("#7d8087"); on("scrim2"); });
    at(3420, function () { popAlert(ALERTS[3]); });
    at(3560, function () { freeze(100); });
    at(3700, function () { popAlert(ALERTS[4], true); on("dim3"); theme("#17181b"); sHum(); });
    at(3840, function () { glitchTitle("g2", 100); tear(TEAR_B, 60); });
    at(3940, function () { blackFrame(40); });

    // 4.0–4.25 — a quarter-second dark digital flash
    at(4000, function () { on("dim4"); digitalFlash(); on("blogging"); winsEl.innerHTML = ""; theme("#000000"); });

    // 4.25–4.75 — the freeze (holds the flash's last frame)
    at(4250, function () { hang(500); });
    // 4.75–5.35 — black, still, silent
    at(4750, function () { endMiddle(); phase("void"); theme("#000000"); });
    // 5.35 — reassurance
    at(5350, relief);
  }

  $("#replay").addEventListener("click", function () {
    var u = new URL(location.href); u.searchParams.set("r", Date.now().toString(36)); location.replace(u.toString());
  });

  /* ---------- start: automatically, as soon as page is visible & font ready ---------- */
  var started = false;
  function start() {
    if (started) return; started = true;
    run();
  }
  function whenVisible() {
    if (document.visibilityState === "hidden") {
      document.addEventListener("visibilitychange", function h() {
        if (document.visibilityState === "visible") { document.removeEventListener("visibilitychange", h); start(); }
      });
    } else start();
  }
  var fontsReady = (document.fonts && document.fonts.ready) || Promise.resolve();
  var cap = new Promise(function (r) { setTimeout(r, 700); });
  Promise.race([Promise.all([fontsReady, configReady]), cap]).then(whenVisible);
})();
