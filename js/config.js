// Toucan Music — configuration
//
// To connect a real Supabase backend, replace the two placeholder values
// below with your project's URL and anon key (Project Settings → API).
// While they are placeholders, the site runs in local demo mode: accounts,
// events, and volunteer signups are stored in this browser's localStorage,
// and the admin account (name: admin / password: toucan2026) is pre-seeded.

window.TOUCAN_CONFIG = {
  SUPABASE_URL: "https://vxjewlbbsdvhzpibkppg.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_2kLFCF1SHANnilcFEWQ7LQ_r4l7lAXP",

  // The admin logs in by name ("admin"); this is the email that name maps
  // to in Supabase auth. Create this user during setup (see README.md).
  ADMIN_EMAIL: "admin@toucanmusic.org",
  ADMIN_NAME: "admin",
};
