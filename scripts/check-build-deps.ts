import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const uri = require('fast-uri') as { normalize: (value: string) => string }
assert.ok(!/^javascript:/i.test(uri.normalize('%6Aavascript:alert(1)')))
console.log('✓ Build URI tooling does not activate an encoded JavaScript scheme')
const serialize = require('serialize-javascript') as (value: unknown, options: { space: number }) => string
const first = () => 0
first.toString = () => 'function first(){ return 1 }//</script'
const second = () => 1
second.toString = () => 'function second(){ return 2 } > <img src=x onerror=alert(1)>'
assert.doesNotMatch(serialize({ nested: { first }, second }, { space: 2 }), /<\/script(?=[\s/>])/i)
console.log('✓ Build serialization escapes a closing script tag at a function boundary')
