# INTEGRID puzzles: review, edit, or make your own

**Every level already has a puzzle**, made by a rule-based generator (not AI) in the style of printable math crosswords. Each one is checked to have exactly one answer that can be found one equation at a time, and to practice the sign rules.

**Your part:** your paper says the math problems are the researchers' own work, so please **review every puzzle** before the study:
1. Play it in the app. Each level shows a red SAMPLE tag until you approve it.
2. Happy with it? Tell the developer. Approving removes the SAMPLE tag.
3. Want changes? Ask for a new layout, or edit the puzzle yourself using the rules below.
4. Prefer your own puzzle? Make it in Google Sheets with the rules below and send the CSV. The app checks it automatically and tells you exactly what to fix.

## 1. Set up the sheet (do this first!)

1. Make a new Google Sheet, one per level.
2. Select everything (click the corner box above row 1), then **Format → Number → Plain text**.
   *If you skip this, Sheets turns `=`, `+` and `-` into formulas and the puzzle breaks.*

## 2. Fill in the squares

One square = one cell. Leave empty squares **empty**.

| Type this | It means |
|---|---|
| `5` or `-7` | a number students can see |
| `?5` or `?-7` | a number students must find (it becomes a yellow box) |
| `+`  `-`  `x`  `/` | add, subtract, multiply, divide |
| `=` | equals |

Example (Level 1, Addition):

|   | A | B | C | D | E |
|---|---|---|---|---|---|
| 1 | ?-3 | + | 5 | = | ?2 |
| 2 | + |   | + |   | + |
| 3 | 4 |   | ?-7 |   | -3 |
| 4 | = |   | = |   | = |
| 5 | ?1 | + | ?-2 | = | ?-1 |

This reads across: (−3) + 5 = 2 and 1 + (−2) = −1. Down: (−3) + 4 = 1, 5 + (−7) = −2 and 2 + (−3) = −1.

## 3. Rules

1. **Every line of 2 or more touching squares must be one complete, correct equation**, both across and down. Put an empty square between equations that shouldn't touch.
2. **Relax levels: one operation per equation, and only that level's operation.** Level 1: only `+`. Level 2: only `-`. Level 3: only `x`. Level 4: only `/`.
3. **Expert levels may mix operations.** Level 1: `+ -`. Level 2: `x /`. Levels 3–5: all four. Longer equations like `2 + 3 x 4 = 14` follow **MDAS** (× and ÷ before + and −).
4. **Division must come out whole.** No dividing by 0.
5. **At most 9 columns wide**, so it fits on a phone. Rows can go longer.
6. **Only one answer.** The number bank holds exactly the `?` numbers. There must be only one way to place them all. If two arrangements work, the checker asks you to show one more number.

## 4. Send it

**File → Download → Comma-separated values (.csv)**, and name the file by level:

| Mode | File names |
|---|---|
| Relax | `relax-1.csv` (Addition), `relax-2.csv` (Subtraction), `relax-3.csv` (Multiplication), `relax-4.csv` (Division) |
| Expert | `expert-1.csv` … `expert-5.csv` |
| Battle | `battle-1.csv`, `battle-2.csv`, `battle-3.csv`, … |

**Due dates:** Relax by **Oct 19**. Expert and Battle by **Oct 22**.

If the checker finds a problem, you'll get a message like `row 5, column 1 across: is not true → ?1 + ?(−2) = ?(−3)`. Fix that square and send the file again.
