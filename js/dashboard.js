/*
 * Kinetra Dashboard.
 *
 * The account system here is real: sign-up and sign-in call Kinetra's
 * actual backend (see accounts.py in the biomech-app repo), which hashes
 * and stores your password and hands back a signed session token. That
 * token is kept in this browser's localStorage and sent as a Bearer header
 * on every request that needs to know who you are.
 *
 * What's still sample data: the movement scores, streaks, sessions, and
 * roster below are generated deterministically from your account id, so
 * they look the same every time you sign back in, but they are not your
 * real sessions from the Kinetra app. The app doesn't push real data to
 * this backend yet; that's the "Movement Data Sync" item on the
 * Roadmap.
 */
(function () {
  "use strict";

  var API_BASE = "https://kinetra-5w8w.onrender.com";
  var TOKEN_KEY = "kinetra_dashboard_token_v1";
  var USER_KEY = "kinetra_dashboard_user_v1";

  // ---------- tiny deterministic PRNG (mulberry32), seeded from a string ----------
  function hashString(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
  }
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rngFor(name) {
    var seedFn = hashString(name || "kinetra");
    return mulberry32(seedFn());
  }

  // ---------- session storage (token + cached user) ----------
  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }
  function setSession(token, user) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (e) {}
  }
  function getStoredUser() {
    try {
      var raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function clearSession() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch (e) {}
  }

  // ---------- backend calls ----------
  // Render's free tier spins an idle backend down, so the first request
  // after a quiet period can take 20-50s to wake it. Without a client-side
  // cutoff, a request that never gets a response (a dropped connection
  // during a redeploy, a stalled cold start) leaves the caller's promise
  // pending forever -- which is exactly what made the sign-in button look
  // frozen. REQUEST_TIMEOUT_MS bounds that wait so it always settles.
  var REQUEST_TIMEOUT_MS = 45000;

  function apiRequest(path, options) {
    options = options || {};
    var headers = options.headers || {};
    headers["Content-Type"] = "application/json";
    var token = getToken();
    if (token) headers["Authorization"] = "Bearer " + token;

    var controller = (typeof AbortController !== "undefined") ? new AbortController() : null;
    var timedOut = false;
    var timeoutId = controller ? setTimeout(function () {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS) : null;

    return fetch(API_BASE + path, {
      method: options.method || "GET",
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error(data.error || data.details || "Something went wrong. Try again.");
          err.status = res.status;
          throw err;
        }
        return data;
      });
    }).catch(function (err) {
      if (timedOut) {
        throw new Error(
          "The Kinetra server is taking too long to respond. It's probably waking up from being idle -- wait a bit and try again."
        );
      }
      if (err instanceof TypeError) {
        // fetch() itself rejects (offline, CORS, or the backend is asleep
        // and slow to wake -- Render's free tier spins down an idle
        // service, and the first request after that can take 20-50s).
        var wrapped = new Error(
          "Couldn't reach the Kinetra server. It may be waking up after being idle -- wait a few seconds and try again."
        );
        throw wrapped;
      }
      throw err;
    }).finally(function () {
      if (timeoutId) clearTimeout(timeoutId);
    });
  }

  function signUp(name, email, password) {
    return apiRequest("/auth/signup", { method: "POST", body: { name: name, email: email, password: password } });
  }
  function signIn(email, password) {
    return apiRequest("/auth/login", { method: "POST", body: { email: email, password: password } });
  }
  function fetchMe() {
    return apiRequest("/auth/me", { method: "GET" });
  }

  // ---------- sample data generation (seeded by the real account id) ----------
  var MOVEMENTS = ["Sit-to-stand", "Single-leg balance", "Walking gait", "Shoulder reach", "Rehab rep set"];

  function gradeFor(score) {
    if (score >= 93) return "A";
    if (score >= 88) return "A-";
    if (score >= 83) return "B+";
    if (score >= 78) return "B";
    if (score >= 72) return "B-";
    return "C+";
  }

  function generateSampleData(seed) {
    var rng = rngFor(seed);
    var days = 28;
    var base = 74 + rng() * 10;
    var trend = rng() * 0.35;
    var scores = [];
    var today = new Date();

    for (var i = days - 1; i >= 0; i--) {
      var d = new Date(today);
      d.setDate(d.getDate() - i);
      var noise = (rng() - 0.5) * 9;
      var val = Math.max(55, Math.min(99, base + trend * (days - i) + noise));
      var didCheckin = rng() > 0.32;
      scores.push({ date: d, score: Math.round(val), checkin: didCheckin });
    }

    // streak = current consecutive check-in run counting back from today
    var streak = 0;
    for (var j = scores.length - 1; j >= 0; j--) {
      if (scores[j].checkin) streak++; else break;
    }

    var sessions = [];
    for (var k = 0; k < 5; k++) {
      var s = scores[scores.length - 1 - k * 3] || scores[scores.length - 1];
      sessions.push({
        date: s.date,
        movement: MOVEMENTS[Math.floor(rng() * MOVEMENTS.length)],
        score: s.score,
        grade: gradeFor(s.score)
      });
    }

    var badges = [];
    if (streak >= 3) badges.push({ label: "3-Day Streak", icon: "streak" });
    if (streak >= 7) badges.push({ label: "7-Day Streak", icon: "streak" });
    if (scores.some(function (s) { return s.score >= 90; })) badges.push({ label: "90+ Session", icon: "star" });
    badges.push({ label: "Full Tester", icon: "check" });

    var calibration = {
      left: rng() > 0.25 ? "Calibrated" : "Needs recalibration",
      right: rng() > 0.15 ? "Calibrated" : "Needs recalibration"
    };

    var roster = [];
    var rosterNames = ["Athlete 1", "Athlete 2", "Athlete 3", "Athlete 4", "Athlete 5"];
    rosterNames.forEach(function (label) {
      var sc = Math.round(60 + rng() * 40);
      var status = sc >= 85 ? "good" : sc >= 72 ? "warning" : "critical";
      roster.push({ label: label, score: sc, status: status });
    });

    return { scores: scores, streak: streak, sessions: sessions, badges: badges, calibration: calibration, roster: roster };
  }

  // ---------- SVG line chart with crosshair + tooltip ----------
  function renderTrendChart(container, scores) {
    container.innerHTML = "";
    var w = 640, h = 220, padL = 34, padR = 12, padT = 16, padB = 28;
    var innerW = w - padL - padR, innerH = h - padT - padB;

    var min = 55, max = 100;
    var xFor = function (i) { return padL + (i / (scores.length - 1)) * innerW; };
    var yFor = function (v) { return padT + innerH - ((v - min) / (max - min)) * innerH; };

    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    svg.setAttribute("class", "kd-chart-svg");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Movement score trend over the last " + scores.length + " days");

    // gridlines
    [60, 75, 90].forEach(function (gv) {
      var y = yFor(gv);
      var line = document.createElementNS(svg.namespaceURI, "line");
      line.setAttribute("x1", padL); line.setAttribute("x2", w - padR);
      line.setAttribute("y1", y); line.setAttribute("y2", y);
      line.setAttribute("class", "kd-grid");
      svg.appendChild(line);
      var label = document.createElementNS(svg.namespaceURI, "text");
      label.setAttribute("x", 4); label.setAttribute("y", y + 4);
      label.setAttribute("class", "kd-axis-label");
      label.textContent = String(gv);
      svg.appendChild(label);
    });

    // line path
    var d = scores.map(function (s, i) { return (i === 0 ? "M" : "L") + xFor(i).toFixed(1) + "," + yFor(s.score).toFixed(1); }).join(" ");
    var path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("d", d);
    path.setAttribute("class", "kd-line");
    svg.appendChild(path);

    // area fill under line
    var areaD = d + " L" + xFor(scores.length - 1).toFixed(1) + "," + (padT + innerH) + " L" + xFor(0).toFixed(1) + "," + (padT + innerH) + " Z";
    var area = document.createElementNS(svg.namespaceURI, "path");
    area.setAttribute("d", areaD);
    area.setAttribute("class", "kd-area");
    svg.insertBefore(area, path);

    // crosshair (hidden until hover)
    var crosshair = document.createElementNS(svg.namespaceURI, "line");
    crosshair.setAttribute("y1", padT); crosshair.setAttribute("y2", padT + innerH);
    crosshair.setAttribute("class", "kd-crosshair");
    crosshair.style.opacity = "0";
    svg.appendChild(crosshair);

    var dot = document.createElementNS(svg.namespaceURI, "circle");
    dot.setAttribute("r", "4.5");
    dot.setAttribute("class", "kd-dot");
    dot.style.opacity = "0";
    svg.appendChild(dot);

    // hit layer
    var hit = document.createElementNS(svg.namespaceURI, "rect");
    hit.setAttribute("x", padL); hit.setAttribute("y", padT);
    hit.setAttribute("width", innerW); hit.setAttribute("height", innerH);
    hit.setAttribute("fill", "transparent");
    svg.appendChild(hit);

    var tooltip = document.createElement("div");
    tooltip.className = "kd-tooltip";
    tooltip.style.opacity = "0";
    container.style.position = "relative";
    container.appendChild(svg);
    container.appendChild(tooltip);

    function showAt(i) {
      var s = scores[i];
      var x = xFor(i), y = yFor(s.score);
      crosshair.setAttribute("x1", x); crosshair.setAttribute("x2", x);
      crosshair.style.opacity = "1";
      dot.setAttribute("cx", x); dot.setAttribute("cy", y);
      dot.style.opacity = "1";
      tooltip.style.opacity = "1";
      tooltip.style.left = (x / w) * 100 + "%";
      tooltip.style.top = Math.max(0, (y / h) * 100 - 12) + "%";
      var dateLabel = s.date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      tooltip.textContent = "";
      var strong = document.createElement("strong");
      strong.textContent = String(s.score);
      tooltip.appendChild(strong);
      tooltip.appendChild(document.createTextNode(" · " + dateLabel));
    }
    function hide() {
      crosshair.style.opacity = "0";
      dot.style.opacity = "0";
      tooltip.style.opacity = "0";
    }

    hit.addEventListener("pointermove", function (e) {
      var rect = svg.getBoundingClientRect();
      var relX = ((e.clientX - rect.left) / rect.width) * w;
      var i = Math.round(((relX - padL) / innerW) * (scores.length - 1));
      i = Math.max(0, Math.min(scores.length - 1, i));
      showAt(i);
    });
    hit.addEventListener("pointerleave", hide);
    hit.addEventListener("touchstart", function (e) {
      if (e.touches[0]) {
        var rect = svg.getBoundingClientRect();
        var relX = ((e.touches[0].clientX - rect.left) / rect.width) * w;
        var i = Math.round(((relX - padL) / innerW) * (scores.length - 1));
        showAt(Math.max(0, Math.min(scores.length - 1, i)));
      }
    }, { passive: true });

    // default: show the latest point so the chart isn't empty on load
    showAt(scores.length - 1);
  }

  function renderStreakGrid(container, scores) {
    container.innerHTML = "";
    scores.forEach(function (s) {
      var cell = document.createElement("div");
      cell.className = "kd-streak-cell" + (s.checkin ? " is-on" : "");
      cell.title = s.date.toLocaleDateString() + (s.checkin ? ": checked in" : ": no check-in");
      container.appendChild(cell);
    });
  }

  function renderSessions(container, sessions) {
    container.innerHTML = "";
    sessions.forEach(function (s) {
      var row = document.createElement("div");
      row.className = "kd-session-row";

      var left = document.createElement("div");
      left.className = "kd-session-left";
      var title = document.createElement("div");
      title.className = "kd-session-title";
      title.textContent = s.movement;
      var date = document.createElement("div");
      date.className = "kd-session-date";
      date.textContent = s.date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      left.appendChild(title); left.appendChild(date);

      var right = document.createElement("div");
      right.className = "kd-session-score";
      right.textContent = s.score + " · " + s.grade;

      row.appendChild(left); row.appendChild(right);
      container.appendChild(row);
    });
  }

  function renderBadges(container, badges) {
    container.innerHTML = "";
    badges.forEach(function (b) {
      var chip = document.createElement("div");
      chip.className = "kd-badge";
      chip.textContent = b.label;
      container.appendChild(chip);
    });
  }

  function renderRoster(container, roster) {
    container.innerHTML = "";
    roster.forEach(function (r) {
      var row = document.createElement("div");
      row.className = "kd-roster-row";
      var dot = document.createElement("span");
      dot.className = "kd-status-dot kd-status-" + r.status;
      var label = document.createElement("span");
      label.className = "kd-roster-label";
      label.textContent = r.label;
      var score = document.createElement("span");
      score.className = "kd-roster-score";
      score.textContent = String(r.score);
      var statusText = document.createElement("span");
      statusText.className = "kd-roster-status-text kd-status-text-" + r.status;
      statusText.textContent = r.status === "good" ? "On track" : r.status === "warning" ? "Watch" : "Needs review";
      row.appendChild(dot); row.appendChild(label); row.appendChild(score); row.appendChild(statusText);
      container.appendChild(row);
    });
  }

  // ---------- page wiring ----------
  function initDashboardPage() {
    var authView = document.getElementById("kd-auth");
    var dashView = document.getElementById("kd-dash");
    if (!authView || !dashView) return;

    var tabSignIn = document.getElementById("kd-tab-signin");
    var tabSignUp = document.getElementById("kd-tab-signup");
    var signInForm = document.getElementById("kd-signin-form");
    var signUpForm = document.getElementById("kd-signup-form");
    var heading = document.getElementById("kd-auth-heading");
    var subtext = document.getElementById("kd-auth-subtext");
    var errorEl = document.getElementById("kd-auth-error");
    var greeting = document.getElementById("kd-greeting");
    var signOutBtn = document.getElementById("kd-signout");
    var coachToggle = document.getElementById("kd-coach-toggle");
    var coachPanel = document.getElementById("kd-coach-panel");

    function showError(message) {
      errorEl.textContent = message;
      errorEl.style.display = "block";
    }
    function clearError() {
      errorEl.style.display = "none";
    }

    function setTab(tab) {
      clearError();
      var signingIn = tab === "signin";
      tabSignIn.classList.toggle("is-active", signingIn);
      tabSignUp.classList.toggle("is-active", !signingIn);
      tabSignIn.setAttribute("aria-selected", signingIn ? "true" : "false");
      tabSignUp.setAttribute("aria-selected", !signingIn ? "true" : "false");
      signInForm.style.display = signingIn ? "" : "none";
      signUpForm.style.display = signingIn ? "none" : "";
      heading.textContent = signingIn ? "Sign in to Kinetra" : "Create your Kinetra account";
      subtext.textContent = signingIn
        ? "Sign in to see your dashboard. New here? Create an account instead."
        : "Sign up with your email and a password. Your password is hashed before it's stored.";
    }
    if (tabSignIn && tabSignUp) {
      tabSignIn.addEventListener("click", function () { setTab("signin"); });
      tabSignUp.addEventListener("click", function () { setTab("signup"); });
    }

    function paint(user) {
      authView.style.display = "none";
      dashView.style.display = "";
      greeting.textContent = "Welcome back, " + user.name;

      var data = generateSampleData(user.id);

      renderTrendChart(document.getElementById("kd-chart"), data.scores);
      renderStreakGrid(document.getElementById("kd-streak-grid"), data.scores);
      renderSessions(document.getElementById("kd-sessions"), data.sessions);
      renderBadges(document.getElementById("kd-badges"), data.badges);
      renderRoster(document.getElementById("kd-roster"), data.roster);

      document.getElementById("kd-streak-count").textContent = data.streak;
      document.getElementById("kd-cal-left").textContent = data.calibration.left;
      document.getElementById("kd-cal-right").textContent = data.calibration.right;
      document.getElementById("kd-cal-left").className =
        "kd-cal-value " + (data.calibration.left === "Calibrated" ? "kd-cal-ok" : "kd-cal-warn");
      document.getElementById("kd-cal-right").className =
        "kd-cal-value " + (data.calibration.right === "Calibrated" ? "kd-cal-ok" : "kd-cal-warn");

      var latest = data.scores[data.scores.length - 1];
      document.getElementById("kd-latest-score").textContent = latest.score;
    }

    function setSubmitLoading(btn, isLoading, loadingLabel, normalLabel) {
      btn.disabled = isLoading;
      btn.textContent = isLoading ? loadingLabel : normalLabel;
    }

    // If a token is already stored, verify it against the server before
    // trusting it (it could be expired, or invalid after a server restart
    // reset the signing key -- see accounts.py's SECRET_KEY note).
    var cachedUser = getStoredUser();
    if (getToken() && cachedUser) {
      paint(cachedUser); // paint immediately so returning users see the dashboard without a flash of the sign-in form
      fetchMe().then(function (data) {
        setSession(getToken(), data.user);
        paint(data.user);
      }).catch(function () {
        clearSession();
        dashView.style.display = "none";
        authView.style.display = "";
        setTab("signin");
      });
    }

    if (signInForm) {
      signInForm.addEventListener("submit", function (e) {
        e.preventDefault();
        clearError();
        var email = (document.getElementById("kd-signin-email").value || "").trim();
        var password = document.getElementById("kd-signin-password").value || "";
        var btn = document.getElementById("kd-signin-submit");
        setSubmitLoading(btn, true, "Signing in…", "Sign in");
        var slowNotice = setTimeout(function () {
          btn.textContent = "Still working, waking up the server…";
        }, 6000);
        signIn(email, password).then(function (data) {
          setSession(data.token, data.user);
          paint(data.user);
        }).catch(function (err) {
          showError(err.message);
        }).finally(function () {
          clearTimeout(slowNotice);
          setSubmitLoading(btn, false, "Signing in…", "Sign in");
        });
      });
    }

    if (signUpForm) {
      signUpForm.addEventListener("submit", function (e) {
        e.preventDefault();
        clearError();
        var name = (document.getElementById("kd-signup-name").value || "").trim();
        var email = (document.getElementById("kd-signup-email").value || "").trim();
        var password = document.getElementById("kd-signup-password").value || "";
        if (password.length < 8) {
          showError("Password must be at least 8 characters.");
          return;
        }
        var btn = document.getElementById("kd-signup-submit");
        setSubmitLoading(btn, true, "Creating account…", "Create account");
        var slowNotice = setTimeout(function () {
          btn.textContent = "Still working, waking up the server…";
        }, 6000);
        signUp(name, email, password).then(function (data) {
          setSession(data.token, data.user);
          paint(data.user);
        }).catch(function (err) {
          showError(err.message);
        }).finally(function () {
          clearTimeout(slowNotice);
          setSubmitLoading(btn, false, "Creating account…", "Create account");
        });
      });
    }

    if (signOutBtn) {
      signOutBtn.addEventListener("click", function () {
        clearSession();
        dashView.style.display = "none";
        authView.style.display = "";
        signInForm.reset();
        signUpForm.reset();
        setTab("signin");
      });
    }

    if (coachToggle && coachPanel) {
      coachToggle.addEventListener("click", function () {
        var isOpen = coachPanel.classList.toggle("is-open");
        coachToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
        coachToggle.textContent = isOpen ? "Hide coach roster view" : "Preview coach roster view";
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDashboardPage);
  } else {
    initDashboardPage();
  }
})();
