// Shared chrome: nav auth state, toasts, tilt cards, in-page class reminders.

(function () {
  const api = window.ToucanAPI;

  // -------------------------------------------------------------- toasts
  const toastHost = document.createElement("div");
  toastHost.className = "toast-host";
  toastHost.setAttribute("role", "status");
  toastHost.setAttribute("aria-live", "polite");
  document.body.appendChild(toastHost);

  window.toast = function (msg, kind = "info") {
    const t = document.createElement("div");
    t.className = "toast " + kind;
    t.textContent = msg;
    toastHost.appendChild(t);
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => {
      t.classList.remove("show");
      setTimeout(() => t.remove(), 400);
    }, 5200);
  };

  // ------------------------------------------------------------------ nav
  async function renderNav() {
    const slot = document.querySelector("[data-nav-auth]");
    if (!slot) return null;
    let user = null;
    try {
      user = await api.getSession();
    } catch (e) {}

    if (user) {
      const settingsCurrent = window.location.pathname.endsWith("/settings.html")
        ? ' aria-current="page"'
        : "";
      slot.innerHTML = `
        <span class="nav-user">${escapeHtml(user.name)} <em>· ${user.role}</em></span>
        <a class="nav-icon-link" href="settings.html" aria-label="Settings" data-tooltip="Settings" data-tour="nav-settings"${settingsCurrent}><iconify-icon icon="pixelarticons:settings-cog" aria-hidden="true"></iconify-icon></a>
        <button class="nav-icon-button" data-logout aria-label="Log out" data-tooltip="Log out"><iconify-icon icon="pixelarticons:logout" aria-hidden="true"></iconify-icon></button>`;
      slot.querySelector("[data-logout]").addEventListener("click", async () => {
        await api.logout();
        window.location.href = "index.html";
      });
    } else {
      slot.innerHTML = `
        <a class="nav-icon-link" href="login.html" aria-label="Log in" data-tooltip="Log in"><iconify-icon icon="pixelarticons:login" aria-hidden="true"></iconify-icon></a>
        <a class="btn btn-beak btn-sm" href="signup.html"><iconify-icon icon="pixelarticons:user-plus" aria-hidden="true"></iconify-icon>Join us</a>`;
    }
    document.body.dataset.role = user ? user.role : "guest";
    return user;
  }

  window.escapeHtml = function (s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  };

  // ------------------------------------------------------- tilt (3D depth)
  function initTilt() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    document.querySelectorAll(".tilt").forEach((card) => {
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform =
          `perspective(900px) rotateX(${(-y * 6).toFixed(2)}deg) rotateY(${(x * 8).toFixed(2)}deg) translateZ(10px)`;
      });
      card.addEventListener("pointerleave", () => {
        card.style.transform = "";
      });
    });
  }

  // ----------------------------------------------- in-page class reminders
  // The email/SMS-style reminders are sent by the backend (see supabase/).
  // When the site is open, we also surface them in-page: a toast when a
  // class the user cares about starts within 60 or 30 minutes.
  const REMINDED_KEY = "toucan_reminded_v1";

  async function checkReminders(user) {
    if (!user || user.class_reminders === false) return;
    let events;
    try {
      events = await api.listEvents();
    } catch (e) {
      return;
    }
    const reminded = JSON.parse(sessionStorage.getItem(REMINDED_KEY) || "{}");
    const now = Date.now();
    for (const ev of events) {
      const mins = (new Date(ev.starts_at).getTime() - now) / 60000;
      for (const offset of [60, 30]) {
        const key = ev.id + ":" + offset;
        if (mins > 0 && mins <= offset && !reminded[key]) {
          reminded[key] = true;
          toast(
            `Starting soon: “${ev.title}” at ` +
              new Date(ev.starts_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
            "beak"
          );
          break; // one toast per event per check
        }
      }
    }
    sessionStorage.setItem(REMINDED_KEY, JSON.stringify(reminded));
  }

  // -------------------------------------------------------------- startup
  document.addEventListener("DOMContentLoaded", async () => {
    const user = await renderNav();
    initTilt();
    document.body.classList.add("ready");
    window.ToucanTour?.maybeAutoStart(user);
    checkReminders(user);
    setInterval(() => checkReminders(user), 5 * 60 * 1000);

    if (api.demoMode && !sessionStorage.getItem("toucan_demo_notice")) {
      sessionStorage.setItem("toucan_demo_notice", "1");
      toast("Demo mode: data lives in this browser. Connect Supabase in js/config.js to go live.");
    }
  });
})();
