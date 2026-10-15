// Words the researchers own. Edit the text here; no other file needs to change.
import type { Eq, Grid, Op, Pos } from './puzzle.ts'

export const HOW_TO = [
  { icon: '🧩', title: 'Fill the Grid!', text: 'Look at the crossword grid — some numbers are missing! Your job is to figure out which numbers go where by solving the integer operations.' },
  { icon: '➗', title: 'Integer Rules', text: 'Apply the rules of addition, subtraction, multiplication, and division of integers, including sign rules.' },
  { icon: '🏦', title: 'Use the Number Bank!', text: 'Pick numbers from your bank at the bottom. Tap a yellow cell, then tap a number to place it. Easy as pie! 🥧' },
  { icon: '💗', title: 'Lives System', text: 'You have 5 lives. Each wrong answer costs 1 life. Lose all lives and it’s game over, but you can always try again!' },
  { icon: '💰', title: 'Coins & Hints', text: 'Finish faster to earn more coins. Stuck? Tap (!) for the rules, or spend coins on a hint. In Relax Mode, (!) also gives a free clue for the box you picked!' },
]

// Client's pre-assessment and answer key (integrid.docx, 3rd page). A drill: scores are not recorded.
export const PRE_ASSESSMENT = [
  {
    q: 'When adding two integers with the same sign, what should you do?',
    choices: ['Subtract the numbers and keep the larger sign', 'Add the numbers and keep the common sign', 'Multiply the numbers', 'Change both signs to positive'],
    answer: 1,
  },
  {
    q: 'When adding two integers with different signs, what should you do?',
    choices: ['Add the numbers and keep the positive sign', 'Multiply the numbers', 'Subtract the absolute values and keep the sign of the larger absolute value', 'Always keep the negative sign'],
    answer: 2,
  },
  {
    q: 'What is the rule when multiplying two integers with the same sign?',
    choices: ['The product is negative', 'The product is positive', 'The product is zero', 'The product is undefined'],
    answer: 1,
  },
  {
    q: 'What is the rule when multiplying two integers with different signs?',
    choices: ['The product is positive', 'The product is negative', 'The product is zero', 'The product is unchanged'],
    answer: 1,
  },
  {
    q: 'Which statement is true about division of integers?',
    choices: [
      'Same signs give a positive quotient; different signs give a negative quotient',
      'Same signs give a negative quotient; different signs give a positive quotient',
      'Division always results in a positive quotient',
      'Division always results in a negative quotient',
    ],
    answer: 0,
  },
]

// 📖 Rules pop-up (the sketch's "RULES").
export const SIGN_RULES = [
  { title: 'Addition', lines: ['(+) + (+) = (+)', '(−) + (−) = (−)', 'Same signs: add the numbers and keep the common sign.', 'Different signs: subtract the absolute values and keep the sign of the larger absolute value.'] },
  { title: 'Subtraction', lines: ['Change subtraction to addition of the opposite: a − b = a + (−b).', 'Then use the addition rules.'] },
  { title: 'Multiplication', lines: ['(+) × (+) = (+)', '(−) × (−) = (+)', '(+) × (−) = (−)', '(−) × (+) = (−)', 'Same signs: positive. Different signs: negative.'] },
  { title: 'Division', lines: ['Same signs: the quotient is positive.', 'Different signs: the quotient is negative.'] },
  { title: 'Order of operations (MDAS)', lines: ['First × and ÷, from left to right.', 'Then + and −, from left to right.'] },
]

// The (!) popup: the rules for this level's operations (subtraction builds on addition).
const RULES_FOR: Record<Op, string[]> = { '+': ['Addition'], '−': ['Addition', 'Subtraction'], '×': ['Multiplication'], '÷': ['Division'] }
export function guideFor(ops: Op[], multiStep: boolean) {
  const titles = new Set(ops.flatMap((op) => RULES_FOR[op]))
  if (multiStep) titles.add('Order of operations (MDAS)')
  return SIGN_RULES.filter((s) => titles.has(s.title))
}

const ADD_LIKE = 'add the numbers and keep the common sign.'
const ADD_UNLIKE = 'subtract the absolute values and keep the sign of the larger absolute value.'

function ruleFor(op: Op, a: number, b: number) {
  const like = a * b > 0
  if (op === '+') return a === 0 || b === 0 ? 'Adding 0 does not change the number.' : `Adding ${like ? `like signs: ${ADD_LIKE}` : `unlike signs: ${ADD_UNLIKE}`}`
  if (op === '−') {
    if (b === 0) return 'Subtracting 0 does not change the number.'
    if (a === 0) return 'Subtracting from 0 gives the opposite of the number.'
    return `Subtracting: change it to adding the opposite → ${sign(a)} + ${sign(-b)}. Now the signs are ${a * -b > 0 ? `like: ${ADD_LIKE}` : `unlike: ${ADD_UNLIKE}`}`
  }
  if (op === '×') return a === 0 || b === 0 ? 'Any number times 0 is 0.' : `Multiplying ${like ? 'like signs: the product is positive.' : 'unlike signs: the product is negative.'}`
  return a === 0 ? '0 divided by a number is 0.' : `Dividing ${like ? 'like signs: the quotient is positive.' : 'unlike signs: the quotient is negative.'}`
}

const sign = (n: number) => (n > 0 ? '(+)' : n < 0 ? '(−)' : '0')

// What a screen reader should say for numbers and sign patterns ("(−) + (−)" → "negative plus negative").
export const sayNum = (n: number) => (n < 0 ? `negative ${-n}` : String(n))
const WORDS: Record<string, string> = { '(+)': 'positive', '(−)': 'negative', '+': 'plus', '−': 'minus', '×': 'times', '÷': 'divided by', '=': 'equals' }
export const sayPattern = (p: string) => p.split(' ').map((t) => WORDS[t] ?? t).join(' ')

// Free clue in Relax (the client's "guided practice"): the equation's sign pattern,
// e.g. (+) − (−) = (+), and the like/unlike rule for it. Never the number itself.
export function clue(grid: Grid, e: Eq) {
  const ops = [...e.left.ops, ...e.right.ops]
  if (ops.length !== 1) return null
  const val = (p: Pos) => (grid[p[0]][p[1]] as { v: number }).v
  const pattern = e.cells
    .map((p) => {
      const c = grid[p[0]][p[1]]!
      return c.t === 'num' ? sign(c.v) : c.t === 'op' ? c.op : '='
    })
    .join(' ')
  const [a, b] = (e.left.ops.length ? e.left : e.right).nums.map(val)
  return { pattern, rule: ruleFor(ops[0], a, b) }
}
