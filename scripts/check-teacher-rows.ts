import assert from 'node:assert/strict'
import { readTeacherRow } from '../src/teacherRows.ts'
const row = { id:'11111111-1111-4111-8111-111111111111',student:'S01',level:'relax-1',result:'lose',seconds:60,wrong:1,hints:0,coins:0,mistakes:[[2,-2]],played_at:'2026-10-28T00:00:00Z',puzzle:null }
assert.deepEqual(readTeacherRow(row).row,row)
for(const value of [null,{},'bad',{...row,mistakes:{invalid:true}},{...row,mistakes:[null]},{...row,mistakes:[3]},{...row,mistakes:[[2]]},{...row,mistakes:[[2,'-2']]},{...row,wrong:5},{...row,coins:'60'},{...row,played_at:'bad'},{...row,level:'unknown'}])assert.ok(readTeacherRow(value).issue)
const source=[row,{...row,mistakes:{invalid:true}},null];const good=source.map(readTeacherRow).flatMap(r=>r.row?[r.row]:[]);assert.equal(good.length,1);assert.equal(good[0].mistakes.filter(([answer,placed])=>placed===-answer).length,1)
console.log('✓ Teacher rows validate malformed API data and retain usable records for totals/export')
