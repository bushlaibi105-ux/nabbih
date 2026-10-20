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
  function theme(c) { if (themeMeta) themeMeta.setAttribute("content", c); }

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
  function loadLogo() {
    var src = cfg.logo === undefined ? "assets/logo.png" : cfg.logo;
    if (!src) return Promise.resolve();
    return new Promise(function (res) {
      var img = $("#brandLogo");
      img.onload = function () {
        img.hidden = false;
        img.alt = cfg.brandName || "نبّه";
        if (!cfg.showWordmarkWithLogo) $("#brandWord").hidden = true;
        res();
      };
      img.onerror = function () { res(); }; // keep built-in wordmark
      img.src = src + (src.indexOf("?") < 0 ? "?v=" + (cfg.version || "1") : "");
    });
  }
  var configReady = fetch("config.json", { cache: "no-cache" })
    .then(function (r) { return r.ok ? r.json() : {}; })
    .catch(function () { return {}; })
    .then(function (c) { applyConfig(c); loadLogo(); });

  /* ---------- timeline helpers ---------- */
  var timers = [];
  function at(ms, fn) { timers.push(setTimeout(fn, ms)); }
  function clearAll() { timers.forEach(clearTimeout); timers = []; }
  function phase(name) {
    body.className = body.className.replace(/\bphase-\S+/g, "").trim() + " phase-" + name;
  }
  function flash() {
    if (calm) return;
    var f = $(".flash"); f.classList.remove("on"); void f.offsetWidth; f.classList.add("on");
  }
  var alertEl = $("#alertText"), alertSub = $("#alertSub");
  function setAlert(t, sub) {
    alertEl.textContent = t; alertEl.setAttribute("data-text", t);
    if (sub) alertSub.textContent = sub;
    alertEl.classList.remove("swap"); void alertEl.offsetWidth; alertEl.classList.add("swap");
    flash();
  }

  /* ---------- digital noise ---------- */
  var noiseOn = false, cv = $("#noise"), cx = cv.getContext && cv.getContext("2d"), img;
  function noiseSize() {
    cv.width = Math.max(60, Math.round(innerWidth / 3));
    cv.height = Math.max(100, Math.round(innerHeight / 3));
    img = cx.createImageData(cv.width, cv.height);
  }
  function noiseLoop() {
    if (!noiseOn) return;
    var d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      var v = (Math.random() * 255) | 0;
      d[i] = v; d[i + 1] = v * 0.25; d[i + 2] = v * 0.3; d[i + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
    requestAnimationFrame(noiseLoop);
  }
  function startNoise() { if (calm || !cx) return; noiseSize(); noiseOn = true; noiseLoop(); }

  /* ---------- tear bars + flashes ---------- */
  var tearTimer;
  function tears(intense) {
    if (calm) return;
    var box = $(".tears");
    clearInterval(tearTimer);
    tearTimer = setInterval(function () {
      box.innerHTML = "";
      if (Math.random() < (intense ? 0.75 : 0.4)) {
        var n = 1 + ((Math.random() * 3) | 0);
        for (var i = 0; i < n; i++) {
          var b = document.createElement("i");
          b.style.top = (Math.random() * 100) + "%";
          b.style.height = (2 + Math.random() * (intense ? 34 : 12)) + "px";
          b.style.opacity = (0.25 + Math.random() * 0.6).toFixed(2);
          b.style.transform = "translateX(" + ((Math.random() * 40 - 20) | 0) + "px)";
          box.appendChild(b);
        }
      }
    }, 70);
  }
  function stopTears() { clearInterval(tearTimer); $(".tears").innerHTML = ""; }

  /* ---------- HUD ---------- */
  var hexTimer, clockTimer;
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function startHud() {
    var clock = $("#hudClock");
    clockTimer = setInterval(function () {
      var d = new Date();
      clock.textContent = pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()) + "." + pad((d.getMilliseconds() / 10) | 0);
    }, 47);
    if (!calm) {
      var col = $("#hexcol"), hx = "0123456789ABCDEF";
      hexTimer = setInterval(function () {
        var s = "";
        for (var i = 0; i < 260; i++) s += hx[(Math.random() * 16) | 0];
        col.textContent = s;
      }, 90);
    }
  }
  function stopHud() { clearInterval(hexTimer); clearInterval(clockTimer); }

  // Device label is derived locally from the user agent purely for display; it is never stored or sent.
  function deviceLabel() {
    var ua = navigator.userAgent, m;
    if ((m = ua.match(/iPhone OS (\d+)[_.](\d+)/))) return "iPhone · iOS " + m[1] + "." + m[2];
    if ((m = ua.match(/iPad.*OS (\d+)[_.](\d+)/))) return "iPad · iPadOS " + m[1] + "." + m[2];
    if ((m = ua.match(/Android (\d+(\.\d+)?)/))) return "Android " + m[1];
    if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return "iPad · iPadOS";
    return navigator.platform || "Unknown device";
  }
  function rnd(n) { var s = "", h = "0123456789abcdef"; while (n--) s += h[(Math.random() * 16) | 0]; return s; }

  function runTerminal(duration) {
    var term = document.createElement("div");
    $("#term").innerHTML = ""; $("#term").appendChild(term);
    var w = Math.round(screen.width * (devicePixelRatio || 1)), h = Math.round(screen.height * (devicePixelRatio || 1));
    var lines = [
      ["d", "$ ./link_handler --session " + rnd(8)],
      ["", "> resolving redirect chain ........ "], ["ok", "OK"],
      ["", "> device fingerprint: "], ["ok", deviceLabel()],
      ["", "> display " + w + "x" + h + " @" + (devicePixelRatio || 1) + "x"],
      ["w", "! sandbox policy bypass attempt"],
      ["", "> opening /contacts .............. "], ["w", "READ"],
      ["", "> indexing /DCIM/camera ........... "], ["w", "READ"],
      ["d", "  0x" + rnd(4) + " 0x" + rnd(4) + " 0x" + rnd(4) + " 0x" + rnd(4)],
      ["", "> dumping keychain/autofill ........ "], ["w", "FOUND"],
      ["", "> geo lookup ........................ "], ["ok", "LOCKED"],
      ["d", "  pkt " + rnd(6) + " → 185." + ((Math.random() * 255) | 0) + ".x.x:443"],
      ["", "> uploading archive ............... "], ["w", "100%"],
      ["w", "!! ACCESS GRANTED"]
    ];
    var i = 0, step = Math.max(60, duration / lines.length);
    (function next() {
      if (i >= lines.length) return;
      var l = lines[i++];
      var prev = term.querySelector(".cur"); if (prev) prev.classList.remove("cur");
      var sp = document.createElement("span");
      if (l[0]) sp.className = l[0];
      sp.textContent = l[1];
      // a status token stays on the same line as its label
      var joinable = l[0] && i > 1 && /\.\s$|: $/.test(lines[i - 2][1]);
      if (!joinable && term.childNodes.length) term.appendChild(document.createTextNode("\n"));
      term.appendChild(sp); sp.classList.add("cur");
      timers.push(setTimeout(next, step * (0.6 + Math.random() * 0.8)));
    })();
  }

  function runModules(start, span) {
    var items = document.querySelectorAll("#modules li");
    var gap = span / items.length;
    items.forEach(function (li, k) {
      at(start + k * gap, function () { li.classList.add("go"); li.querySelector("b").textContent = "SCAN"; });
      at(start + k * gap + 700, function () { li.classList.add("done"); li.querySelector("b").textContent = "EXPOSED"; });
    });
  }
  function runPct(start, dur) {
    var el = $("#pct");
    at(start, function () {
      var t0 = performance.now();
      (function tick() {
        var p = Math.min(1, (performance.now() - t0) / dur);
        var e = 1 - Math.pow(1 - p, 2.2);
        el.textContent = Math.round(e * 100 - (p < 1 ? Math.random() * 2 : 0)).toString().replace("-", "");
        if (p < 1 && body.classList.contains("phase-scan")) requestAnimationFrame(tick);
      })();
    });
  }

  function endAttack() {
    noiseOn = false; stopTears(); stopHud();
    body.classList.remove("crash", "hit", "shaking");
    $("#skip").hidden = true;
  }

  /* ---------- relief + message ---------- */
  function relief() {
    endAttack();
    phase("safe"); theme("#050607");
    at(150, function () { $(".safe-1").classList.add("in"); });
    at(750, function () { $(".safe-2").classList.add("in"); });
    at(1650, function () { $(".safe-3").classList.add("in"); });
    at(3050, function () { phase("final"); theme("#000000"); });
    at(3250, function () { $(".f1").classList.add("in"); });
    at(3950, function () { $(".f2").classList.add("in"); });
    at(4650, function () { $(".f3").classList.add("in"); });
    at(5450, function () { $("#brand").classList.add("in"); });
    at(6800, function () { var r = $("#replay"); r.hidden = false; requestAnimationFrame(function () { r.classList.add("in"); }); });
  }

  /* ---------- master timeline (ms) ---------- */
  function run() {
    // 0–1s: innocent landing page
    at(950, function () { if (!calm) body.classList.add("hit"); flash(); });
    // 1–3s: glitch takeover
    at(calm ? 1000 : 1200, function () {
      body.classList.remove("hit");
      phase("attack"); theme("#000000");
      startNoise(); tears(true);
      setAlert("SECURITY WARNING", "تم رصد نشاط غير معتاد");
      var s = $("#skip"); s.hidden = false;
    });
    at(1800, function () { setAlert("SUSPICIOUS LINK DETECTED", "الرابط الذي فتحته غير موثوق"); });
    at(2400, function () {
      setAlert("SYSTEM SECURITY ALERT", "جاري فحص جهازك…");
      if (!calm) { body.classList.add("shaking"); at(600, function () { body.classList.remove("shaking"); }); }
    });
    // 3–6s: scan HUD
    at(3000, function () { phase("scan"); body.classList.add("scanned"); tears(false); startHud(); runTerminal(2500); flash(); });
    runModules(3200, 2100);
    runPct(3050, 2450);
    at(5600, function () { flash(); tears(true); });
    // crescendo → cut to relief at ~6s
    if (calm) {
      at(5900, relief);
    } else {
      at(5750, function () { body.classList.add("crash"); });
      at(6200, relief);
    }
  }

  $("#skip").addEventListener("click", function () { clearAll(); relief(); });
  $("#replay").addEventListener("click", function () {
    var u = new URL(location.href); u.searchParams.set("r", Date.now().toString(36)); location.replace(u.toString());
  });
  addEventListener("resize", function () { if (noiseOn) noiseSize(); });

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
