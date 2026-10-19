# INTEGRID puzzles: sending your problems

**Your problems, our layout.** Send the problems for each level to the developer, who lays them out as crosswords in the app. Your problems stay exactly as written; only the arrangement of the boxes changes. Once a level has your puzzle, it is **locked** for the whole study, so every learner solves the same problems.

Until your puzzles arrive, each level has a **sample** made by a rule-based generator (not AI), with a red SAMPLE tag in the app. They're only for trying the game out.

Want to lay out a puzzle yourself? The easiest way is the admin page's **Puzzle maker** tab: it gives you a 13 × 17 grid, checks the puzzle as you build it, and **Use this puzzle** puts it in the game. You can also make it in Google Sheets with the rules below and open the CSV there, or send it to the developer.

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

1. **Every line of 2 or more touching squares must be one complete, correct equation**, both across and down. Put an empty square between equations that shouldn't touch. One exception: an equation can carry on from the previous one's answer in the same line, like `-12 + (-7) = -19 + 14 = -5`. That reads as `-12 + (-7) = -19` and then `-19 + 14 = -5`, and each part must be correct.
2. **Two numbers and one operation per equation**, like `-3 + 5 = 2`. No longer ones like `2 + 3 x 4 = 14`.
3. **Relax levels: only that level's operation.** Level 1: only `+`. Level 2: only `-`. Level 3: only `x`. Level 4: only `/`. **Expert levels may mix operations** across equations. Level 1: `+ -`. Level 2: `x /`. Levels 3–5: all four.
4. **Division must come out whole.** No dividing by 0.
5. **At most 13 columns wide and 17 rows tall** (the size you chose). Bigger puzzles get smaller squares on phones, so use only the room your problems need.
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
