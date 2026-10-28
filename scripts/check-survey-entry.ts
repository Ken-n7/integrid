import assert from 'node:assert/strict'
import { parseSurveyEntry, setSurveyChoice } from '../src/surveyEntry.ts'
const valid = '12341234123412341234'
assert.equal(parseSurveyEntry(valid).complete,true)
assert.deepEqual(parseSurveyEntry('1,2;3 4\n'.repeat(5)).answers,parseSurveyEntry(valid).answers)
const invalid='192341234123412341234', result=parseSurveyEntry(invalid)
assert.equal(result.complete,false);assert.match(result.error,/answer 2/);assert.match(result.error,/21 answers/);assert.deepEqual(result.answers.slice(0,5),[1,0,2,3,4])
assert.equal(parseSurveyEntry('').complete,false)
for(const char of ['5','6','7','8','9','x','.'])assert.equal(parseSurveyEntry(valid.slice(0,5)+char+valid.slice(6)).complete,false)
assert.equal(parseSurveyEntry(valid+'1').complete,false)
let manual=setSurveyChoice('',19,3);assert.equal(manual,'00000000000000000003');assert.equal(parseSurveyEntry(manual).complete,false)
manual=setSurveyChoice(invalid,1,2);assert.equal(manual.length,21);assert.equal(parseSurveyEntry(manual).complete,false,'a scale click cannot silently discard an extra item')
assert.equal(parseSurveyEntry(setSurveyChoice(valid.slice(0,1)+'9'+valid.slice(2),1,2)).complete,true)
assert.throws(()=>setSurveyChoice('',20,1))
console.log('✓ Survey entry preserves item positions, invalid/excess input, explicit gaps and manual corrections')
