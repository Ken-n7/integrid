"""Convert the user's original result MP3s to browser-friendly PCM WAV.
No additional lossy compression. Constant gain preserves the original dynamics.
"""
from pathlib import Path
import argparse, hashlib, json, shutil, subprocess, wave
p=argparse.ArgumentParser()
p.add_argument('--source-dir',type=Path,required=True)
p.add_argument('--output-dir',type=Path,default=Path('public/sounds'))
p.add_argument('--ffmpeg',default=shutil.which('ffmpeg'))
a=p.parse_args()
if not a.ffmpeg: p.error('ffmpeg is required')
a.output_dir.mkdir(parents=True,exist_ok=True)
manifest={'encoding':'PCM WAV, signed 16-bit, mono, 44100 Hz','loudness_target_lufs':-20,'source':'Original MP3s supplied by Ken, 2026-10-22','clips':{}}
for cue,stem in [('win','level-win'),('lose','game-over')]:
    source=a.source_dir/(stem+'.mp3');output=a.output_dir/(stem+'.wav')
    scan=subprocess.run([a.ffmpeg,'-hide_banner','-i',str(source),'-af','loudnorm=I=-20:TP=-3:LRA=11:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
    stats=json.JSONDecoder().raw_decode(scan.stderr[scan.stderr.rfind('{'):])[0]
    adjustment=-20-float(stats['input_i'])
    filters=f'volume={adjustment:.3f}dB,afade=t=in:d=0.003,areverse,afade=t=in:d=0.012,areverse'
    subprocess.run([a.ffmpeg,'-v','error','-y','-i',str(source),'-af',filters,'-ac','1','-ar','44100','-c:a','pcm_s16le','-map_metadata','-1',str(output)],check=True)
    with wave.open(str(output)) as f: duration=f.getnframes()/f.getframerate()
    manifest['clips'][cue]={'file':output.name,'duration':duration,'bytes':output.stat().st_size,'gain_db':round(adjustment,3),'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'sha256':hashlib.sha256(output.read_bytes()).hexdigest()}
(a.output_dir/'result-clips.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest))
