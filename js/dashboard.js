/*
 * Kinetra Dashboard.
 *
 * The account system here is real: sign-up and sign-in call Kinetra's
 * actual backend (see accounts.py in the biomech-app repo), which hashes
 * and stores your password and hands back a signed session token. That
 * token is kept in this browser's localStorage and sent as a Bearer header
 * on every request that needs to know who you are.
 *
 * The stats below are real too, as of the "Web Dashboard Sync" feature:
 * when someone signs in to this same account from inside the Kinetra app
 * (Settings -> Web Dashboard Sync), the app pushes a copy of its local
 * sessions, check-ins, and calibration to the backend (see sync.py), and
 * this page reads that back via GET /sync. Nothing here is generated --
 * an account that has never used the in-app sync feature simply has no
 * data yet, and sees the empty state below instead of a stand-in chart.
 *
 * The streak/badge/session math on this page is a JS port of the same
 * functions in the app (getConsistencyStreaks / getEarnedBadges in
 * app/(tabs)/index.tsx) so the numbers here match what the app itself
 * would show for the same synced data.
 */
(function () {
  "use strict";

  var API_BASE = "https://kinetra-5w8w.onrender.com";
  var TOKEN_KEY = "kinetra_dashboard_token_v1";
  var USER_KEY = "kinetra_dashboard_user_v1";

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
  function fetchSyncData() {
    return apiRequest("/sync", { method: "GET" });
  }

  // ---------- real-data math, ported from app/(tabs)/index.tsx ----------
  // Kept in lockstep with getLocalDateKey / getConsistencyStreaks /
  // getEarnedBadges in the app so this page's numbers always match what
  // the app itself would compute for the same synced sessions.

  function gradeFor(score) {
    if (score >= 93) return "A";
    if (score >= 88) return "A-";
    if (score >= 83) return "B+";
    if (score >= 78) return "B";
    if (score >= 72) return "B-";
    return "C+";
  }

  function getLocalDateKey(timestamp) {
    var date = new Date(timestamp);
    return date.getFullYear() + "-" + date.getMonth() + "-" + date.getDate();
  }

  function startOfDay(d) {
    var x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function getConsistencyStreaks(sessions) {
    if (!sessions || sessions.length === 0) {
      return { currentStreak: 0, longestStreak: 0, activeToday: false };
    }

    var uniqueDayKeys = [];
    var seen = {};
    sessions.forEach(function (s) {
      var key = getLocalDateKey(s.timestamp);
      if (!seen[key]) { seen[key] = true; uniqueDayKeys.push(key); }
    });

    var dayTimestamps = uniqueDayKeys.map(function (key) {
      var parts = key.split("-").map(Number);
      return new Date(parts[0], parts[1], parts[2]).getTime();
    }).sort(function (a, b) { return b - a; }); // newest first

    var ONE_DAY_MS = 24 * 60 * 60 * 1000;
    var todayKey = getLocalDateKey(new Date().toISOString());
    var activeToday = uniqueDayKeys.indexOf(todayKey) !== -1;

    var currentStreak = 0;
    var startTime = dayTimestamps[0];
    var mostRecentGapDays = Math.round((startOfDay(new Date()).getTime() - startTime) / ONE_DAY_MS);

    if (mostRecentGapDays <= 1) {
      currentStreak = 1;
      for (var i = 1; i < dayTimestamps.length; i += 1) {
        var gap = Math.round((dayTimestamps[i - 1] - dayTimestamps[i]) / ONE_DAY_MS);
        if (gap === 1) { currentStreak += 1; } else { break; }
      }
    }

    var longestStreak = 1;
    var running = 1;
    for (var j = 1; j < dayTimestamps.length; j += 1) {
      var g = Math.round((dayTimestamps[j - 1] - dayTimestamps[j]) / ONE_DAY_MS);
      if (g === 1) {
        running += 1;
      } else {
        longestStreak = Math.max(longestStreak, running);
        running = 1;
      }
    }
    longestStreak = Math.max(longestStreak, running);

    return { currentStreak: currentStreak, longestStreak: longestStreak, activeToday: activeToday };
  }

  var DAILY_TASKS = ["reach", "arm_raise", "sit_to_stand", "walking", "balance", "timed_up_and_go"];

  function getEarnedBadges(sessions, hasAnyCalibration) {
    sessions = sessions || [];
    var longestStreak = getConsistencyStreaks(sessions).longestStreak;
    var completedTaskCount = DAILY_TASKS.filter(function (task) {
      return sessions.some(function (s) { return s.daily_task === task; });
    }).length;
    var hasLeftSide = sessions.some(function (s) { return s.side === "left"; });
    var hasRightSide = sessions.some(function (s) { return s.side === "right" || !s.side; });
    var rehabCount = sessions.filter(function (s) { return s.mode === "rehab"; }).length;
    var hasTeamScreening = sessions.some(function (s) { return !!s.athlete_name; });

    return [
      { id: "first_checkin", label: "First Check-In", earned: sessions.length >= 1 },
      { id: "streak_3", label: "3-Day Streak", earned: longestStreak >= 3 },
      { id: "streak_7", label: "7-Day Streak", earned: longestStreak >= 7 },
      { id: "calibrated", label: "Personalized", earned: !!hasAnyCalibration },
      { id: "both_sides", label: "Both Sides Tested", earned: hasLeftSide && hasRightSide },
      { id: "full_battery", label: "Full Battery", earned: completedTaskCount >= DAILY_TASKS.length },
      { id: "rehab_consistency", label: "Rehab Regular", earned: rehabCount >= 5 },
      { id: "team_screener", label: "Team Screener", earned: hasTeamScreening }
    ];
  }

  var TASK_LABELS = {
    reach: "Reach",
    arm_raise: "Arm Raise",
    sit_to_stand: "Sit-to-Stand",
    walking: "Walking Gait",
    balance: "Balance",
    timed_up_and_go: "Timed Up and Go"
  };

  function labelForSession(s) {
    if (s.daily_task_label) return s.daily_task_label;
    if (s.daily_task && TASK_LABELS[s.daily_task]) return TASK_LABELS[s.daily_task];
    if (s.mode === "rehab") return "Rehab Consistency";
    if (s.mode === "lab") return "Movement Lab";
    if (s.mode === "rep") return "Rep Quality";
    return "Movement Check";
  }

  // Last 28 calendar days (oldest first), each marked with whether at
  // least one session landed on that local day -- same day-bucketing as
  // getConsistencyStreaks above, so the grid and the streak count agree.
  function buildStreakDays(sessions) {
    var dayKeysWithSession = {};
    (sessions || []).forEach(function (s) {
      dayKeysWithSession[getLocalDateKey(s.timestamp)] = true;
    });

    var days = [];
    var today = startOfDay(new Date());
    for (var i = 27; i >= 0; i -= 1) {
      var d = new Date(today);
      d.setDate(d.getDate() - i);
      var key = d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate();
      days.push({ date: d, checkin: !!dayKeysWithSession[key] });
    }
    return days;
  }

  // ---------- SVG line chart with crosshair + tooltip ----------
  function renderTrendChart(container, points) {
    container.innerHTML = "";

    if (!points || points.length === 0) {
      var empty = document.createElement("p");
      empty.className = "kd-card-sub";
      empty.style.margin = "0";
      empty.textContent = "No scored sessions yet.";
      container.appendChild(empty);
      return;
    }

    var w = 640, h = 220, padL = 34, padR = 12, padT = 16, padB = 28;
    var innerW = w - padL - padR, innerH = h - padT - padB;

    var rawScores = points.map(function (p) { return p.score; });
    var dataMin = Math.min.apply(null, rawScores);
    var dataMax = Math.max.apply(null, rawScores);
    var min = Math.max(0, Math.floor((dataMin - 8) / 5) * 5);
    var max = Math.min(100, Math.ceil((dataMax + 8) / 5) * 5);
    if (max <= min) { max = min + 10; }

    var singlePoint = points.length === 1;
    var xFor = function (i) { return singlePoint ? padL + innerW / 2 : padL + (i / (points.length - 1)) * innerW; };
    var yFor = function (v) { return padT + innerH - ((v - min) / (max - min)) * innerH; };

    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    svg.setAttribute("class", "kd-chart-svg");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Movement score trend across your last " + points.length + " synced session" + (points.length === 1 ? "" : "s"));

    // gridlines at the quarter/half/three-quarter marks of the data range
    [min + (max - min) * 0.25, min + (max - min) * 0.5, min + (max - min) * 0.75].forEach(function (gv) {
      var y = yFor(gv);
      var line = document.createElementNS(svg.namespaceURI, "line");
      line.setAttribute("x1", padL); line.setAttribute("x2", w - padR);
      line.setAttribute("y1", y); line.setAttribute("y2", y);
      line.setAttribute("class", "kd-grid");
      svg.appendChild(line);
      var label = document.createElementNS(svg.namespaceURI, "text");
      label.setAttribute("x", 4); label.setAttribute("y", y + 4);
      label.setAttribute("class", "kd-axis-label");
      label.textContent = String(Math.round(gv));
      svg.appendChild(label);
    });

    if (!singlePoint) {
      var d = points.map(function (s, i) { return (i === 0 ? "M" : "L") + xFor(i).toFixed(1) + "," + yFor(s.score).toFixed(1); }).join(" ");
      var path = document.createElementNS(svg.namespaceURI, "path");
      path.setAttribute("d", d);
      path.setAttribute("class", "kd-line");
      svg.appendChild(path);

      var areaD = d + " L" + xFor(points.length - 1).toFixed(1) + "," + (padT + innerH) + " L" + xFor(0).toFixed(1) + "," + (padT + innerH) + " Z";
      var area = document.createElementNS(svg.namespaceURI, "path");
      area.setAttribute("d", areaD);
      area.setAttribute("class", "kd-area");
      svg.insertBefore(area, path);
    }

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
      var s = points[i];
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
      var i = singlePoint ? 0 : Math.round(((relX - padL) / innerW) * (points.length - 1));
      i = Math.max(0, Math.min(points.length - 1, i));
      showAt(i);
    });
    hit.addEventListener("pointerleave", hide);
    hit.addEventListener("touchstart", function (e) {
      if (e.touches[0]) {
        var rect = svg.getBoundingClientRect();
        var relX = ((e.touches[0].clientX - rect.left) / rect.width) * w;
        var i = singlePoint ? 0 : Math.round(((relX - padL) / innerW) * (points.length - 1));
        showAt(Math.max(0, Math.min(points.length - 1, i)));
      }
    }, { passive: true });

    showAt(points.length - 1);
  }

  function renderStreakGrid(container, days) {
    container.innerHTML = "";
    days.forEach(function (d) {
      var cell = document.createElement("div");
      cell.className = "kd-streak-cell" + (d.checkin ? " is-on" : "");
      cell.title = d.date.toLocaleDateString() + (d.checkin ? ": session recorded" : ": no session");
      container.appendChild(cell);
    });
  }

  function renderSessions(container, sessions) {
    container.innerHTML = "";

    if (!sessions || sessions.length === 0) {
      var empty = document.createElement("p");
      empty.className = "kd-card-sub";
      empty.style.margin = "0";
      empty.textContent = "No sessions synced yet.";
      container.appendChild(empty);
      return;
    }

    sessions.slice(0, 5).forEach(function (s) {
      var row = document.createElement("div");
      row.className = "kd-session-row";

      var left = document.createElement("div");
      left.className = "kd-session-left";
      var title = document.createElement("div");
      title.className = "kd-session-title";
      title.textContent = labelForSession(s);
      var date = document.createElement("div");
      date.className = "kd-session-date";
      date.textContent = new Date(s.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      left.appendChild(title); left.appendChild(date);

      var right = document.createElement("div");
      right.className = "kd-session-score";
      right.textContent = (s.primary_score === null || s.primary_score === undefined)
        ? "—"
        : s.primary_score + " · " + (s.primary_grade || gradeFor(s.primary_score));

      row.appendChild(left); row.appendChild(right);
      container.appendChild(row);
    });
  }

  function renderBadges(container, badges) {
    container.innerHTML = "";
    var earned = badges.filter(function (b) { return b.earned; });
    if (earned.length === 0) {
      var empty = document.createElement("p");
      empty.className = "kd-card-sub";
      empty.style.margin = "0";
      empty.textContent = "None earned yet -- keep checking in.";
      container.appendChild(empty);
      return;
    }
    earned.forEach(function (b) {
      var chip = document.createElement("div");
      chip.className = "kd-badge";
      chip.textContent = b.label;
      container.appendChild(chip);
    });
  }

  function buildRoster(sessions) {
    var byAthlete = {};
    (sessions || []).forEach(function (s) {
      if (!s.athlete_name || s.primary_score === null || s.primary_score === undefined) return;
      var existing = byAthlete[s.athlete_name];
      if (!existing || new Date(s.timestamp) > new Date(existing.timestamp)) {
        byAthlete[s.athlete_name] = s;
      }
    });
    return Object.keys(byAthlete).sort().map(function (name) {
      var s = byAthlete[name];
      var score = s.primary_score;
      var status = score >= 85 ? "good" : score >= 72 ? "warning" : "critical";
      return { label: name, score: score, status: status };
    });
  }

  function renderRoster(container, roster) {
    container.innerHTML = "";
    if (!roster || roster.length === 0) {
      var empty = document.createElement("p");
      empty.className = "kd-card-sub";
      empty.style.margin = "0";
      empty.textContent = "No Team Screening sessions synced yet.";
      container.appendChild(empty);
      return;
    }
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
    var emptySync = document.getElementById("kd-empty-sync");
    var resultsGrid = document.getElementById("kd-grid");

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

    function renderSyncedData(data) {
      var sessions = (data.sessions || []).slice().sort(function (a, b) {
        return new Date(b.timestamp) - new Date(a.timestamp);
      });
      var calibration = data.calibration || {};
      var hasAnyCalibration = !!(calibration.left || calibration.right);
      var hasAnything = sessions.length > 0 || (data.checkins || []).length > 0;

      if (emptySync) emptySync.style.display = hasAnything ? "none" : "";
      if (resultsGrid) resultsGrid.style.display = hasAnything ? "" : "none";
      if (!hasAnything) return;

      // Chart wants oldest-first for a left-to-right trend line.
      var scored = sessions
        .filter(function (s) { return s.primary_score !== null && s.primary_score !== undefined; })
        .slice()
        .sort(function (a, b) { return new Date(a.timestamp) - new Date(b.timestamp); })
        .map(function (s) { return { date: new Date(s.timestamp), score: s.primary_score }; });

      var streaks = getConsistencyStreaks(sessions);
      var badges = getEarnedBadges(sessions, hasAnyCalibration);

      renderTrendChart(document.getElementById("kd-chart"), scored);
      renderStreakGrid(document.getElementById("kd-streak-grid"), buildStreakDays(sessions));
      renderSessions(document.getElementById("kd-sessions"), sessions);
      renderBadges(document.getElementById("kd-badges"), badges);
      renderRoster(document.getElementById("kd-roster"), buildRoster(sessions));

      document.getElementById("kd-streak-count").textContent = streaks.currentStreak;
      var calLeftEl = document.getElementById("kd-cal-left");
      var calRightEl = document.getElementById("kd-cal-right");
      calLeftEl.textContent = calibration.left ? "Calibrated" : "Using default range";
      calRightEl.textContent = calibration.right ? "Calibrated" : "Using default range";
      calLeftEl.className = "kd-cal-value " + (calibration.left ? "kd-cal-ok" : "kd-cal-warn");
      calRightEl.className = "kd-cal-value " + (calibration.right ? "kd-cal-ok" : "kd-cal-warn");

      var latestScoreEl = document.getElementById("kd-latest-score");
      latestScoreEl.textContent = scored.length > 0 ? scored[scored.length - 1].score : "—";

      var chartSub = document.getElementById("kd-chart-sub");
      if (chartSub) {
        chartSub.textContent = data.synced_at
          ? "Last synced " + new Date(data.synced_at * 1000).toLocaleString()
          : "Synced from the app";
      }
    }

    function paint(user) {
      authView.style.display = "none";
      dashView.style.display = "";
      greeting.textContent = "Welcome back, " + user.name;

      fetchSyncData().then(function (data) {
        renderSyncedData(data);
      }).catch(function () {
        // A failed /sync fetch (server waking up, network hiccup) shouldn't
        // block seeing the account is signed in -- show the empty state
        // rather than a broken half-rendered dashboard.
        if (emptySync) emptySync.style.display = "";
        if (resultsGrid) resultsGrid.style.display = "none";
      });
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
