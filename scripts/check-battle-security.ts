import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
const db=new PGlite()
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key); INSERT INTO auth.users VALUES ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222'); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$; CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT auth.uid() IS NOT NULL $$; CREATE TABLE public.students(code text primary key,pin text); INSERT INTO public.students VALUES ('S01','1234'),('S02','2345'); GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;`)
const sql=await fs.readFile('supabase/secure-battle.sql','utf8');await db.exec(sql);await db.exec(sql)
const instance=randomUUID(),snapshot={instance,puzzle:'battle-1',csv:'?1,+,?(-2),=,-1',seconds:60,state:'lobby',startedAt:null,sentAt:Date.now(),members:[[],[]],bars:[{cells:[],wrong:0,done:null},{cells:[],wrong:0,done:null}]}
type Result = { snapshot: { instance: string }; events: { group: number; message: { t: string; k?: string; wrong?: number } }[] }
const query=async<T>(sql: string,args: unknown[]): Promise<T> => (await db.query<{value:T}>(sql,args)).rows[0].value
const host=async(s: unknown=null,after=0)=>query<Result>('SELECT public.integrid_battle_host($1,$2,$3) AS value',['1234',s,after])
const event=async(code: string,pin: string,group: number,message: Record<string,unknown>,id=randomUUID())=>query<{ok:boolean}>('SELECT public.integrid_battle_event($1,$2,$3,$4,$5,$6,$7) AS value',['1234',instance,code,pin,group,id,message])
const watch=async(code: string,pin: string,group: number|null=null,after=0)=>query<Result>('SELECT public.integrid_battle_watch($1,$2,$3,$4,$5,$6) AS value',['1234',code,pin,group,after,instance])
await db.exec("SET ROLE anon")
await assert.rejects(host(snapshot));await assert.rejects(watch('S01','0000'))
await db.exec("RESET ROLE; SET ROLE authenticated; SET test.uid='11111111-1111-4111-8111-111111111111'")
const created=await host(snapshot);assert.equal(created.snapshot.instance,instance)
await db.exec("SET test.uid='22222222-2222-4222-8222-222222222222'");await assert.rejects(host(snapshot));await assert.rejects(host())
await db.exec("RESET ROLE; SET ROLE anon; SET test.uid=''")
await assert.rejects(event('S01','0000',0,{t:'join',code:'S01'}))
await assert.rejects(event('S01','1234',0,{t:'join',code:'S02'}))
await event('S01','1234',0,{t:'join',code:'S01'});await event('S02','2345',1,{t:'join',code:'S02'})
assert.equal((await watch('S01','1234',0)).events.length,1)
await assert.rejects(watch('S01','1234',1))
await db.exec("RESET ROLE; SET ROLE authenticated; SET test.uid='11111111-1111-4111-8111-111111111111'")
const live={...snapshot,state:'live',startedAt:Date.now()};await host(live)
await db.exec("RESET ROLE; SET ROLE anon; SET test.uid=''")
await assert.rejects(event('S01','1234',0,{t:'cell',code:'S01',k:'0,0',hint:false}))
await assert.rejects(event('S01','1234',0,{t:'cell',code:'S01',k:'0,0',value:999,hint:false}))
await assert.rejects(event('S01','1234',1,{t:'cell',code:'S01',k:'0,0',value:1,hint:false}))
// One correct cell and the same event ID are persisted once.
const id=randomUUID(),cell={t:'cell',code:'S01',k:'0,0',value:1,hint:false}
await event('S01','1234',0,cell,id);await event('S01','1234',0,cell,id)
const own=await watch('S01','1234',0);assert.equal(own.events.filter(e=>e.message.t==='cell'&&e.message.k==='0,0').length,1)
assert.ok(own.events.every(e=>e.group===0))
await assert.rejects(db.query('SELECT * FROM integrid_private.battle_rooms'))
const run=randomUUID();await event('S01','1234',0,{t:'wrong',code:'S01',run,k:'0,0',value:8,wrong:999});
// This already solved box is ignored; verify wrong answers on another box instead.
await event('S02','2345',1,{t:'wrong',code:'S02',run,k:'0,0',value:8,wrong:999})
const other=await watch('S02','2345',1);assert.equal(other.events.find(e=>e.message.t==='wrong')!.message.wrong,1)
await event('S01','1234',0,{t:'cell',code:'S01',k:'0,2',value:-2,hint:false},id)
assert.equal((await watch('S01','1234',0)).events.filter(e=>e.message.t==='cell').length,1)
await db.exec("RESET ROLE; SET ROLE authenticated; SET test.uid='11111111-1111-4111-8111-111111111111'")
await host({...live,state:'done'});await assert.rejects(host(live))
await db.exec("RESET ROLE; SET ROLE anon; SET test.uid=''")
await assert.rejects(event('S01','1234',0,{t:'cell',code:'S01',k:'0,2',value:-2,hint:false}))
console.log('PASS: anonymous isolation, teacher ownership, PIN/sender/group checks, coordinate-only and incorrect-answer rejection, event idempotency, server wrong counts, terminal lifecycle')
await db.close()
