// Event reminders — run every 5 minutes (see README.md). For each upcoming
// class/event, emails opted-in users a nudge at two marks: 60 minutes and
// 30 minutes before start ("an hour and thirty minutes before").
// reminders_sent dedupes so each user gets each nudge once.
//
// Secrets required: RESEND_API_KEY, FROM_EMAIL (same as weekly-digest).

import { createClient } from "npm:@supabase/supabase-js@2";

const OFFSETS_MINUTES = [60, 30];

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const RESEND_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM = Deno.env.get("FROM_EMAIL") ?? "Toucan Music <onboarding@resend.dev>";

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) console.error("Resend error for", to, await res.text());
}

Deno.serve(async () => {
  const now = Date.now();
  const maxOffset = Math.max(...OFFSETS_MINUTES);

  // Everything starting within the largest window.
  const { data: events, error: evErr } = await supabase
    .from("events")
    .select("*")
    .gte("starts_at", new Date(now).toISOString())
    .lte("starts_at", new Date(now + maxOffset * 60_000).toISOString());
  if (evErr) return new Response(evErr.message, { status: 500 });
  if (!events?.length) return new Response(JSON.stringify({ sent: 0 }));

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, class_reminders")
    .eq("class_reminders", true);

  const { data: userList } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const emailById = new Map(userList.users.map((u) => [u.id, u.email]));

  let sent = 0;
  for (const ev of events) {
    const minsUntil = (new Date(ev.starts_at).getTime() - now) / 60_000;
    // The offset this event currently qualifies for (largest first).
    const offset = OFFSETS_MINUTES.find((o) => minsUntil <= o);
    if (offset === undefined) continue;

    const when = new Date(ev.starts_at).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });

    for (const p of profiles ?? []) {
      const email = emailById.get(p.id);
      if (!email) continue;

      // Insert-first dedupe: primary key rejects repeats.
      const { error: dupErr } = await supabase
        .from("reminders_sent")
        .insert({ event_id: ev.id, user_id: p.id, offset_minutes: offset });
      if (dupErr) continue; // already sent this nudge

      await sendEmail(
        email,
        `Starting soon: ${ev.title} at ${when}`,
        `<div style="font-family:Helvetica,Arial,sans-serif;color:#16282d;max-width:560px">
          <h2 style="margin-bottom:4px">${ev.title} starts in about ${Math.round(minsUntil)} minutes</h2>
          <p style="color:#46595e">${when}${ev.location ? " · " + ev.location : ""}</p>
          ${ev.description ? `<p>${ev.description}</p>` : ""}
          <p style="color:#46595e;font-size:13px;margin-top:20px">
            Reminders can be turned off in your
            <a href="https://your-site.example/settings.html">settings</a>.
          </p>
        </div>`
      );
      sent++;
    }
  }

  return new Response(JSON.stringify({ sent }), {
    headers: { "Content-Type": "application/json" },
  });
});
