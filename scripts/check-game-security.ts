import { PGlite } from '@electric-sql/pglite'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { LEVELS, BATTLES, reward } from '../src/rules.ts'
import { parse, blanksOf } from '../src/puzzle.ts'
import { versionOf } from '../src/puzzleVersion.ts'
const db = new PGlite()
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
CREATE TABLE public.students(code text PRIMARY KEY,pin text); INSERT INTO public.students VALUES('TEST','1234'),('OTHER','2345'),('ATOMIC','3456');
CREATE TABLE public.attempts(id uuid PRIMARY KEY,student text NOT NULL REFERENCES public.students,level text NOT NULL,result text NOT NULL,seconds integer NOT NULL,wrong integer NOT NULL,hints integer NOT NULL,coins integer NOT NULL,mistakes jsonb NOT NULL,played_at timestamptz NOT NULL,puzzle text);`)
const sql = readFileSync('supabase/secure-game-sync.sql','utf8')
await db.exec(sql); await db.exec(sql)
for (const level of [...LEVELS,...BATTLES]) {
  const csv = readFileSync(`puzzles/${level.id}.csv`,'utf8'), grid = parse(csv)
  const rows = await db.query<{version:string;bank:number[]}>('SELECT version,bank FROM integrid_private.game_policy WHERE level=$1',[level.id])
  assert.equal(rows.rows[0].version,versionOf(csv),'SQL puzzle version matches shipped file')
  assert.deepEqual(rows.rows[0].bank,blanksOf(grid).map(([r,c])=>(grid[r][c] as {v:number}).v))
}
const version = (level:string) => versionOf(readFileSync(`puzzles/${level}.csv`,'utf8'))
const make = (patch:Record<string,unknown>={}) => ({ id:randomUUID(),level:'relax-1',result:'win',seconds:3,wrong:0,hints:0,coins:60,mistakes:[],at:new Date(Date.now()-120_000).toISOString(),puzzle:version('relax-1'),...patch })
type Response = {attempts:{id:string;coins:number}[];ranking:unknown[]}
const sync = async (attempts:unknown[],code='TEST',pin='1234') => (await db.query<{result:Response}>('SELECT public.integrid_sync($1,$2,$3::jsonb) AS result',[code,pin,JSON.stringify(attempts)])).rows[0].result
await db.exec('SET ROLE anon')
assert.equal(await sync([],'TEST','0000'),null)
for (const patch of [
  {coins:2147483647},{level:'qa-unknown'},{puzzle:'fake'},
  {at:'2099-01-01T00:00:00Z'},{seconds:0},{wrong:2147483647},{hints:2147483647},
  {mistakes:{invalid:true}},{wrong:1,mistakes:[null]},{wrong:1,mistakes:[[1]]},
  {wrong:1,mistakes:[[99999999,-99999999]]},{wrong:1,mistakes:[[1,'2']]},
  {seconds:3.5},{seconds:'3'},
]) await assert.rejects(sync([make(patch)]),JSON.stringify(patch))
await assert.rejects(sync([make({level:'expert-5',puzzle:version('expert-5'),coins:120})]),/Previous level/)
const first=make();let saved=await sync([first]);assert.equal(saved.attempts.length,1);assert.equal(saved.attempts[0].coins,60)
saved=await sync([first]);assert.equal(saved.attempts.length,1)
saved=await sync([make()]);assert.equal(saved.attempts.length,2);assert.deepEqual(saved.attempts.map(a=>a.coins).sort((a,b)=>a-b),[0,60])
await assert.rejects(sync([{...first,seconds:8}]),/ID already used/)
await assert.rejects(sync([first],'OTHER','2345'),/ID already used/)
const hint=make({result:'quit',hints:1,coins:-60});saved=await sync([hint]);assert.equal(saved.attempts.find(a=>a.id===hint.id)?.coins,-60)
// Out-of-order input is sorted by start time so honest offline progression can be restored.
const base=Date.now()-90_000
const progression=LEVELS.slice(1).map((l,i)=>make({level:l.id,puzzle:version(l.id),at:new Date(base+i*1000).toISOString(),coins:l.mode==='expert'?120:60}))
saved=await sync([...progression].reverse());assert.equal(saved.attempts.length,11)
const expert=make({level:'expert-1',puzzle:version('expert-1'),result:'quit',hints:3,coins:-360});await assert.rejects(sync([expert]))
const both=await Promise.all([sync([make()],'OTHER','2345'),sync([make()],'OTHER','2345')]);assert.equal(both.at(-1)?.attempts.reduce((sum,a)=>sum+a.coins,0),60)
await assert.rejects(sync([make(),make({level:'bad'})],'ATOMIC','3456'));assert.equal((await sync([],'ATOMIC','3456')).attempts.length,0)
await assert.rejects(db.query('SELECT * FROM integrid_private.game_policy'))
for (const mode of ['relax','expert'] as const) for (const seconds of [1,60,61,120,121,180,181,240,241]) {
  const code = mode.toUpperCase() + seconds
  await db.exec('RESET ROLE')
  await db.query('INSERT INTO public.students VALUES($1,$2)',[code,'4567'])
  await db.exec('SET ROLE anon')
  if (mode==='expert') await sync(LEVELS.slice(0,4).map((l,i)=>make({level:l.id,puzzle:version(l.id),at:new Date(base+i*1000).toISOString()})),code,'4567')
  const level=mode+'-1', record=make({level,puzzle:version(level),seconds,coins:reward(mode,seconds)})
  const response=await sync([record],code,'4567')
  assert.equal(response.attempts.find(a=>a.id===record.id)?.coins,reward(mode,seconds))
}
await db.close()
console.log('✓ Game SQL: puzzle catalogue, bounds, progression, malformed data, atomic rejection, first-win rewards and retry IDs')
