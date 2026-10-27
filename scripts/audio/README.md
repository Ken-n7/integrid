# Rebuilding sampled SFX

These are offline authoring tools; no Python, FluidSynth, Pedalboard, plugin or
SoundFont dependency is shipped to players. The game plays a 200 KiB WAV sprite
and embeds just the first click (about 5 KiB base64) for instant startup.

Research compared pyfxr/jfxr/rFXGen (procedural game synths) with sample-based
rendering. The replacement uses FluidSynth + pyfluidsynth to render GeneralUser GS
instruments and Spotify Pedalboard for filtering, compression and a small room.
This materially changes the source timbre from the rejected FM oscillator set.
It does not guarantee an aesthetic match; the comparison page is for listening
with the selected soundtrack.

Sources:
- https://github.com/FluidSynth/fluidsynth
- https://github.com/amberwhitehead/pyfluidsynth
- https://github.com/spotify/pedalboard
- https://github.com/mrbumpy409/GeneralUser-GS
- https://www.schristiancollins.com/generaluser.php
- https://pyfxr.readthedocs.io/en/stable/
- https://github.com/ttencate/jfxr
- https://github.com/raysan5/rfxgen

Setup (isolated environment):

```sh
python3 -m venv /tmp/integrid-audio-tools
/tmp/integrid-audio-tools/bin/pip install -r scripts/audio/requirements.txt
```

A system FluidSynth shared library is required. Download the author's
`GeneralUser-GS.sf2` and `documentation/LICENSE.txt` from its repository to
`artifacts/audio/source/` (save the license as `GeneralUser-LICENSE.txt`). Save
`https://api.github.com/repos/mrbumpy409/GeneralUser-GS/commits/main` there as
`upstream-commit.json`. The rendered release pins its commit and SHA-256 in
`public/sounds/generation.json`; use that commit to reproduce this exact bank.

```sh
/tmp/integrid-audio-tools/bin/python scripts/audio/build_sfx.py
```

Outputs: warm `mallets` and crisp `keys` candidates in `artifacts/audio/candidates/`,
`public/sounds/puzzle-kit.wav`, generated offsets and the embedded click in
`src/soundBank.generated.ts`. The selected candidate is mallets. Its license copy
is retained with the rendered files; the 31 MB source SoundFont stays outside
`public` and the application build. No AI models or random preset generator used.


## Eight instrument listening choices

```sh
/tmp/integrid-audio-tools/bin/python scripts/audio/build_instrument_previews.py
```

Creates twelve preview clips for each of Kalimba, Muted guitar, Tine electric
piano, Pizzicato strings, Dulcimer, Nylon guitar, Music box and Steel drums.
Each plays identical notes and timing. RMS is brought toward a common per-action
level while preserving a peak ceiling. `character.wav` is a longer phrase to
make differences easier to hear; the other eleven clips are game actions.
Outputs stay under `artifacts/audio/instruments/`. This script does not update
`public/sounds/puzzle-kit.wav` or `src/soundBank.generated.ts`.

Listening page: http://localhost:5184/artifacts/audio/instruments.html . Choose
one action, compare the eight instruments with any selected soundtrack, and
shortlist favorites. Shortlists are saved under an independent browser-only key;
they do not change the game or student data. The user chooses before applying.
