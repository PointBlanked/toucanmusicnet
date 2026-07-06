# Toucan Music Project

A classic HTML/CSS/JS site for a music nonprofit teaching underprivileged
children — landing page, login/signup (student or volunteer), an editable
calendar with volunteer capacity, notification settings, and Supabase-backed
weekly digest + class-reminder emails.

## Try it right now (demo mode)

No build step, no backend needed:

```sh
cd Toucan
python3 -m http.server 8080
# open http://localhost:8080
```

Until you add Supabase credentials, the site runs in **demo mode**: accounts,
events, and volunteer signups live in your browser's localStorage.

- **Admin login:** name `admin`, password `toucan2026` (on the login page)
- Sign up as a **volunteer** to claim spots on events; as a **student** to
  just see the schedule.
- The admin can create/edit/delete events and set the number of volunteer
  spots per event.

## Pages

| Page | What it does |
| --- | --- |
| `index.html` | Landing page — mission, programs, how volunteering works |
| `login.html` | Log in with email (the admin logs in with the name `admin`) |
| `signup.html` | Create an account; choose **student** or **volunteer** |
| `calendar.html` | Month calendar. Everyone sees events; volunteers see spots left and can sign up within the admin-set volume; the admin creates/edits events and sees who signed up |
| `settings.html` | Per-user toggles: weekly schedule email, class reminders |

## Going live with Supabase

1. **Create a project** at [supabase.com](https://supabase.com), then put your
   Project URL and anon key into `js/config.js`.

2. **Run the schema**: paste `supabase/schema.sql` into the SQL editor and run
   it. It creates `profiles`, `events`, `volunteer_signups`, `reminders_sent`,
   row-level security, and a trigger that enforces volunteer capacity
   server-side (so the spot limit holds even against a modified client).

3. **Create the admin account**: in Dashboard → Authentication → Users →
   *Add user*, create `admin@toucanmusic.org` with password `toucan2026`
   (auto-confirm on). Then promote it:

   ```sql
   insert into public.profiles (id, full_name, role)
   select id, 'admin', 'admin' from auth.users
   where email = 'admin@toucanmusic.org'
   on conflict (id) do update set role = 'admin', full_name = 'admin';
   ```

   The login page maps the name `admin` to this email automatically.
   ⚠️ Change this password before real use — it's written down in your spec.

4. **Emails** — sign up at [resend.com](https://resend.com) (or swap the
   `fetch` call in the functions for any provider), then deploy the two edge
   functions:

   ```sh
   supabase functions deploy weekly-digest event-reminders --no-verify-jwt
   supabase secrets set RESEND_API_KEY=re_xxx FROM_EMAIL="Toucan Music <hello@yourdomain.org>"
   ```

5. **Schedule them** with pg_cron (Dashboard → Database → Extensions → enable
   `pg_cron` and `pg_net`, then run — replace `PROJECT_REF` and the anon key):

   ```sql
   -- Monday 8:00 AM weekly digest
   select cron.schedule('weekly-digest', '0 8 * * 1', $$
     select net.http_post(
       url := 'https://PROJECT_REF.supabase.co/functions/v1/weekly-digest',
       headers := '{"Authorization": "Bearer YOUR-ANON-KEY"}'::jsonb
     );
   $$);

   -- Reminders sweep every 5 minutes (sends at the 60- and 30-minute marks)
   select cron.schedule('event-reminders', '*/5 * * * *', $$
     select net.http_post(
       url := 'https://PROJECT_REF.supabase.co/functions/v1/event-reminders',
       headers := '{"Authorization": "Bearer YOUR-ANON-KEY"}'::jsonb
     );
   $$);
   ```

6. Host the static files anywhere (Netlify, GitHub Pages, S3…) and update the
   `your-site.example` links inside the two edge functions to your real URL.

### Notes on behavior

- **Reminder timing**: "an hour and thirty minutes before" is implemented as
  two nudges — one at 60 minutes and one at 30 minutes before start. To make
  it a single 90-minute reminder instead, change `OFFSETS_MINUTES` in
  `supabase/functions/event-reminders/index.ts` to `[90]`.
- **Who sees spot counts**: only volunteers and the admin — enforced by RLS
  on `volunteer_signups`, not just hidden in the UI.
- **Capacity**: enforced by a locking trigger in Postgres; two volunteers
  racing for the last spot can't both get it.
- Both emails honor the per-user toggles on the settings page
  (`weekly_digest`, `class_reminders`).
