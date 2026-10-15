// Makes a puzzle off the main thread, so the admin page stays responsive (Expert 5 takes seconds).
import { makePuzzle } from './generate.ts'

onmessage = (e: MessageEvent<{ id: string; seed: number }>) => postMessage(makePuzzle(e.data.id, e.data.seed, 4000))
