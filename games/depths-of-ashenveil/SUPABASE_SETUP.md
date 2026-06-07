# Depths of Ashenveil Supabase Setup

1. In Supabase, open the SQL editor.
2. Run `supabase-schema.sql`.
3. Open `js/config/supabase-config.js`.
4. Fill in:

```js
window.DEPTHS_SUPABASE_CONFIG = {
  url: 'https://YOUR_PROJECT_REF.supabase.co',
  anonKey: 'YOUR_SUPABASE_ANON_KEY',
};
```

The anon key is safe to use in browser code. Do not put the service role key in this project.

Tables created:

- `depths_player_meta`
- `depths_active_runs`
- `depths_leaderboard`

Current behavior:

- Saves still cache locally so the game works if Supabase is offline.
- Supabase sync is enabled when `url` and `anonKey` are filled.
- The browser gets an anonymous `player_id` in localStorage. Full login/auth can be added later without changing the game loop.
