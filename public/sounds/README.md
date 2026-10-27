# INTEGRID sampled sound effects

The shared feedback bank, including button clicks, was rendered offline using
**FluidSynth**, its **pyfluidsynth** Python binding and **Spotify Pedalboard**.
The source instruments are **GeneralUser GS 2.0.3 by S. Christian Collins**.
The previous FM oscillator palette is replaced. No AI audio model is used.

- Author: https://www.schristiancollins.com/generaluser.php
- Instrument source: https://github.com/mrbumpy409/GeneralUser-GS
- Synth: https://github.com/FluidSynth/fluidsynth
- Python binding: https://github.com/amberwhitehead/pyfluidsynth
- Processing: https://github.com/spotify/pedalboard
- Recipe: `scripts/audio/build_sfx.py`, dependencies pinned in requirements.txt.
- Pinned source commit, bank SHA-256 and cue spans: `generation.json`.
- Source instrument license: `GeneralUser-LICENSE.txt`. The author's license
  permits private/commercial music creation and use of contained samples in
  musical recordings. The large source SoundFont and authoring tools are not
  distributed with the game; the game only contains rendered audio.

The selected mallet set uses sampled woodblock/side-stick attacks, marimba,
vibraphone and muted guitar. Keyboard/celesta and other instrument auditions remain local authoring previews. Both are layered, filtered, lightly compressed, damped and rendered
to mono 24 kHz/16-bit PCM. Melodic feedback is shorter; button clicks are tactile
percussive attacks. Its result phrases remain available as fallbacks; the supplied recordings below play on wins and losses. Background music
is never sampled to make these effects.

| Cue | Source and behavior |
| --- | --- |
| tap | Dry low woodblock with a tiny damped mallet attack |
| select | Higher woodblock/mallet tick |
| right | Bright sampled mallet with a faint vibraphone accent |
| wrong | Muted guitar and low wooden thud |
| hint | Two mallet strikes with a soft bright accent |
| undo | Two short damped strikes |
| clue | Open marimba/vibraphone accent |
| start | Two quiet ticks followed by a mallet pickup |
| win | Short sampled mallet phrase and vibraphone ending |
| lose | Gentle descending mallet phrase |
| finish | Neutral two-hit sampled mallet ending |

`puzzle-kit.wav` is a single sprite of approximately 200 KiB. Source offsets and
lengths in `soundBank.generated.ts` bound each playback so a cue cannot spill
into its neighbor. The bank preloads/decode starts when the app mounts; the first
click's exact PCM is embedded so it can play before a download completes. If the
bank is unavailable, the same short click acknowledges actions immediately;
a late download never starts a stale effect. All sounds work offline after
installation. Independent volume/mute, result/music priority and cancellation
remain in `src/sound.ts`.

The user selected the current mallet set for release on 2026-10-27. Alternative
instrument auditions remain under the ignored `artifacts/audio/` directory and
are not included in the production build. Music provenance: `public/music/README.md`.

## Supplied win and game-over recordings

Win and loss now use the user's supplied recordings instead of the mallet result
phrases. Other feedback and the neutral assessment/Battle completion cue retain
the selected bank. The bank's win/lose spans are retained only as a fallback if
loading a recording fails.

- `level-win.wav`: [Level win](https://pixabay.com/sound-effects/musical-level-win-6416/)
  by Tuudurt / freesound_community.
- `game-over.wav`: [Game Over](https://pixabay.com/sound-effects/musical-game-over-417465/)
  by Alphix.
- User-supplied MP3s, originally provided 2026-10-22, used under the
  [Pixabay Content License](https://pixabay.com/service/license-summary/).

Converted to mono 44.1 kHz signed 16-bit PCM WAV. The clips are short (about 3.55s
and 3.08s) so their combined 572 KiB is suitable for offline caching. PCM avoids
another lossy compression step; conversion does not recover detail already lost
in the MP3s. Constant gain targets -20 LUFS while preserving the recordings'
dynamics, with a 3ms fade at the start and 12ms at the end. No musical sections
were cut. Source/output hashes and exact gain changes are in `result-clips.json`.
Reproduction script: `scripts/audio/convert_result_clips.py --source-dir <originals>`.
The original files remain in the main workspace's `public/sounds/` and in Git
history at `6c1c213` under their original MP3 names.

Both clips preload with the sound bank and are included in the existing WAV
precache. Music stays paused for the whole recording and resumes its saved
position. Muting, restarting or leaving cancels playing/pending clips; a stale
load cannot restart playback. If loading fails, the existing bank result cue
releases the music through the same path.
