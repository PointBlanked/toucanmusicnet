// Calendar page: month grid, event details, volunteer signup with capacity,
// admin create/edit/delete.

(function () {
  const api = window.ToucanAPI;

  let user = null;
  let events = [];
  let current = new Date(); // month being shown
  let editingId = null; // event id when editing, null when creating

  const $ = (sel) => document.querySelector(sel);
  const grid = $("#cal-grid");
  const title = $("#cal-title");

  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const DOWS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  const fmtTime = (iso) =>
    new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const fmtRange = (ev) => {
    const s = new Date(ev.starts_at);
    return (
      s.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }) +
      " · " + fmtTime(ev.starts_at) + (ev.ends_at ? "–" + fmtTime(ev.ends_at) : "")
    );
  };
  // datetime-local wants "YYYY-MM-DDTHH:MM" in local time
  const toLocalInput = (iso) => {
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  // ------------------------------------------------------------ month grid
  function render() {
    const y = current.getFullYear();
    const m = current.getMonth();
    title.textContent = MONTHS[m] + " " + y;

    grid.innerHTML = DOWS.map((d) => `<div class="cal-dow">${d}</div>`).join("");

    const firstDow = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const today = new Date();

    for (let i = 0; i < firstDow; i++) {
      grid.insertAdjacentHTML("beforeend", `<div class="cal-cell pad"></div>`);
    }
    for (let d = 1; d <= days; d++) {
      const isToday =
        d === today.getDate() && m === today.getMonth() && y === today.getFullYear();
      const cell = document.createElement("div");
      cell.className = "cal-cell" + (isToday ? " today" : "");
      cell.innerHTML = `<span class="d">${d}</span>`;

      const dayEvents = events.filter((ev) => {
        const s = new Date(ev.starts_at);
        return s.getFullYear() === y && s.getMonth() === m && s.getDate() === d;
      });
      for (const ev of dayEvents) {
        const chip = document.createElement("button");
        chip.className = "chip " + (ev.event_type === "class" ? "class" : "");
        chip.textContent = fmtTime(ev.starts_at) + " " + ev.title;
        chip.addEventListener("click", () => openDetail(ev));
        cell.appendChild(chip);
      }
      grid.appendChild(cell);
    }
  }

  async function refresh() {
    events = await api.listEvents();
    render();
  }

  // ---------------------------------------------------------- detail modal
  async function openDetail(ev) {
    $("#d-title").textContent = ev.title;
    $("#d-when").textContent = fmtRange(ev);
    $("#d-location").textContent = ev.location || "";
    $("#d-description").textContent = ev.description || "";

    const vol = $("#d-volunteer");
    const roster = $("#d-roster");
    vol.innerHTML = "";
    roster.innerHTML = "";

    const isAdmin = user && user.role === "admin";
    const isVolunteer = user && user.role === "volunteer";
    $("#d-edit").hidden = !isAdmin;
    $("#d-delete").hidden = !isAdmin;

    // Spots remaining is visible to volunteers (and the admin) only.
    if ((isVolunteer || isAdmin) && ev.volunteer_capacity > 0) {
      const { count, mine } = await api.signupStatus(ev.id, user);
      const left = Math.max(0, ev.volunteer_capacity - count);
      vol.innerHTML = `
        <span class="spots ${left === 0 ? "full" : ""}"><i></i>
          ${left === 0 ? "All volunteer spots filled" : `${left} of ${ev.volunteer_capacity} volunteer spot${ev.volunteer_capacity === 1 ? "" : "s"} left`}
        </span>`;
      if (isVolunteer) {
        const btn = document.createElement("button");
        btn.className = "btn btn-sm " + (mine ? "btn-quiet" : "btn-beak");
        btn.style.marginLeft = "0.8rem";
        btn.textContent = mine ? "Withdraw my spot" : "Volunteer for this";
        btn.disabled = !mine && left === 0;
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          try {
            if (mine) {
              await api.volunteerCancel(ev.id, user);
              toast("You've withdrawn from “" + ev.title + "”.");
            } else {
              await api.volunteerSignup(ev.id, user);
              toast("You're signed up for “" + ev.title + "”. See you there!", "beak");
            }
            openDetail(ev); // re-render with fresh counts
          } catch (ex) {
            toast(ex.message, "error");
            btn.disabled = false;
          }
        });
        vol.appendChild(btn);
      }
      if (isAdmin) {
        const names = await api.listSignups(ev.id);
        roster.innerHTML =
          `<p class="hint"><strong>Signed up:</strong> ` +
          (names.length ? names.map((n) => escapeHtml(n.user_name)).join(", ") : "no one yet") +
          `</p>`;
      }
    } else if (isVolunteer && !ev.volunteer_capacity) {
      vol.innerHTML = `<p class="hint">No volunteer spots for this one.</p>`;
    } else if (!user) {
      vol.innerHTML = `<p class="hint"><a href="login.html">Log in</a> as a volunteer to see and claim open spots.</p>`;
    }

    $("#d-edit").onclick = () => {
      closeModals();
      openEditor(ev);
    };
    $("#d-delete").onclick = async () => {
      if (!confirm(`Delete “${ev.title}”? Volunteer signups for it are removed too.`)) return;
      await api.deleteEvent(ev.id);
      closeModals();
      toast("Event deleted.");
      refresh();
    };

    $("#detail-backdrop").classList.add("open");
  }

  // ---------------------------------------------------------- admin editor
  function openEditor(ev) {
    editingId = ev ? ev.id : null;
    $("#e-title").textContent = ev ? "Edit event" : "New event";
    $("#e-error").classList.remove("show");
    $("#f-title").value = ev ? ev.title : "";
    $("#f-type").value = ev ? ev.event_type : "class";
    $("#f-start").value = ev ? toLocalInput(ev.starts_at) : "";
    $("#f-end").value = ev && ev.ends_at ? toLocalInput(ev.ends_at) : "";
    $("#f-location").value = ev ? ev.location || "" : "";
    $("#f-capacity").value = ev ? ev.volunteer_capacity : 2;
    $("#f-description").value = ev ? ev.description || "" : "";
    $("#edit-backdrop").classList.add("open");
    $("#f-title").focus();
  }

  $("#event-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#e-error");
    err.classList.remove("show");
    const start = $("#f-start").value;
    const end = $("#f-end").value;
    if (!$("#f-title").value.trim() || !start || !end) {
      err.textContent = "Title, start, and end are required.";
      err.classList.add("show");
      return;
    }
    if (new Date(end) <= new Date(start)) {
      err.textContent = "The end time must be after the start time.";
      err.classList.add("show");
      return;
    }
    const data = {
      title: $("#f-title").value.trim(),
      event_type: $("#f-type").value,
      starts_at: new Date(start).toISOString(),
      ends_at: new Date(end).toISOString(),
      location: $("#f-location").value.trim(),
      volunteer_capacity: Math.max(0, parseInt($("#f-capacity").value, 10) || 0),
      description: $("#f-description").value.trim(),
    };
    try {
      if (editingId) {
        await api.updateEvent(editingId, data);
        toast("Event updated.");
      } else {
        await api.createEvent(data);
        toast("Event added to the calendar.", "beak");
      }
      closeModals();
      refresh();
    } catch (ex) {
      err.textContent = ex.message;
      err.classList.add("show");
    }
  });

  // ----------------------------------------------------------------- wiring
  function closeModals() {
    document.querySelectorAll(".modal-backdrop").forEach((b) => b.classList.remove("open"));
  }
  document.querySelectorAll("[data-close]").forEach((b) =>
    b.addEventListener("click", closeModals)
  );
  document.querySelectorAll(".modal-backdrop").forEach((b) =>
    b.addEventListener("click", (e) => {
      if (e.target === b) closeModals();
    })
  );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModals();
  });

  $("#prev").addEventListener("click", () => {
    current = new Date(current.getFullYear(), current.getMonth() - 1, 1);
    render();
  });
  $("#next").addEventListener("click", () => {
    current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    render();
  });
  $("#new-event").addEventListener("click", () => openEditor(null));

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      user = await api.getSession();
    } catch (e) {}
    if (user && user.role === "admin") $("#new-event").hidden = false;
    await refresh();
  });
})();
