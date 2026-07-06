// Toucan Music Project — data layer.
// Uses Supabase when js/config.js has real credentials; otherwise runs a
// localStorage-backed demo so the whole site works without a backend.

(function () {
  const cfg = window.TOUCAN_CONFIG || {};
  const DEMO =
    !cfg.SUPABASE_URL ||
    cfg.SUPABASE_URL.includes("YOUR-PROJECT") ||
    !window.supabase;

  // ---------------------------------------------------------------- demo db
  const DB_KEY = "toucan_db_v1";
  const SESSION_KEY = "toucan_session_v1";

  function seedDb() {
    const now = new Date();
    const day = (offset, h, m) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, h, m);
      return d.toISOString();
    };
    return {
      users: [
        {
          id: "admin-1",
          name: "admin",
          email: cfg.ADMIN_EMAIL || "admin@toucanmusic.org",
          password: "toucan2026",
          role: "admin",
          weekly_digest: true,
          class_reminders: true,
        },
      ],
      events: [
        {
          id: "ev-1",
          title: "Beginner strings ensemble",
          description: "Violin and cello basics for ages 8–12. Instruments provided by the lending library.",
          event_type: "class",
          starts_at: day(1, 16, 0),
          ends_at: day(1, 17, 30),
          location: "Room A — Community Center",
          volunteer_capacity: 3,
        },
        {
          id: "ev-2",
          title: "Rhythm & percussion workshop",
          description: "Hand drums, shakers, and body percussion. High energy — extra volunteer hands welcome.",
          event_type: "class",
          starts_at: day(3, 15, 30),
          ends_at: day(3, 17, 0),
          location: "Main Hall",
          volunteer_capacity: 4,
        },
        {
          id: "ev-3",
          title: "Family showcase night",
          description: "Students perform what they've been working on this month. Open to families and friends.",
          event_type: "event",
          starts_at: day(6, 18, 0),
          ends_at: day(6, 20, 0),
          location: "Main Hall",
          volunteer_capacity: 6,
        },
      ],
      signups: [], // { id, event_id, user_id, user_name }
    };
  }

  function loadDb() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    const db = seedDb();
    saveDb(db);
    return db;
  }
  function saveDb(db) {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  }
  function uid() {
    return "id-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  // ------------------------------------------------------------- supabase
  let sb = null;
  if (!DEMO) {
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  }

  async function sbProfile(userId) {
    const { data, error } = await sb.from("profiles").select("*").eq("id", userId).single();
    if (error) throw error;
    return data;
  }

  function publicUser(u) {
    return {
      id: u.id,
      name: u.name || u.full_name,
      email: u.email,
      role: u.role,
      weekly_digest: u.weekly_digest,
      class_reminders: u.class_reminders,
    };
  }

  // ------------------------------------------------------------------ api
  const api = {
    demoMode: DEMO,

    async getSession() {
      if (DEMO) {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const { userId } = JSON.parse(raw);
        const u = loadDb().users.find((u) => u.id === userId);
        return u ? publicUser(u) : null;
      }
      const { data } = await sb.auth.getSession();
      if (!data.session) return null;
      const p = await sbProfile(data.session.user.id);
      return publicUser({ ...p, email: data.session.user.email });
    },

    // identifier: email, or the admin's name ("admin")
    async login(identifier, password) {
      const ident = identifier.trim();
      if (DEMO) {
        const db = loadDb();
        const u = db.users.find(
          (u) =>
            (u.email.toLowerCase() === ident.toLowerCase() ||
              u.name.toLowerCase() === ident.toLowerCase()) &&
            u.password === password
        );
        if (!u) throw new Error("No account matches that name/email and password.");
        localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: u.id }));
        return publicUser(u);
      }
      const email =
        ident.toLowerCase() === (cfg.ADMIN_NAME || "admin") ? cfg.ADMIN_EMAIL : ident;
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
      const p = await sbProfile(data.user.id);
      return publicUser({ ...p, email: data.user.email });
    },

    async signup({ name, email, password, role }) {
      if (!["student", "volunteer"].includes(role)) throw new Error("Pick a role to continue.");
      if (DEMO) {
        const db = loadDb();
        if (db.users.some((u) => u.email.toLowerCase() === email.toLowerCase()))
          throw new Error("An account with that email already exists.");
        const u = {
          id: uid(),
          name,
          email,
          password,
          role,
          weekly_digest: true,
          class_reminders: true,
        };
        db.users.push(u);
        saveDb(db);
        localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: u.id }));
        return publicUser(u);
      }
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { data: { full_name: name, role } },
      });
      if (error) throw new Error(error.message);
      return publicUser({ id: data.user.id, name, email, role, weekly_digest: true, class_reminders: true });
    },

    async logout() {
      if (DEMO) {
        localStorage.removeItem(SESSION_KEY);
        return;
      }
      await sb.auth.signOut();
    },

    async updatePrefs({ weekly_digest, class_reminders }) {
      if (DEMO) {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) throw new Error("Not logged in.");
        const { userId } = JSON.parse(raw);
        const db = loadDb();
        const u = db.users.find((u) => u.id === userId);
        u.weekly_digest = weekly_digest;
        u.class_reminders = class_reminders;
        saveDb(db);
        return publicUser(u);
      }
      const { data: s } = await sb.auth.getSession();
      const { error } = await sb
        .from("profiles")
        .update({ weekly_digest, class_reminders })
        .eq("id", s.session.user.id);
      if (error) throw new Error(error.message);
    },

    // ------------------------------------------------------------- events
    async listEvents() {
      if (DEMO) {
        return loadDb().events.slice().sort((a, b) => a.starts_at.localeCompare(b.starts_at));
      }
      const { data, error } = await sb.from("events").select("*").order("starts_at");
      if (error) throw new Error(error.message);
      return data;
    },

    async createEvent(ev) {
      if (DEMO) {
        const db = loadDb();
        const row = { id: uid(), ...ev };
        db.events.push(row);
        saveDb(db);
        return row;
      }
      const { data, error } = await sb.from("events").insert(ev).select().single();
      if (error) throw new Error(error.message);
      return data;
    },

    async updateEvent(id, ev) {
      if (DEMO) {
        const db = loadDb();
        const i = db.events.findIndex((e) => e.id === id);
        if (i < 0) throw new Error("Event not found.");
        db.events[i] = { ...db.events[i], ...ev };
        saveDb(db);
        return db.events[i];
      }
      const { data, error } = await sb.from("events").update(ev).eq("id", id).select().single();
      if (error) throw new Error(error.message);
      return data;
    },

    async deleteEvent(id) {
      if (DEMO) {
        const db = loadDb();
        db.events = db.events.filter((e) => e.id !== id);
        db.signups = db.signups.filter((s) => s.event_id !== id);
        saveDb(db);
        return;
      }
      const { error } = await sb.from("events").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },

    // ------------------------------------------------------------ signups
    // Returns { count, mine } for one event. Only volunteers/admin may call.
    async signupStatus(eventId, user) {
      if (DEMO) {
        const db = loadDb();
        const rows = db.signups.filter((s) => s.event_id === eventId);
        return {
          count: rows.length,
          mine: !!user && rows.some((s) => s.user_id === user.id),
        };
      }
      const { count, error } = await sb
        .from("volunteer_signups")
        .select("*", { count: "exact", head: true })
        .eq("event_id", eventId);
      if (error) throw new Error(error.message);
      let mine = false;
      if (user) {
        const { data } = await sb
          .from("volunteer_signups")
          .select("id")
          .eq("event_id", eventId)
          .eq("volunteer_id", user.id)
          .maybeSingle();
        mine = !!data;
      }
      return { count: count || 0, mine };
    },

    async volunteerSignup(eventId, user) {
      if (DEMO) {
        const db = loadDb();
        const ev = db.events.find((e) => e.id === eventId);
        if (!ev) throw new Error("Event not found.");
        const rows = db.signups.filter((s) => s.event_id === eventId);
        if (rows.some((s) => s.user_id === user.id))
          throw new Error("You're already signed up for this event.");
        if (rows.length >= ev.volunteer_capacity)
          throw new Error("All volunteer spots for this event are filled.");
        db.signups.push({ id: uid(), event_id: eventId, user_id: user.id, user_name: user.name });
        saveDb(db);
        return;
      }
      // Capacity is enforced server-side by a trigger; see supabase/schema.sql.
      const { error } = await sb
        .from("volunteer_signups")
        .insert({ event_id: eventId, volunteer_id: user.id });
      if (error) throw new Error(error.message);
    },

    async volunteerCancel(eventId, user) {
      if (DEMO) {
        const db = loadDb();
        db.signups = db.signups.filter(
          (s) => !(s.event_id === eventId && s.user_id === user.id)
        );
        saveDb(db);
        return;
      }
      const { error } = await sb
        .from("volunteer_signups")
        .delete()
        .eq("event_id", eventId)
        .eq("volunteer_id", user.id);
      if (error) throw new Error(error.message);
    },

    // Admin only: who signed up.
    async listSignups(eventId) {
      if (DEMO) {
        return loadDb().signups.filter((s) => s.event_id === eventId);
      }
      const { data, error } = await sb
        .from("volunteer_signups")
        .select("id, volunteer_id, profiles(full_name)")
        .eq("event_id", eventId);
      if (error) throw new Error(error.message);
      return data.map((r) => ({ user_name: r.profiles?.full_name || "Volunteer" }));
    },
  };

  window.ToucanAPI = api;
})();
