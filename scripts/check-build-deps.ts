import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const uri = require('fast-uri') as { normalize: (value: string) => string }
assert.ok(!/^javascript:/i.test(uri.normalize('%6Aavascript:alert(1)')))
console.log('✓ Build URI tooling does not activate an encoded JavaScript scheme')
