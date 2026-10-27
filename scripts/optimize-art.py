"""Generate responsive lossless WebP artwork. Legacy PNG URLs stay available for older tabs.
Run manually; ffmpeg is an authoring tool, never a production build dependency.
"""
from pathlib import Path
import argparse,json,subprocess,shutil,struct
from concurrent.futures import ThreadPoolExecutor
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,default=Path('public/art'));p.add_argument('--output',type=Path,default=Path('public/art'));p.add_argument('--ffmpeg',default=shutil.which('ffmpeg'));a=p.parse_args()
if not a.ffmpeg:p.error('ffmpeg is required')
files=list(a.source.rglob('*.png'))
def convert(source):
 rel=source.relative_to(a.source);out=a.output/rel.parent;out.mkdir(parents=True,exist_ok=True);outputs=[]
 width,height=struct.unpack('>II',source.read_bytes()[16:24])
 for size in [96,192,min(384,width,height)]:
  target=out/(source.stem+f'-{size}.webp')
  subprocess.run([a.ffmpeg,'-v','error','-y','-i',str(source),'-vf',f'scale=min({size}\\,iw):min({size}\\,ih):flags=lanczos','-c:v','libwebp','-lossless','1','-compression_level','6',str(target)],check=True)
  outputs.append({'file':str(target.relative_to(a.output)),'bytes':target.stat().st_size})
 return {'source':str(rel),'sourceBytes':source.stat().st_size,'outputs':outputs}
with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(convert,files))
report=Path('artifacts/performance/art-optimization.json')
report.parent.mkdir(parents=True,exist_ok=True)
report.write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps({'images':len(files),'originalBytes':sum(x['sourceBytes'] for x in results),'allResponsiveWebpBytes':sum(y['bytes'] for x in results for y in x['outputs'])}))
