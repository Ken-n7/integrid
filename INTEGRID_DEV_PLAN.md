# INTEGRID In Action — Development Plan

A gamified math-crossword **web app** for Grade 7 integer operations (+, −, ×, ÷ with sign rules).

| | |
|---|---|
| Client | BSEd Mathematics III research group, Visayas State University Tolosa |
| Used at | Tolosa National High School (action research, 10 participants, later whole Grade 7 classes) |
| Plan date | 2026-10-15 (updated the same day with the client's answers) |
| Delivery | **2026-10-29** (2 weeks) |
| Status | Client answered most questions (§13). Phases 0–2 done, Phase 4 code done and tested locally (Oct 15). Live on Supabase + Vercel (https://integrid-phi.vercel.app), tested against the real database (Oct 15). Battle Mode built and tested (Oct 16). Waiting on: researchers' puzzles. |

---

## 1. What we're building

Students fill in missing numbers in a crossword grid made of integer equations, picking numbers from a number bank. Every wrong answer costs a heart. Finishing fast earns more coins, and coins buy hints. Three modes unlock in order: **Relax → Expert → Battle**.
- **Relax** is guided: a free Clue explains the sign rule for any equation.
- **Expert** is ranked: a live leaderboard by solving time.
- **Battle** is groups racing each other, each group sharing one grid.

**Users**
- **Students:** Grade 7/8 learners with low mastery of integer operations. They use cheap Android phones or school PCs, often with weak or no internet.
- **Admin (teachers / researchers):** separate login. They create student codes, watch progress and rankings, export data, and run Battle rounds.

**Done means** the researchers can run their intervention:
1. Students sign in with a code.
2. They do the pre-assessment drill.
3. They play Relax → Expert, offline if needed.
4. The ranking updates when online.
5. The admin downloads the results as CSV.

## 2. Sources

| Source | What it gives us |
|---|---|
| `PINAKAFINAL RESEARCH-PAPER_INTEGRID.pdf` (pp. 9–14) | Purpose, "web application", flow, mode descriptions, privacy promises |
| `integrid.docx` | Screen-by-screen notes, rules, lives, hints, rewards, pre-assessment + answer key |
| Canva mockups (landing, How to Play, mode select) | Visual style only. The paper says they're AI-generated concept art |
| Hand sketch of the game screen | Layout: back, restart, level, hearts, timer, coins, grid, number bank, undo, rules, hint |
| Client answers (2026-10-15) | §13 |

## 3. Stack

| Part | Choice | Why |
|---|---|---|
| App | React 19 + TypeScript + Vite | Client confirmed a web app. Small bundle, fast on cheap phones, easy to fix fast |
| Offline / install | PWA via `vite-plugin-pwa` | Works offline after first open and can be added to the home screen. Fixes reach every phone on the next open |
| Styling | Plain CSS with design tokens | Simple UI (cells and buttons), no framework needed |
| Font | Nunito, bundled (`@fontsource-variable/nunito`) | Rounded like the mockups, and works offline (no Google Fonts call) |
| Backend | Supabase (Postgres + Auth + Realtime) | SQL data that exports straight to CSV. Realtime for Battle. Row-level security for minors' data |
| Hosting | Cloudflare Pages or Vercel (free) | Static site, HTTPS (required for offline/PWA) |
| Puzzles | CSV files exported from Google Sheets, checked automatically before every build | Researchers write the problems themselves (paper's AI clause), and a wrong puzzle can't ship |

**Not chosen**
- **Flutter:** Flutter web loads a 2–3 MB+ engine first, which is slow on low-end phones, and gives us nothing this UI needs.
- **Godot:** a game engine for a grid of buttons, with an even heavier web export.
- **Firebase:** fine, but NoSQL makes the research exports harder. Its one edge (no auto-pause on the free tier) is handled in §15.

**Project layout**
```
integrid/
├─ INTEGRID_DEV_PLAN.md      this file
├─ puzzles/                  level CSVs: relax-1.csv … expert-5.csv, battle-*.csv
│  ├─ *.sample.csv           placeholders until the researchers' puzzles arrive
│  └─ PUZZLE_GUIDE.md        guide to send to the researchers
├─ scripts/check.ts          puzzle + rules checker (runs before every build)
├─ scripts/generate.ts       makes the puzzles (npm run generate)
├─ supabase/schema.sql       tables, security rules, sync function
├─ public/                   icons
└─ src/
   ├─ App.tsx                screen flow + simple screens
   ├─ Game.tsx               the crossword game screen
   ├─ Admin.tsx              admin page (/#admin)
   ├─ puzzle.ts              parse / validate / solve puzzles (pure)
   ├─ generate.ts            branching crossword generator (pure)
   ├─ rules.ts               all game numbers, rewards, unlock + ranking logic (pure)
   ├─ store.ts               local save + Supabase sync
   ├─ content.ts             text the researchers own (how-to, pre-assessment, sign rules, clues)
   └─ styles.css
```

## 4. App flow

```
Landing ──Start──▶ Sign in (first time only) ──▶ How to Play ──Continue──▶ Pre-assessment drill (once, mandatory)
                     │                                                         │
                     └─ "Admin sign in" ──▶ Admin page                         ▼
                                                                         Choose Mode
                                                        (Relax / Expert🔒 / Battle🔒)
                                                                               │
                              Level list (🔒 until previous level is won) ◀────┘
                                   │                         ▲
                                   ▼                         │
                                 Game ──▶ Result ── Next level / Try again
```
The admin page also has its own address, `<site>/#admin`.

## 5. Screen specs

### 5.1 Landing
- **Content:**
  - "INTEGRID IN ACTION"
  - "🎮 A Math Crossword Adventure! 🧩"
  - "Master integer operations while having fun!"
  - Big yellow **LET'S START!** button, with "Tap to begin your adventure!" under it
  - ⭐ 🎯 🏆 row
- **Client change:** the corner stickers become math symbols **+ − × ÷**: big, colorful, gently floating, and still when the device has reduced motion turned on.
- **Behavior:** Start goes to Sign in if no student is signed in on this device, otherwise to How to Play.

### 5.2 Student sign in
- **Fields:** student code (e.g. `S03`) and 4-digit PIN. Both are created by the admin and handed out on printed slips.
- **First sign-in on a device:**
  - Needs internet, to check the code.
  - A wrong code or PIN shows "Wrong code or PIN. Ask your teacher."
  - No connection shows "You need internet the first time you sign in."
- **After that:** works offline, and the device remembers the student.
- **Shared devices:** Settings (gear on the mode screen) → Sign out, which asks first. Each student's save stays on the device, and the phone sends every student's unsent results, not only the signed-in one's.
- **Going back:** every inner screen has a back button at the top left; Android's back gesture does the same thing (closes a pop-up first, asks before leaving a level or the pre-assessment, leaves the app from the start and mode screens).
- **Admin sign in:** a small link at the bottom of this screen opens the separate admin login (client: "separate the admin log in to student log in").
- **No real names or emails for students.** This follows the paper's "coding system", and the students are minors.
- **Dev mode:** with no Supabase keys set, any code + 4-digit PIN is accepted, so the app can be tried before the backend exists.

### 5.3 How to Play
Shown after every Start (docx page 2). It has the client's four cards (docx wording) plus a coins card, since the paper says How to Play covers "rewarding students for their speed and accuracy":
1. 🧩 **Fill the Grid:** some numbers are missing; figure out which go where by solving the integer operations.
2. 📏 **Integer Rules:** apply the rules of +, −, ×, ÷ including sign rules.
3. 🏦 **Use the Number Bank:** tap a yellow cell, then tap a number to place it. Easy as pie!
4. 💗 **Lives System:** 5 lives per try, each wrong answer costs 1, lose all and it's game over. You can try again.
5. 🪙 **Coins & Hints:** finish faster for more coins; spend coins on hints.

Then a **CONTINUE** button. It goes to the pre-assessment if not done yet, otherwise to Choose Mode.

### 5.4 Pre-assessment drill (mandatory, once per student)
- **Content:** "Pre-Assessment: Integer Rules (Concepts Only)", the client's 5 questions and answer key (`content.ts`).
- **Purpose (client):** a drill and recap of the integer concepts before Level 1. **Scores are not recorded.**
- **Behavior:**
  - One question per screen, with big answer buttons and "1 of 5" progress.
  - After each tap, instant feedback: ✓ "Correct!" or ✗ "Not quite. The answer is **b. Add the numbers and keep the common sign.**", then **Next**.
  - The end screen shows "You got N of 5. Level 1 is open!"
- **Done flag:** saved on the device, so the drill is never shown again for that student there. On a new device the student just does the 5-question drill again.

### 5.5 Choose Mode
- **Heading:** "Choose Your Adventure! 🗺️", "Pick a style that feels right for you today".
- **Cards:**
  - **Relax** (green): "Go at your own pace! Free clues, no pressure."
  - **Expert** (orange, 🔒 until Relax 4 is won): "Bigger grids, beat the clock, climb the ranking!"
  - **Battle** (blue, 🔒 until Expert 5 is won): "Team up with your group and race the other groups!"
- Coin balance and student code are shown, with a gear for Settings (How to Play, Sign out).

### 5.6 Level list
- **Relax:**
  1. Addition of Integers
  2. Subtraction of Integers
  3. Multiplication of Integers
  4. Division of Integers
- **Expert:**
  1. Mixed Addition and Subtraction
  2. Mixed Multiplication and Division
  3. Four Fundamental Operations
  4. Multi-Step Integer Problems
  5. Advanced Crossword Challenges
- **Each level shows one of:** ✓ won (best time), ▶ playable, 🔒 locked, or "Soon" (no puzzle file yet).
- **Unlocks:** strictly in order. Level 1 opens after the pre-assessment. Each next level opens when the previous one is solved, Expert 1 after Relax 4, and Battle after Expert 5.
- **Expert list:** a **🏆 Ranking** button (§5.9).
- Placeholder puzzles show a **SAMPLE** tag, so nobody runs the study on them by mistake.

### 5.7 Game screen (from the client's sketch, boxes styled like a printed math-crossword worksheet)
```
 ‹  ↻   Level 1                                   (!)
        Addition of Integers
 💗💗💗💗💗  ⏱ 01:32  [+40]                    🪙 60
          ┌───┬───┬───┬───┬────┐
          │   │ + │   │ = │(−7)│     square boxes joined edge to edge
          └───┴───┼───┼───┴────┘     yellow = to fill, white = given,
                  │ + │              green = solved, purple = hint used
                  ├───┤
                  │(−6)│  …
 ┌──────────── pinned to the bottom, like a keyboard ────────────┐
 │  −12  −11  −10  −6  −4  −1  1                                  │
 │  [ 📖 Rules ]                  [ 💡 Hint −60 ]                 │
 └────────────────────────────────────────────────────────────────┘
```
- **Boxes:** square, joined edge to edge with shared dark lines, like the printed worksheets.
- **Puzzle box:** the screen is a fixed frame (header, stats, puzzle box, tray). The puzzle box keeps its size; the grid scales to fit inside it, so a bigger puzzle just gets smaller squares (at most 44px). Nothing goes under the tray.
  - Each square sizes its own number. Below 26px, the parentheses on negatives drop off so the digits stay readable.
  - **Comfortable sizes:** Relax 7×11 and Expert 9×11 give 30px+ squares on a 360×640 phone and 39–44px on a 390×844 phone.
  - **Bigger puzzles:** an 11×15 test puzzle (22-number bank) gets 22px squares on 360×640 and 32px on 390×844. That's readable but small to tap on the smaller phone, so about 9×11 stays the comfortable size for phones.
- **Tray:** the number bank and the Rules/Hint buttons sit at the bottom of the frame. On very short screens (a phone on its side) the page scrolls instead.
- **Placing a number:** tap a yellow cell, then a bank number. If no cell is selected, the yellow cells pulse and "Tap a yellow box first!" floats above the tray.
- **Instant check:**
  - **Correct:** the cell turns green and locks, and that bank tile is used up.
  - **Wrong:** the cell flashes red and shakes, −1 💗, and the tile stays in the bank. The mistake is logged. In Relax the (!) button wiggles and the message says "Tap (!) for a clue".
- **Negative numbers** show in parentheses in the grid, e.g. `(−7)`, the same as the paper's test items.
- **(!) popup:** replaces the old Clue button and blue box.
  - **Opens automatically when a level starts.** It shows the sign rules for that level's operation (Subtraction also shows Addition; mixed multi-step levels also show MDAS).
  - **The timer starts when it closes**, so reading costs no coins.
  - **Closing:** with the **X at the upper left** or the big button. Tapping (!) opens it again any time.
  - **In Relax, with a box selected:** it also shows the **free clue** for that box (the client's "guided practice"): the sign pattern of its equation(s), e.g. `(+) − (−) = (+)`, plus the like/unlike rule. It never shows the number itself. Expert has no free clue (client: free "since it's still Relax mode").
- **💡 Hint (paid).** Fills the selected cell (or the first empty one) with the right number ("hints provide direct answers").
  - Disabled when the student can't afford it, or has reached the Expert per-level limit.
  - The button shows the cost.
- **Timer:**
  - It counts up and **never ends the level**, in either mode.
  - It decides the coins earned, in both modes.
  - In Expert it also decides the ranking (client: "the timer is the basis for the leaderboard and for how many coins").
  - The yellow chip (+N) shows the coins the student would get by finishing now.
- **‹ Back / ↻ Restart:** asks "Leave/restart this level?" first. A level the student actually played (placed, missed, or hinted) is logged as `quit`.
- **📖 Rules:** a pop-up with all sign rules and MDAS (from the sketch). The timer keeps running.
- **Undo (in the sketch): removed.** With instant checking, a wrong number never stays on the board and a correct one is locked, so there's nothing to undo. *(Still to confirm, §13.)*
- **Result:**
  - **Win:** time, wrong answers, hints, coins earned; in Expert also "Rank #N". Then Next level / Levels.
  - **0 hearts:** "Game Over", then **Try again** (unlimited) / Levels.
- **Closing the app mid-level:** the attempt is saved as `quit` the next time the app opens, so hint coins are not refunded and no data is lost.

### 5.8 Number bank
**Correct answers only** (client), sorted from smallest to largest like the sketch. Each tile is used once, and duplicates appear as separate tiles.
- **Always two rows** (smaller half on top), so the tray never grows and the puzzle box keeps its space.
- **Too many numbers to fit:** the rows swipe sideways together. A ← or → arrow (white circle) appears on each side that still has numbers hidden past the edge; tapping it slides about a screen's width.
- **Everything fits:** the rows stay centred with no arrows.

### 5.9 Expert ranking (live)
- **Order:** per Expert level, students ranked by **best winning time**, then fewer wrong answers.
- **Display:** student codes only, never names. The student's own row is highlighted.
- **Where:** the 🏆 button on the Expert list, and "Rank #N" on the Expert result screen.
- **Live updates:** refreshes every 10 seconds while open and online. Offline it shows "Connect to the internet to see the ranking" with the student's own best time.

### 5.10 Admin page (`/#admin`, separate login)
- **Sign in:** email + password. The admin account is created by the developer, see §15.
- **Students table:** code, PIN, each level (✓ best time / attempts), wrong answers, hints, last played.
- **Add students:** a number box. It creates the next codes (`S01`, `S02`, …) with random 4-digit PINs.
- **Print codes:** a sheet of cut-out slips with code + PIN.
- **Ranking:** the same Expert ranking as students see.
- **Download CSV:**
  - `attempts.csv`: one row per play: student, level, result, seconds, wrong, sign_errors, hints, coins, played_at.
  - `students.csv`: one row per student: levels won, best times, totals.
- **Battle controls:** Phase 5, §10.
- **Later, only if the researchers make the puzzles themselves:** a **Generate** button per level. It makes a new branching puzzle (same generator as `npm run generate`) and shows a preview, with Approve / Make another buttons. Approved puzzles are saved in Supabase and replace the built-in ones. Until the client answers question 6 (§13), puzzles stay as generated files that the developer updates.

## 6. Game rules (all in `src/rules.ts`, one place to change)

| Rule | Relax | Expert | Battle | Source |
|---|---|---|---|---|
| Hearts | 5 per try | 5 per try | 5 per member (default) | client |
| Wrong answer | −1 💗 | −1 💗 | −1 💗 | docx |
| At 0 hearts | Game Over → Try again, unlimited | same | that member is out; the group continues | client / default |
| Timer | counts up, never ends the level | counts up, never ends the level | round time set by admin | client |
| Coins for finishing | ≤1 min 60 · ≤2 40 · ≤3 30 · ≤4 20 · ≤5 10 · later 10 | ≤2 min 120 · ≤3 100 · ≤4 80 · ≤5 60 · later 60 | none: prizes are physical | docx / client; "later" = lowest bracket is our default |
| Hint (direct answer) | 60 coins, unlimited while coins last | 120 coins, **max 2 per level** | 100 coins | docx / client |
| Clue (guided practice) | free, unlimited | none | none | client |
| Number bank | correct answers only | correct answers only | correct answers only | client |
| Ranking | none | live, by best time | live, group vs group | client |
| Starting coins | **60**, once, at first sign-in | | | client |

- Coins never go below 0.
- Replaying a won level earns coins again, which is good practice. The ranking uses the best time.
- Mixed operations follow **MDAS**: × and ÷ before + and −, then left to right.

## 7. Puzzles: generator, review, format

**Generated, then reviewed.** Puzzles look like printable math-crossword worksheets: equations branch off each other at shared numbers. `npm run generate` writes one per level to `puzzles/<level>.sample.csv` (tagged SAMPLE in the app).

How the generator works (`src/generate.ts`):
1. **Grow:** place one equation, then keep crossing a number already on the grid with a new equation in the other direction. It mostly branches from the newest equations, and rarely from ones that already have two crossings, so the shape forks like roots instead of a comb. Equations only touch where they share a number.
2. **Hide:** blank out numbers one by one. A blank is kept only if the puzzle can still be solved one equation at a time, i.e. some equation always has a single blank that only one bank number fits. So the answer is unique and reachable by reasoning, never guessing. Every equation gets at least one blank, and at most 2.
3. **Pick:** of the first 30 seeds that work, keep the most open layout (36–49% of squares filled). A puzzle is kept only if it exercises sign rules:
   - at least ⅓ of its numbers are negative;
   - in Relax, all four sign pairs appear: (+)(+), (+)(−), (−)(+), (−)(−).

**Rules built in:**
- No 0s, no ×1 or ÷1, no x ÷ x = 1.
- Partial products stay within the level's limit.
- Relax: one operation per equation, max 7 columns (bigger boxes).
- Expert: max 9 columns. Expert 4–5 add multi-step equations like `(−28) + 78 ÷ (−6) = (−41)` (MDAS).

| Level | Numbers up to | Grid | Equations |
|---|---|---|---|
| Relax 1–2 (+, −) | ±20 | 7 × 11 | 7 |
| Relax 3–4 (×, ÷) | ±100, factors ≤ 10 | 7 × 11 | 7 |
| Expert 1 (+ −) / 2 (× ÷) / 3 (all) | ±50 / ±144 / ±100 | 9 × 11 | 11 |
| Expert 4 (multi-step) / 5 (mixed) | ±100 | 9 × 11 | 8 / 11–12 |
| Battle 1–3 | ±100, all four operations | 9 × 11 | 10–11 |

**Review = approval.**
- The researchers play or look over each generated puzzle. Renaming `relax-1.sample.csv` → `relax-1.csv` approves it and removes the SAMPLE tag.
- They can change any puzzle in Google Sheets, or write their own with the rules below.
- Don't like one? Run `npm run generate -- relax-1 --seed 50` for a different layout.
- *Paper note:* the generator is rule-based, not AI. But the paper says the problems are the researchers' own work, so they should review every puzzle and describe it as "generated with a rule-based puzzle generator, then reviewed and validated by the researchers".

**Rules for a puzzle sheet** (the full guide for researchers is `puzzles/PUZZLE_GUIDE.md`)
1. **Before typing**, set the whole sheet to Format → Number → **Plain text**, otherwise Sheets treats `=`, `+` and `-` as formulas.
2. **One square per cell**, and leave empty squares empty.
3. **Cell contents:**
   - A number: `5`, `-7`
   - A number the student must find: `?` in front, e.g. `?-7`
   - An operator: `+`, `-`, `x`, `/`
   - An equals sign: `=`
4. **Equations** read left→right and top→bottom. Every row/column run of 2+ filled squares must be one complete, correct equation, like `-3 + 5 = 2` or `?6 = 2 x 3`. Separate neighbouring equations with an empty square.
5. **Operations per mode:** Relax equations use one operation each (Level 1 only +, Level 2 only −, …). Expert may mix and chain them.
6. **Math:** mixed operations follow MDAS. Division must come out whole, and nothing is divided by 0.
7. **Size:** max **9 columns** wide (phone screens).
8. **One answer only:** using the number bank, there must be exactly one way to fill all `?` squares.
9. **Export:** File → Download → CSV, named by level (`relax-1.csv` … `relax-4.csv`, `expert-1.csv` … `expert-5.csv`, `battle-1.csv` …).

**`npm run check`** (also runs before every build) rejects a puzzle that:
- has an unreadable cell,
- has a broken or wrong equation,
- has an inexact division or a division by 0,
- has a `?` that isn't in any equation,
- is wider than 9 columns,
- has more than one solution, found by a brute-force solver over the bank.

The message names the row and column, so the dev can tell the researchers exactly what to fix.

## 8. Data & privacy

**On the device** (`localStorage`, with `navigator.storage.persist()` requested)
- One save per student code: PIN, pre-assessment done flag, attempts list, and the level in progress.
- Coins and unlocked levels are **calculated from the attempts list**, not stored separately, so they can never disagree with the data.

**Attempt record**
```
id (uuid) · level · result (win | lose | quit) · seconds · wrong · hints
coins (reward − hint costs) · mistakes [[answer, placed], …] · at (start time)
```
`mistakes` lets the researchers count **sign errors** (placed 8 when the answer was −8). This bears directly on their topic.

**Supabase** (`supabase/schema.sql`)

| Table | Columns | Who can read / write |
|---|---|---|
| `admins` | uid (auth user) | admin reads own row |
| `students` | code (PK), pin, created_at | admins read + add |
| `attempts` | id (PK), student, level, result, seconds, wrong, hints, coins, mistakes, played_at, synced_at | admins read; students only through the sync function |

- **Students never get a database login.** The app calls one function, `integrid_sync(code, pin, attempts)`.
  - It checks the PIN and saves anything new (safe to send twice).
  - It returns the student's full history, so a student can switch devices.
  - It also returns the **Expert ranking** (best times by code), so the ranking needs no extra request.
- **Admins** sign in with Supabase Auth. Row-level security allows reads only for accounts listed in `admins`.
- **No names anywhere.** The researchers keep the code ↔ name list on paper, as their paper promises.
- **Pre-assessment answers are not stored** (client).

**Sync timing:** on app open, after every finished level, when the device comes back online, and every 10 s while the ranking is open. Unsynced data stays on the device until it gets through.

## 9. Offline behavior

| Feature | Offline? |
|---|---|
| Opening the app the first time, first sign-in | Needs internet |
| Pre-assessment, Relax, Expert gameplay | ✅ offline after first open |
| Saving results, Expert ranking | Queued on the phone; uploads and ranking update when online |
| Admin page, Battle Mode | Needs internet. One teacher phone hotspot is enough for a class: Battle sends tiny messages |

- **Warning for the researchers:** clearing the browser's data before a phone has synced deletes that phone's unsynced results.
- **Updates:** a new version installs in the background and applies on the next app open. It never interrupts a level.

## 10. Battle Mode spec (Phase 5): groups on a shared grid

Client: "5 members each group, G1 vs G2… can those 5 members all join the battle on the same grid?" **Yes.**

1. **Admin:** on the admin page, "New Battle" picks a battle puzzle, the number of groups (2+) and the round time. It gets a **4-digit room code** to put on the board.
2. **Students:** Battle → enter the room code → pick their group (G1, G2, …). A lobby shows who joined each group (Supabase Realtime presence).
3. **Start:** the admin presses Start. Every group gets **the same puzzle**, and each group shares **one grid**. Any member can fill any cell. A correct cell appears on every teammate's screen instantly (Realtime broadcast). A solved cell can't be lost, so two members answering at once is safe.
4. **Live ranking:** a bar per group (cells solved / total, wrong answers, time) on every screen and the admin's.
5. **Winner:** first group to finish. If time runs out, the group with the most solved cells wins, and fewer wrong answers breaks a tie.
6. **Hearts and hints:** each member has 5 💗 (default). A member at 0 is out but can watch; the group plays on. Hints cost the member who uses them 100 coins.
7. **Prizes:** physical (food, materials), given by the researchers. The app only shows the final ranking.
8. **Late join / reconnect:** the phone asks the room for the group's current grid and catches up.
9. **Log:** each member's round is logged as an attempt (`battle-N`) with the group result.

Needs: Supabase Realtime (broadcast), internet (a hotspot is enough), and the researchers' battle puzzles (at least 3 for several rounds).

**As built (Oct 16, `src/Battle.tsx`):**
- The teacher's admin page is the host. It keeps the score, so it must stay open during the battle. Its clock decides the start and the time left; each phone corrects for its own clock.
- Channels: `ig-<room>` (teacher → everyone: puzzle, time, who's in each group, live bars), repeated every 4 s and at once when something changes. `ig-<room>-<group>` (a group's phones + the teacher): joins, solved boxes, wrong answers. One channel per group keeps each message to a handful of phones: the free plan allows about 100 deliveries a second, so a class of 40 on one channel would hit it. Presence isn't used (5 updates per phone per 30 s); a phone the teacher's list doesn't show yet just says "join" again.
- Solved boxes only ever get added, so two teammates answering at once is safe. A teammate's box that you had picked gives "A teammate just solved that box!" and costs no heart.
- Late join / reconnect: the room message carries every group's solved boxes, so a phone catches up within seconds.
- Ranking: finished groups by time, then most boxes, then fewest wrong answers. During play a phone shows the top 3 plus its own group; the end screen and the teacher show all.
- Log: each phone saves `battle-N` with the group's result (`win` = 1st place, else `lose`), the group's time, and its own wrong answers, hints (−100 coins each) and mistakes. Leaving early saves `quit`.
- Tests: in dev mode the same code runs over the browser's BroadcastChannel (tabs of one browser), so a full battle (teacher + 5 phones, 2 groups; 8 groups) is tested in Chromium; the real Realtime path was tested against the live project (join, start, a solved box in ~0.4 s, end).

## 11. Paper vs. build: decisions and why

| Topic | Paper / client says | We do | Why |
|---|---|---|---|
| AI in development | "no AI tools… during programming" | Suggest rewording: AI-assisted coding by the consultant; all math content by the researchers | 2-week deadline. Keeps the integrity promise that matters (the content) true and honest at defense. *Client hasn't answered yet* |
| Platform | web application | PWA web app, works offline after first open | Client confirmed web. No APK installs, and bug fixes reach all phones |
| Time limit | paper: Relax "five-minute duration", Expert "timed" | Timer never ends a level; it decides coins (and Expert ranking) | Client: "the timer is the basis for the leaderboard and coins" |
| Finishing after 5:00 | not specified | Still earns the lowest reward (Relax 10, Expert 60) | Finishing should always pay something for low-mastery learners |
| Guided practice | listed, not described | Free Clue: sign pattern + like/unlike rule | Client's description |
| Undo | in the hand sketch | Removed | Instant checking leaves nothing to undo |
| "Stay Calm & Play / no clocks" card | Canva mockup | Replaced by the client's 4 written cards + coins card | The docx is the client's newer, written spec |
| Battle "Team math!" vs "competitive" | mockup vs paper | Both: groups compete, members cooperate on one grid | Client's answer |
| Pre-assessment | "mandatory pre-assessment" | Mandatory once; a drill with instant feedback; not recorded | Client's answer |
| Pretest / posttest (20 items), Likert survey | ERUNT-adapted and Corpuz & Manaligod-adapted instruments | Stay on paper / Google Forms, not in the app | Validated instruments; changing their format mid-study weakens validity |
| "Built-in evaluation" each session | paper p. 12 | End-of-level result screen + admin export | Covers it without duplicating the validated test |
| Stickers on landing | Canva mockup | + − × ÷ symbols | Client's note |
| Ranking names | "no real names… coding system" | Student codes only | Paper's own privacy promise; minors |

## 12. Roadmap

Day 1 = Thu Oct 15. Delivery Thu Oct 29.

### Phase 0 — Plan & setup (Oct 15)
- [x] This plan
- [x] Vite + React + TS project, PWA, fonts, icons, git repo
- [x] `npm run check` wired into the build

### Phase 1 — Screens (Oct 15–16)
- [x] Landing (math-symbol stickers), How to Play, Student sign in (dev mode), Pre-assessment drill, Choose Mode, Level list
- [x] Preview link deployed for the client: https://integrid-phi.vercel.app (Oct 15)

### Phase 2 — Crossword engine (Oct 16–19)
- [x] Puzzle parser, equation checker (MDAS, exact division), uniqueness solver, number bank
- [x] Game screen: grid, select → place, instant check, hearts, timer, coins, hint, free Clue (Relax), rules pop-up, result overlays, leave/restart confirm
- [x] Unlock chain, local save, in-progress attempt recovery
- [x] Sample puzzles for Relax 1–4 and Expert 1 (placeholders, tagged SAMPLE)
- [x] Headless run-through at 360×740 and 360×640: whole student flow, no console errors

### Phase 3 — Puzzles (Oct 15–22, runs alongside)
- [x] Branching puzzle generator + sign-rule filter; all 9 levels + battle-1..3 generated and passing the checker
- [x] `PUZZLE_GUIDE.md` written
- [ ] Send the guide to the researchers: they review/approve the generated puzzles (or edit/write their own)
- [ ] Relax 1–4 approved, **by Oct 19**
- [ ] Expert 1–5 approved, **by Oct 22**
- [ ] Battle 1–3 approved, **by Oct 22**
- [ ] Researchers review the Clue/rule wording in `content.ts`

### Phase 4 — Backend, ranking & admin (Oct 19–22)
- [x] `schema.sql`: tables, row-level security, `integrid_sync` (with ranking), tested on Postgres 16 with a stand-in `auth` schema
- [x] Student sign-in + background sync (code done; needs a live Supabase test)
- [x] Expert ranking screen (live while online)
- [x] Admin page: separate sign-in, progress table, add students, print slips, ranking, CSV downloads (code done; needs a live Supabase test)
- [x] Supabase project created, admin account, env vars on hosting (Oct 15)
- [ ] Live test: sign in, play offline, reconnect, see it on the admin page

### Phase 5 — Battle Mode, groups (Oct 22–26)
- [x] Admin: new battle (puzzle, groups, time), room code, lobby, start, live ranking, end now (Oct 16)
- [x] Students: join with code, pick group, shared grid (broadcast), catch-up on reconnect, hearts/hints, final ranking (Oct 16)
- [x] Attempt log for battles (Oct 16)

### Phase 6 — Test & polish (Oct 26–28)
- [ ] Low-end Android phone (Chrome), school PC (Chrome/Edge), iPhone Safari smoke test
- [ ] Airplane-mode test: play offline → reconnect → data appears on admin page
- [ ] Battle test with 2 groups × 5 phones on one hotspot
- [ ] Researchers' pilot: play every level once, report confusing parts
- [ ] Fixes, final puzzle check, print code slips

### Delivery (Oct 29)
- [ ] Walkthrough with the client: admin page, codes, ranking, exports, Battle
- [ ] Hand over: site link, admin login, hosting, this plan (client already owns Supabase)

## 13. Client answers (2026-10-15)

| Question | Answer | Built as |
|---|---|---|
| Web app or APK? | Web app | PWA |
| Unlimited retries? | Unlimited tries per level, each try has 5 lives | Game Over → Try again |
| Timer? | Expert: timer is only the basis for ranking and coins; faster = more coins | Timer never ends a level, both modes |
| Guided practice? | Free clue in Relax: operation, like/unlike signs, e.g. `(+) − (+) = (+)` | 🔎 Clue button |
| Hints? | Use as long as they have coins; Expert 1–2 per level | Relax unlimited, Expert max 2 |
| Number bank? | Correct answers only, no decoys | Answers only |
| Starting coins? | 60 when they start; "log in points 60"; 492 was a sample | 60 once, at first sign-in |
| Battle rewards? | Physical prizes, handled by the researchers | Ranking only |
| Battle format? | Groups (e.g. 5 vs 5), each group on the same grid | §10 |
| Real-time ranking? | Only in Expert and Battle; "identical problems" = everyone solves the same puzzle | §5.9, §10 |
| Record pre-assessment? | No, it's a drill/recap; mandatory, then Level 1 opens | Drill, not stored |
| Admin? | Need an admin account, separate login from students | `/#admin` + link on sign-in |

**Still open (defaults in place)**
1. **AI clause** in the paper: not answered yet.
2. **Expert hints:** the answers say both "provide 5 hints" and "1–2 hints per Expert level". *Built: 2 per level.*
3. **60 coins:** one-time starting coins, or 60 every time they log in (e.g. once a day)? *Built: one-time.*
4. **Battle:** does each member get 5 hearts, or does the group share 5? Do students pick their group, or does the admin assign them? *Default: 5 each; students pick.*
5. **Undo:** OK to remove? *Built: removed.*
6. **Puzzles:** the researchers review/approve the generated puzzles (Relax by Oct 19, Expert + Battle by Oct 22)?
7. **Flow:** How to Play stays before the pre-assessment (docx page order)? *Built: yes.*
8. **Battle unlock:** Battle opens only after a student wins Expert 5 (the sketch's 🔒). On battle day, a student who hasn't finished Expert can't join the teacher's room. Keep it, or let anyone with the room code join? *Built: locked until Expert 5.*

## 13b. Accessibility (checked 2026-10-15)

**Tested with:**
- **A real screen reader:** Orca 46, the standard Linux screen reader, driving Chromium on an isolated headless GNOME Shell with speech logged, not played.
- **axe-core 4.14:** the engine behind Lighthouse's accessibility score, run against WCAG 2.2 AA plus best practices on all 19 screens and pop-ups and the admin page. Result: **0 issues**.

**What a screen-reader user gets:**
- **New screens:** the screen's heading is announced ("Sign in, heading level 1").
- **Pre-assessment:** each new question is read out.
- **Yellow boxes:** each one speaks its equations, so the puzzle can be solved by ear: "Row 1, column 3, empty. Across: this box plus blank equals negative 7. Down: …". Filled boxes are spoken as numbers, and the rest of the grid is hidden from the screen reader as drawing.
- **Choosing a number:** selecting a box moves focus to the number bank ("Place negative 12"). A right answer says "Correct!" and moves to the next empty box; a wrong one says "Oops! You lost a heart. For a free clue, use the Rules and a free clue button."
- **Pop-ups:** they read their contents. Tab stays inside, Escape and the X close them, and focus returns to whatever opened them.
- **Rule patterns:** read as words ("negative plus negative equals negative"). Decorative emoji and arrows are hidden from screen readers.

**Not tested:** TalkBack on Android and VoiceOver on iPhone (they need a real phone). Worth a 5-minute pass on a student phone once there's a preview link.

## 14. Testing & QA

- **Automated:** `npm run check` validates every puzzle (format, math, MDAS, exact division, single solution) and the reward table. `tsc` type-checks. Both run on every build, so a broken puzzle can't be deployed.
- **Manual checklist per release:**
  - Sign in: right code, wrong PIN, offline first time; admin sign-in separate.
  - Pre-assessment: shown once, feedback per question.
  - Each Relax level: win, lose all hearts, retry, clue, hint with and without coins.
  - Expert: hint limit 2; ranking updates when online.
  - Unlocks in order; back/restart confirm.
  - Close mid-level → reopen → attempt logged as quit.
  - Offline play → online → admin page shows the data; CSVs open in Excel.
  - Layout at 360×640 and on a PC.
- **Devices:** one low-end Android (2 GB RAM, Chrome), one school PC, one iPhone (smoke test).
- **Pilot:** the researchers play every level before the real sessions.

## 15. Setup, deployment, handover

**Local**
```bash
npm install
npm run dev            # http://localhost:5173 (dev mode: any code + 4-digit PIN works;
                       #  /#admin shows the dashboard with sample students, nothing saved)
npm run check          # validate puzzles
npm run build          # check + type-check + production build in dist/
```

**Supabase (once)**
1. **The client** signs up at supabase.com (free, no card) and makes the project: New project → `integrid`, Region **Singapore** (closest to Leyte), and keeps the database password. Then Organization → Team → invite the dev as **Developer**.
   Why not the dev's account: the dev's free plan is full (2 projects), and Owner/Administrator roles count toward that limit while Developer doesn't. A Developer can still run SQL, add Auth users and read the API keys, so steps 2–4 are the dev's. The client owns the student data from day one; nothing to transfer later.
2. SQL Editor → paste `supabase/schema.sql` → Run.
3. Authentication → Users → Add user (admin email + password, auto-confirm). Then in the SQL Editor: `insert into public.admins (uid) select id from auth.users where email = '<that email>';`
   Authentication → Sign In / Providers → turn off **Allow new users to sign up** (admins are added by hand; students never use Auth).
4. Project Settings → API: copy the URL and the publishable (anon) key into `.env.local`:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_KEY=sb_publishable_xxxx
   ```
5. Admin page → Add students → Print codes.

**Hosting:** Vercel, https://integrid-phi.vercel.app (imports the GitHub repo; every push to `main` redeploys). Settings → Environment Variables: the same two `VITE_` vars, then Redeploy, because they're baked in at build time. Never put the secret key there: every `VITE_` var ends up in the public code.
Anyone who signed in while a build had no keys (dev mode) keeps that save on the device: clear the site's data once on those phones.

**Free-tier note:** Supabase pauses a free project after ~7 days with no activity. Daily use during the study keeps it awake. After a long break, press "Restore" in the dashboard; data is kept.

**Handover:** the client already owns the Supabase project (step 1); remove the dev's Developer access when they want. Move hosting to their account (or document that the dev keeps it), and give them the admin login and this plan.

## 16. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Puzzle approval comes late | Study runs on unreviewed puzzles | Generator already made every level; approval is just play-and-rename |
| A puzzle has a mistake or 2 solutions | Unfair "wrong" marks, bad data | Generator only keeps puzzles solvable one equation at a time; checker blocks the build and names the cell |
| No internet at school | No first sign-in, no ranking, no Battle, no sync | First sign-in at home or on a hotspot; offline play; teacher hotspot for ranking and Battle |
| Browser data cleared before sync | Lost results | Sync on every level end and app open; warn researchers |
| Battle (shared group grid) runs late | Mode missing at delivery | Relax + Expert are enough for the intervention; Battle ships right after |
| Free Supabase pauses | Sync fails | Use keeps it awake; Restore button; data kept |
