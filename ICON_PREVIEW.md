# Icon pack preview

Branch: `preview/icon-pack`, based on production commit `50f8023`.

This preview applies selected cartoon artwork to lives, Rules, free clues, mode selection, rankings, achievements, result summaries, intro decorations and sound/music controls. Locked modes retain their artwork with a small lock badge. Navigation controls remain SVGs; missing pack pictograms keep their current presentation.

Assets: `public/art/`, 17 selected PNGs (about 70 KB), source manifest and original license. Shared decorative rendering: `src/Art.tsx` and `Deco` in `src/ui.tsx`. Images are decorative and do not replace accessible labels.

The first-win-only reward change remains separate in the original workspace. This branch changes artwork and presentation only; it does not change rewards, stored attempts, unlock rules or backend data.

Verified in the production preview: landing, locked/unlocked modes, placed answers and lost hearts, Rules/free clue, celebration/results, sound/music switches, tutorial lives and intro cards. No broken images, page errors or horizontal overflow. Production build, puzzle checks and lint passed; the pre-existing main-chunk size advisory remains. Narrow phone layouts and settings/Battle interactions were also exercised.
