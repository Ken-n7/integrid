"""Render two INTEGRID SFX candidates with FluidSynth samples + Spotify Pedalboard.

Offline authoring only. Run from repo root using requirements.txt. The author-provided
GeneralUser-GS.sf2 is needed at artifacts/audio/source/; it is NOT shipped in the app.
No oscillator fallback, AI models, random presets, or sampled soundtrack segments.
"""
from pathlib import Path
import base64, hashlib, json, wave
import fluidsynth
import numpy as np
from scipy.signal import resample_poly
from pedalboard import Pedalboard, HighpassFilter, LowpassFilter, Compressor, Reverb

ROOT = Path(__file__).resolve().parents[2]
RATE, OUT_RATE = 44100, 24000
FONT = ROOT / 'artifacts/audio/source/GeneralUser-GS.sf2'
OUT = ROOT / 'artifacts/audio/candidates'
CUES = ['tap','select','right','wrong','hint','undo','clue','start','win','lose','finish']
synth = fluidsynth.Synth(gain=.9, samplerate=RATE)
synth.setting('synth.reverb.active', 0)
synth.setting('synth.chorus.active', 0)
sfid = synth.sfload(str(FONT))
assert sfid >= 0, 'SoundFont could not be loaded'
cache = {}

def sample(program, midi, hold=.11, length=.6, drum=False):
    cache_key = program, midi, hold, length, drum
    if cache_key in cache: return cache[cache_key].copy()
    synth.all_sounds_off(-1)
    ch = 9 if drum else 0
    assert synth.program_select(ch, sfid, 128 if drum else 0, 0 if drum else program) == 0
    synth.cc(ch, 7, 110)
    synth.cc(ch, 10, 64)
    synth.noteon(ch, midi, 87)
    a = synth.get_samples(round(hold*RATE))
    synth.noteoff(ch, midi)
    b = synth.get_samples(max(0, round((length-hold)*RATE)))
    data = np.concatenate([a,b]).astype(np.float32).reshape(-1,2).mean(axis=1)/32768
    assert np.max(np.abs(data)) > .0001, f'Empty instrument {program}/{midi}'
    # Remove the engine's leading render latency, preserving the physical attack.
    first = np.flatnonzero(np.abs(data) > np.max(np.abs(data))*.002)
    if len(first): data = np.pad(data[int(first[0]):], (0,int(first[0])))
    data /= np.max(np.abs(data))
    cache[cache_key] = data
    return data.copy()

def strike(program, midi, length, hold=.04, drum=False):
    data=sample(program,midi,hold,max(.65,length),drum)[:round(length*RATE)]
    # Controlled damped decay rather than the long General MIDI release tail.
    data *= np.exp(-np.linspace(0, 4.0, len(data)))
    data[:min(32,len(data))] *= np.linspace(0,1,min(32,len(data)))
    n=min(round(.018*RATE),len(data));data[-n:]*=np.linspace(1,0,n)
    return data

def phrase(events, duration):
    data=np.zeros(round(duration*RATE),dtype=np.float32)
    for program,midi,at,length,gain,drum in events:
        sound=strike(program,midi,length,drum=drum)*gain
        begin=round(at*RATE);end=min(len(data),begin+len(sound));data[begin:end]+=sound[:end-begin]
    return data

def build(kit):
    # GM programs: 12 marimba, 11 vibraphone, 8 celesta, 7 clavinet, 28 muted guitar.
    # Drum map: 37 side stick, 76/77 high/low woodblock. Every attack is a real sample.
    p=12 if kit=='mallets' else 7
    shine=11 if kit=='mallets' else 8
    e=lambda prog,key,at,length,gain=1,drum=False:(prog,key,at,length,gain,drum)
    shapes={
      'tap':(.085,[e(0,77,0,.065,.72,True),e(p,60,0,.07,.23)]),
      'select':(.115,[e(0,76,0,.075,.48,True),e(p,79,.004,.10,.45)]),
      'right':(.285,[e(p,79,0,.24,.82),e(shine,86,.035,.24,.19)]),
      'wrong':(.205,[e(0,77,0,.11,.45,True),e(28,48,.01,.18,.68)]),
      'hint':(.37,[e(p,74,0,.22,.65),e(p,81,.072,.27,.70),e(shine,86,.10,.25,.15)]),
      'undo':(.19,[e(p,76,0,.12,.72),e(p,69,.065,.12,.55)]),
      'clue':(.30,[e(p,67,0,.23,.55),e(shine,79,.055,.23,.28)]),
      'start':(.40,[e(0,76,0,.07,.25,True),e(0,76,.08,.07,.25,True),e(p,72,.15,.24,.8)]),
      'win':(.82,[e(p,72,0,.28,.60),e(p,79,.09,.29,.62),e(shine,84,.18,.57,.56),e(p,76,.18,.42,.25)]),
      'lose':(.49,[e(p,64,0,.20,.54),e(p,60,.15,.30,.55),e(28,48,.15,.24,.22)]),
      'finish':(.56,[e(p,67,0,.26,.65),e(shine,79,.12,.39,.42)]),
    }
    peaks={'tap':.25,'select':.19,'right':.25,'wrong':.23,'hint':.23,'undo':.20,'clue':.20,'start':.24,'win':.29,'lose':.23,'finish':.25}
    paths=OUT/kit;paths.mkdir(parents=True,exist_ok=True)
    sounds={};measurements=[]
    for cue in CUES:
        duration,events=shapes[cue]
        dry=phrase(events,duration)
        # Gentle filtering and short room; no pitch-shifting, bitcrushing or chirpy sweeps.
        board=Pedalboard([HighpassFilter(cutoff_frequency_hz=150),LowpassFilter(cutoff_frequency_hz=6200 if kit=='mallets' else 7800),Compressor(threshold_db=-18,ratio=1.6,attack_ms=4,release_ms=45)])
        processed=board(dry,RATE)
        if cue not in ['tap','select','wrong','undo']:
            processed=Pedalboard([Reverb(room_size=.12,damping=.72,wet_level=.045,dry_level=.955,width=0)])(processed,RATE)
        processed=resample_poly(processed,80,147).astype(np.float32)
        processed*=peaks[cue]/max(.00001,np.max(np.abs(processed)))
        n=min(round(.02*OUT_RATE),len(processed));processed[-n:]*=np.linspace(1,0,n)**2
        processed[:24]*=np.linspace(0,1,24)
        processed[0]=processed[-1]=0
        pcm=np.round(np.clip(processed,-1,1)*32767).astype('<i2')
        with wave.open(str(paths/(cue+'.wav')),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(OUT_RATE);f.writeframes(pcm.tobytes())
        sounds[cue]=pcm
        measurements.append(dict(cue=cue,duration=len(pcm)/OUT_RATE,peak=float(np.max(np.abs(processed))),rms=float(np.sqrt(np.mean(processed**2)))))
    (paths/'measurements.json').write_text(json.dumps(measurements,indent=2)+'\n')
    return sounds

try:
    kits={kit:build(kit) for kit in ['mallets','keys']}
finally:synth.delete()
# The warm mallet candidate is applied locally; both remain available for comparison.
sounds=kits['mallets'];frames=[];metadata={};cursor=0
for cue,pcm in sounds.items():
    metadata[cue]={'offset':cursor/OUT_RATE,'duration':len(pcm)/OUT_RATE}
    frames.extend([pcm,np.zeros(round(.04*OUT_RATE),dtype='<i2')]);cursor+=len(pcm)+round(.04*OUT_RATE)
bank=np.concatenate(frames)
public=ROOT/'public/sounds';public.mkdir(parents=True,exist_ok=True)
with wave.open(str(public/'puzzle-kit.wav'),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(OUT_RATE);f.writeframes(bank.tobytes())
embedded=base64.b64encode(sounds['tap'].tobytes()).decode()
(ROOT/'src/soundBank.generated.ts').write_text('// Generated by scripts/audio/build_sfx.py; sampled instruments rendered with FluidSynth + Pedalboard.\nexport const SOUND_BANK = '+json.dumps(metadata,indent=2)+' as const\nexport const TAP_SAMPLE_RATE = '+str(OUT_RATE)+'\nexport const TAP_PCM = '+json.dumps(embedded)+'\n')
(public/'GeneralUser-LICENSE.txt').write_text((ROOT/'artifacts/audio/source/GeneralUser-LICENSE.txt').read_text())
commit=json.loads((ROOT/'artifacts/audio/source/upstream-commit.json').read_text())['sha']
(public/'generation.json').write_text(json.dumps(dict(tool='FluidSynth via pyfluidsynth + Spotify Pedalboard',soundfont='GeneralUser GS 2.0.3 by S. Christian Collins',commit=commit,soundfont_sha256=hashlib.sha256(FONT.read_bytes()).hexdigest(),sample_rate=OUT_RATE,applied_kit='mallets',bank_bytes=(public/'puzzle-kit.wav').stat().st_size,cues=metadata),indent=2)+'\n')
print(json.dumps({'applied':'mallets','candidates':['mallets','keys'],'bank_bytes':(public/'puzzle-kit.wav').stat().st_size,'font_commit':commit}))
