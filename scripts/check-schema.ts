import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const schema=readFileSync('supabase/schema.sql','utf8')
for (const file of ['secure-game-sync.sql','secure-battle.sql','enable-practice-results.sql']) assert.ok(schema.includes(readFileSync('supabase/'+file,'utf8')),file+' is included verbatim in canonical schema')
const db=new PGlite()
await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;")
await db.exec(schema);await db.exec(schema)
const result=await db.query<{name:string}>("SELECT proname AS name FROM pg_proc JOIN pg_namespace n ON n.oid=pronamespace WHERE n.nspname='public' AND proname LIKE 'integrid_%'")
for(const name of ['integrid_sync','integrid_practice_sync','integrid_battle_host','integrid_battle_watch','integrid_battle_event'])assert.ok(result.rows.some(r=>r.name===name))
await db.close()
console.log('✓ Canonical schema includes exact setup helpers and bootstraps/reruns in Postgres')
