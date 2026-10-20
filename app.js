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
  function clearAll() { timers.forEach(clearTimeout); timers = []; }
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
  var TEAR_C = [[0, 28, 19], [28, 2, -42], [54, 21, -13], [86, 9, 27]];

  /* ---------- in-page error windows (layers inside this page, never real windows) ---------- */
  var winsEl = $("#wins");
  var WINS = [
    { t: "Connection interrupted", d: "The connection to this page was reset.", c: "ERR_CONNECTION_RESET", i: "" },
    { t: "Unexpected redirect", d: "This page tried to send you somewhere else.", c: "302 → /r/7f3a2c", i: "amber" },
    { t: "Untrusted script blocked", d: "A script from an unknown source was stopped.", c: "l.js · 185.62.x.x", i: "" },
    { t: "Session error", d: "This page session is no longer valid.", c: "SESSION_INVALID (0x1c)", i: "grey" }
  ];
  function popWin(w, x, y, jolt) {
    Array.prototype.forEach.call(winsEl.children, function (n) { n.classList.add("under"); });
    var el = document.createElement("div");
    el.className = "win" + (jolt && !calm ? " jolt" : "");
    el.style.left = x; el.style.top = y;
    el.innerHTML = '<div class="win-h"><i class="' + w.i + '"></i><b></b><u>×</u></div><div class="win-b"><span></span><code></code></div>';
    el.querySelector("b").textContent = w.t;
    el.querySelector("span").textContent = w.d;
    el.querySelector("code").textContent = w.c;
    winsEl.appendChild(el);
    sTick(w.i === "amber" ? 1600 : 900);
  }

  /* ---------- black: terse event log ---------- */
  var blog = $("#blog"), logOn = false;
  var EVENTS = [
    ["connect", "reset"], ["redirect", "/r/7f3a2c"], ["script", "l.js blocked", 1], ["session", "invalid", 1],
    ["origin", "mismatch"], ["frame", "detached"], ["retry", "1/3"], ["retry", "2/3"], ["socket", "185.62.x.x"],
    ["dom", "rewritten"], ["session", "reset", 1], ["redirect", "/r/9c01"], ["storage", "cleared"],
    ["frame", "reloaded"], ["policy", "violation", 1], ["retry", "3/3"], ["page", "not responding", 1]
  ];
  function pad(n, l) { n = String(n); while (n.length < (l || 2)) n = "0" + n; return n; }
  function stamp() { var d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()) + "." + pad(d.getMilliseconds(), 3); }
  function runLog(gap) {
    logOn = true; var i = 0;
    (function next() {
      if (!logOn) return;
      if (!frozen && i < EVENTS.length) {
        var e = EVENTS[i++], p = document.createElement("p");
        if (e[2]) p.className = "e";
        p.innerHTML = "<span></span><b></b><i></i>";
        p.children[0].textContent = stamp(); p.children[1].textContent = e[0]; p.children[2].textContent = e[1];
        p.children[2].style.fontStyle = "normal";
        blog.appendChild(p);
        while (blog.children.length > 9) blog.removeChild(blog.firstChild);
        sTick(e[2] ? 800 : 2400);
      }
      timers.push(setTimeout(next, gap));
    })();
  }

  function endMiddle() {
    logOn = false; frozen = false;
    tearBox.innerHTML = ""; bf.classList.remove("on"); winsEl.innerHTML = "";
    ["stall", "shift", "shift2", "blogging", "frozen", "hang", "dim1", "dim2", "dim3", "dim4"].forEach(off);
    $("#skip").hidden = true;
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
     2.0–3.6  the page stalls and shifts; error windows pop up, then cascade; page dims
     3.6–5.0  hard cut to black: terse event log races
     5.0–5.5  FREEZE: the picture stops dead (visual only)
     5.5–7.5  pure black — no text, no motion
     7.5→     "لا تخاف، جهازك آمن" — stays until the visitor leaves or replays */
  function run() {
    var badge = $(".intro-badge"), sub = $(".intro-sub");
    on("run");
    soundInit();

    // the page stops behaving
    at(2000, function () { on("stall"); sub.textContent = cfg.stallText || "تعذّر تحميل الصفحة"; glitchTitle(null, 80); sBurst(0.05, 3000, 0.15); $("#skip").hidden = false; });
    at(2120, function () { on("shift"); });
    at(2200, function () { popWin(WINS[0], "6%", "15%", true); });
    at(2380, function () { popWin(WINS[1], "14%", "28%"); });
    at(2520, function () { vanish(badge); off("shift"); on("shift2"); });
    at(2560, function () { popWin(WINS[2], "4%", "42%", true); tear(TEAR_A, 70); });
    at(2720, function () { popWin(WINS[3], "15%", "55%"); });
    at(2780, function () { on("dim1"); theme("#d9dbdf"); });

    // cascade: the same errors, faster, in a trail
    for (var k = 0; k < 8; k++) (function (k) {
      at(2860 + k * 75, function () {
        popWin(WINS[(k + 3) % 4], "calc(3% + " + (k * 14) + "px)", "calc(10% + " + (k * 24) + "px)", k % 3 === 0);
      });
    })(k);
    at(3000, function () { on("dim2"); theme("#7d8087"); });
    at(3200, function () { on("dim3"); theme("#17181b"); sHum(); });
    at(3260, function () { glitchTitle("g2", 120); });
    at(3450, function () { freeze(110); });
    at(3560, function () { tear(TEAR_B, 60); });
    at(3620, function () { blackFrame(40); });

    // black: the event log
    at(3660, function () { on("dim4"); on("blogging"); winsEl.innerHTML = ""; theme("#000000"); runLog(calm ? 140 : 78); });
    at(4300, function () { freeze(80); });
    at(4560, function () { tear(TEAR_C, 50); });
    at(4700, function () { blackFrame(30); });

    // 5.0–5.5 — the freeze
    at(5000, function () { hang(500); });
    // 5.5–7.5 — black, still, silent
    at(5500, function () { endMiddle(); phase("void"); theme("#000000"); });
    // 7.5 — reassurance
    at(7500, relief);
  }

  $("#skip").addEventListener("click", function () { clearAll(); relief(); });
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
