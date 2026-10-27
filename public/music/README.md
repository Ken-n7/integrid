# INTEGRID music

Music by Eric Matyas — https://soundimage.org/

All six selections come from https://soundimage.org/puzzle-music/.
They are licensed under the **Soundimage International Public License**:
https://soundimage.org/sample-page/ (not CC0).
Attribution requirements: https://soundimage.org/attribution-info/.
The artist's site states that its music is not AI-generated.

| Local file | Track | Screens | Original download |
| --- | --- | --- | --- |
| sky-puzzle.mp3 | Sky Puzzle | Menus and other student screens | https://soundimage.org/wp-content/uploads/2017/06/Sky-Puzzle.mp3 |
| puzzle-dreams.mp3 | Puzzle Dreams | Menus and other student screens | https://soundimage.org/wp-content/uploads/2017/05/Puzzle-Dreams.mp3 |
| puzzle-game-3.mp3 | Puzzle Game 3 (Looping) | Relax selection and puzzles | https://soundimage.org/wp-content/uploads/2025/10/Puzzle-Game-3_Looping-1.ogg |
| cool-puzzler.mp3 | Cool Puzzler | Relax selection and puzzles | https://soundimage.org/wp-content/uploads/2017/07/Cool-Puzzler.mp3 |
| hypnotic-puzzle-3.mp3 | Hypnotic Puzzle 3 | Expert and Battle | https://soundimage.org/wp-content/uploads/2017/05/Hypnotic-Puzzle3.mp3 |
| mind-bender.mp3 | Mind Bender | Expert and Battle | https://soundimage.org/wp-content/uploads/2017/06/Mind-Bender.mp3 |

The artist's download page was checked on 2026-10-27. Puzzle Game 3 uses
its exact authored looping download; the other five are also labeled looping.
Each pair alternates at the end of a track with a 650ms crossfade. Settings
includes Next song, volume and mute, plus Music credits in both settings menus.
Teacher pages remain quiet. Pre-assessment and puzzle music are attenuated;
results pause music and resume the same position. Changing between Expert and
Battle preserves the song because those modes share a playlist.

Processing: downmix to mono, two-pass ffmpeg loudnorm targeting -16 LUFS,
-1.5dBTP and LRA 11, then 44.1kHz/96kbps MP3. No AI audio generation.
The authored loop lengths are retained. `processing.json` records encoded
sizes/durations. Each file is below the PWA's per-file precache limit. Compressed
tracks are cached for offline play; only three decoded buffers are retained.
The previous Swinging Sweet loop is replaced by these selections.

Required in-game credit (visible under Music credits):

Music by Eric Matyas
www.soundimage.org

Keep that credit, the track names and license link when distributing this game.
