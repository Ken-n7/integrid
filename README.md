# INTEGRID In Action

![INTEGRID trailer frame](https://ken-n7.github.io/portfolio/previews/integrid-trailer-poster.jpg)

An integer crossword game for Grade 7 learners. Each grid is made of connected
equations with missing numbers (+, −, ×, ÷, with sign rules). You fill the
blanks from a number bank, every wrong answer costs a heart, and a fast finish
earns coins you can spend on hints.

Three modes unlock in order:

- **Relax** is guided. A free clue explains the sign rule behind any equation.
- **Expert** is timed, with a live leaderboard.
- **Battle** has groups racing each other, each group sharing one grid.

Teachers get a separate dashboard. It creates student codes, shows progress
and rankings, runs Battle rounds, and exports results as CSV for classroom
research. It's an installable PWA, and solo play works offline after the
first open.

Play it: **https://integrid-phi.vercel.app** ·
[Watch the trailer](https://ken-n7.github.io/portfolio/previews/integrid-trailer.mp4)

## Stack

React 19, TypeScript, Vite, `vite-plugin-pwa`, Supabase (Postgres, Auth, RLS).

## Run it

```sh
npm install
npm run dev      # http://localhost:5173
```

Without a `.env.local` it runs in dev mode: any student code and a 4-digit PIN
work, `/#admin` shows the dashboard with sample students, and nothing leaves
the device.

```sh
npm run check    # puzzle validation plus flow, Battle and security checks
npm run lint
npm run build    # check, type-check, production build in dist/
```

## Supabase

1. Make a project, then run `supabase/schema.sql` in the SQL Editor. It's safe
   to run again: it only adds what's missing. The other `supabase/*.sql` files
   are later upgrades.
2. Add an admin user under Authentication, then
   `insert into public.admins (uid) select id from auth.users where email = '<email>';`
   Turn off public sign-ups, because students never use Auth.
3. Copy `.env.example` to `.env.local` and fill in the project URL and
   publishable key.

The full plan, puzzle rules and deployment notes are in
[`INTEGRID_DEV_PLAN.md`](INTEGRID_DEV_PLAN.md).

## Credits

- Icons: Free Icon Pack v3.1 (Basic) by @gvesster, selected files only. See
  [`public/art/`](public/art/README.md).
- Music: Eric Matyas, [soundimage.org](https://soundimage.org/). See
  [`public/music/`](public/music/README.md).
- Sounds: see [`public/sounds/`](public/sounds/README.md).
- Font: Nunito.

The art, music and sounds belong to their creators and are under their own
licences.
