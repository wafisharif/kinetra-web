/*
 * Kinetra homepage sign-up card.
 *
 * This is the real account system -- same backend, same localStorage keys
 * as the dashboard page (see js/dashboard.js and accounts.py in the
 * biomech-app repo). The apiRequest/signUp/setSession helpers below are
 * deliberately duplicated from dashboard.js rather than shared, so this
 * homepage card can exist without touching the already-working dashboard
 * page at all.
 *
 * On a successful signup the token is stored under the same keys
 * dashboard.js reads, then the visitor is sent straight to /dashboard/,
 * which will recognize the session immediately -- no second login.
 */
(function () {
  "use strict";

  var API_BASE = "https://kinetra-5w8w.onrender.com";
  var TOKEN_KEY = "kinetra_dashboard_token_v1";
  var USER_KEY = "kinetra_dashboard_user_v1";

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }

  function setSession(token, user) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (e) {}
  }

  var REQUEST_TIMEOUT_MS = 45000;
  function apiRequest(path, options) {
    options = options || {};
    var headers = { "Content-Type": "application/json" };
    var controller = (typeof AbortController !== "undefined") ? new AbortController() : null;
    var timedOut = false;
    var timeoutId = controller
      ? setTimeout(function () { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS)
      : null;
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
        throw new Error("The Kinetra server is taking too long to respond. It's probably waking up from being idle -- wait a bit and try again.");
      }
      if (err instanceof TypeError) {
        throw new Error("Couldn't reach the Kinetra server. It may be waking up after being idle -- wait a few seconds and try again.");
      }
      throw err;
    }).finally(function () {
      if (timeoutId) clearTimeout(timeoutId);
    });
  }

  function signUp(name, email, password) {
    return apiRequest("/auth/signup", {
      method: "POST",
      body: { name: name, email: email, password: password }
    });
  }

  function initHeroSignup() {
    var wrap = document.getElementById("heroSignup");
    if (!wrap) return;

    // Already signed in (e.g. they signed up earlier and came back to the
    // homepage)? There's nothing for this card to ask -- point them at the
    // dashboard they already have instead of asking them to sign up again.
    if (getToken()) {
      wrap.innerHTML =
        '<div class="hero-signup-head"><strong>You’re already signed in.</strong>' +
        "<span>Head to your dashboard to see it.</span></div>" +
        '<a class="btn btn-primary" href="/dashboard/" style="width:100%;">Go to my dashboard</a>';
      return;
    }

    var form = document.getElementById("hs-form");
    var nameInput = document.getElementById("hs-name");
    var emailInput = document.getElementById("hs-email");
    var passwordInput = document.getElementById("hs-password");
    var submitBtn = document.getElementById("hs-submit");
    var errorEl = document.getElementById("hs-error");
    var successEl = document.getElementById("hs-success");
    var noteEl = document.getElementById("hs-note");
    if (!form) return;

    function showError(message) {
      if (successEl) successEl.style.display = "none";
      if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = "block";
      }
    }
    function clearError() {
      if (errorEl) errorEl.style.display = "none";
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      clearError();

      var name = (nameInput.value || "").trim();
      var email = (emailInput.value || "").trim();
      var password = passwordInput.value || "";

      if (password.length < 8) {
        showError("Password must be at least 8 characters.");
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "Creating account…";
      var slowNotice = setTimeout(function () {
        submitBtn.textContent = "Still working, waking up the server…";
      }, 6000);

      signUp(name, email, password).then(function (data) {
        setSession(data.token, data.user);
        form.style.display = "none";
        if (noteEl) noteEl.style.display = "none";
        if (successEl) {
          successEl.textContent = "Account created -- taking you to your dashboard…";
          successEl.style.display = "block";
        }
        setTimeout(function () {
          window.location.href = "/dashboard/";
        }, 700);
      }).catch(function (err) {
        showError(err.message);
      }).finally(function () {
        clearTimeout(slowNotice);
        submitBtn.disabled = false;
        submitBtn.textContent = "Create free account";
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHeroSignup);
  } else {
    initHeroSignup();
  }
})();
