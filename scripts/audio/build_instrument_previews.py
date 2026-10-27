"""Render eight instrument choices for listening only; never update the game bank.
Run with the pinned scripts/audio/requirements.txt environment from the repo root.
"""
from pathlib import Path
import json
import wave
import fluidsynth
import numpy as np
from scipy.signal import resample_poly
from pedalboard import Pedalboard, HighpassFilter, LowpassFilter, Compressor, Reverb

ROOT = Path(__file__).resolve().parents[2]
RATE, OUT_RATE = 44100, 24000
OUT = ROOT / 'artifacts/audio/instruments'
INSTRUMENTS = [
    ('kalimba', 'Kalimba', 108, 'Warm thumb-piano plucks'),
    ('muted-guitar', 'Muted guitar', 28, 'Short, dry string attacks'),
    ('electric-piano', 'Electric piano', 4, 'Soft, rounded electric keys'),
    ('pizzicato-strings', 'Pizzicato strings', 45, 'Light, bouncy string plucks'),
    ('dulcimer', 'Dulcimer', 15, 'Bright hammered-string texture'),
    ('nylon-guitar', 'Nylon guitar', 24, 'Gentle, natural string plucks'),
    ('music-box', 'Music box', 10, 'Delicate, sparkling notes'),
    ('steel-drums', 'Steel drums', 114, 'Rounded metallic tones'),
]
# Each instrument plays identical notes/timings so the comparison isolates timbre.
# Tuple: note, onset, held time, relative velocity/amplitude.
PATTERNS = {
    'character': (1.65, [(60,0,.16,.80),(67,.28,.16,.80),(72,.56,.16,.80),(76,.84,.16,.80)]),
    'tap': (.115, [(67,0,.025,.85)]),
    'select': (.15, [(79,0,.045,.80)]),
    'right': (.34, [(79,0,.07,.85),(86,.065,.07,.55)]),
    'wrong': (.25, [(55,0,.05,.80),(52,.08,.04,.45)]),
    'hint': (.44, [(74,0,.08,.65),(81,.075,.08,.80),(86,.15,.06,.45)]),
    'undo': (.24, [(76,0,.04,.80),(69,.075,.04,.65)]),
    'clue': (.38, [(67,0,.07,.70),(79,.075,.08,.55)]),
    'start': (.46, [(60,0,.05,.55),(67,.09,.05,.65),(72,.18,.08,.80)]),
    'win': (.92, [(72,0,.09,.65),(79,.10,.10,.70),(84,.22,.16,.80),(76,.22,.13,.35)]),
    'lose': (.58, [(64,0,.08,.70),(60,.17,.12,.65)]),
    'finish': (.64, [(67,0,.10,.75),(79,.14,.13,.65)]),
}
PEAKS = dict(character=.28,tap=.25,select=.19,right=.25,wrong=.23,hint=.23,undo=.20,clue=.20,start=.24,win=.29,lose=.23,finish=.25)
synth = fluidsynth.Synth(gain=.9, samplerate=RATE)
synth.setting('synth.reverb.active', 0)
synth.setting('synth.chorus.active', 0)
sfid = synth.sfload(str(ROOT/'artifacts/audio/source/GeneralUser-GS.sf2'))
assert sfid >= 0
cache = {}

def strike(program, midi, held, length, damping):
    key = program,midi,held,length,damping
    if key in cache: return cache[key].copy()
    synth.all_sounds_off(-1)
    assert synth.program_select(0,sfid,0,program) == 0
    synth.cc(0,7,110);synth.cc(0,10,64)
    synth.noteon(0,midi,87)
    a=synth.get_samples(round(held*RATE));synth.noteoff(0,midi)
    b=synth.get_samples(max(0,round((max(length,.65)-held)*RATE)))
    data=np.concatenate([a,b]).astype(np.float32).reshape(-1,2).mean(axis=1)/32768
    peak=float(np.max(np.abs(data)));assert peak>.0001,(program,midi)
    indices=np.flatnonzero(np.abs(data)>peak*.002)
    if len(indices):data=np.pad(data[int(indices[0]):],(0,int(indices[0])))
    data=data[:round(length*RATE)]/peak
    data*=np.exp(-np.linspace(0,damping,len(data)))
    n=min(round(.012*RATE),len(data));data[-n:]*=np.linspace(1,0,n)**2
    data[:32]*=np.linspace(0,1,32)
    cache[key]=data
    return data.copy()

OUT.mkdir(parents=True,exist_ok=True)
manifest={'sampleRate':OUT_RATE,'appliedToGame':False,'instruments':[],'cues':list(PATTERNS),'measurements':[]}
try:
    for id,title,program,description in INSTRUMENTS:
        folder=OUT/id;folder.mkdir(exist_ok=True)
        manifest['instruments'].append(dict(id=id,title=title,program=program,description=description))
        for cue,(duration,notes) in PATTERNS.items():
            dry=np.zeros(round(duration*RATE),dtype=np.float32)
            for midi,at,held,gain in notes:
                length=min(duration-at,.54 if cue=='character' else .46)
                sound=strike(program,midi,held,length,1.2 if cue=='character' else 2.8)*gain
                start=round(at*RATE);count=min(len(sound),len(dry)-start);dry[start:start+count]+=sound[:count]
            board=Pedalboard([HighpassFilter(cutoff_frequency_hz=110),LowpassFilter(cutoff_frequency_hz=7200),Compressor(threshold_db=-18,ratio=1.4,attack_ms=5,release_ms=45)])
            sound=board(dry,RATE)
            if cue not in ['tap','select','wrong','undo']:
                sound=Pedalboard([Reverb(room_size=.12,damping=.72,wet_level=.035,dry_level=.965,width=0)])(sound,RATE)
            sound=resample_poly(sound,80,147).astype(np.float32)
            # Equal target RMS per action makes comparisons less sensitive to loudness.
            # Peak ceiling still takes precedence for transient-heavy instruments.
            rms=float(np.sqrt(np.mean(sound**2)));peak=float(np.max(np.abs(sound)))
            target=.045 if cue in ['tap','select','wrong','undo'] else .065
            sound*=min(target/max(.00001,rms),PEAKS[cue]/max(.00001,peak))
            n=min(round(.015*OUT_RATE),len(sound));sound[-n:]*=np.linspace(1,0,n)**2
            sound[:24]*=np.linspace(0,1,24);sound[0]=sound[-1]=0
            assert np.max(np.abs(sound))<.4 and np.sqrt(np.mean(sound**2))>.002
            pcm=np.round(sound*32767).astype('<i2')
            with wave.open(str(folder/(cue+'.wav')),'wb') as f:
                f.setnchannels(1);f.setsampwidth(2);f.setframerate(OUT_RATE);f.writeframes(pcm.tobytes())
            manifest['measurements'].append(dict(instrument=id,cue=cue,duration=len(pcm)/OUT_RATE,peak=float(np.max(np.abs(sound))),rms=float(np.sqrt(np.mean(sound**2)))))
        print(title,'12 previews',flush=True)
finally:synth.delete()
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Ready: 8 instruments, 96 clips. Game bank untouched.')
