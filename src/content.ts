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

// The paper's research instrument (Appendix 5), for the admin page's Research tab.
// Part I: the pretest/posttest, 20 items. `a` is the answer key; `op` lets results compare operations.
export const RESEARCH_TEST: { q: string; a: number; op: Op }[] = [
  { q: '(−24) + (−17)', a: -41, op: '+' },
  { q: '(−39) + 15', a: -24, op: '+' },
  { q: '92 + (−73)', a: 19, op: '+' },
  { q: '(−25) − (−5)', a: -20, op: '−' },
  { q: '4 − (−6)', a: 10, op: '−' },
  { q: '(−13) − 6', a: -19, op: '−' },
  { q: '(−3)(−13)', a: 39, op: '×' },
  { q: '(5)(−9)', a: -45, op: '×' },
  { q: '(−18) ÷ (−6)', a: 3, op: '÷' },
  { q: '(−94) ÷ 2', a: -47, op: '÷' },
  { q: '14 + (−7)', a: 7, op: '+' },
  { q: '5(−5)', a: -25, op: '×' },
  { q: '−15 ÷ 3', a: -5, op: '÷' },
  { q: '9(−3)', a: -27, op: '×' },
  { q: '−10 + 15', a: 5, op: '+' },
  { q: '−6 − 8', a: -14, op: '−' },
  { q: '24 ÷ (−6)', a: -4, op: '÷' },
  { q: '−7(8)', a: -56, op: '×' },
  { q: '−30 ÷ 2', a: -15, op: '÷' },
  { q: '17 − 12', a: 5, op: '−' },
]

// Part II: the learning-experience survey, 4-point scale, five items per dimension (RQ4).
export const RESEARCH_SURVEY = [
  {
    dim: 'Attention',
    items: [
      'INTEGRID activities were interesting and enjoyable.',
      'INTEGRID kept my attention throughout the lesson.',
      'The crossword format made learning integer operations more fun.',
      'The visual presentation in INTEGRID made the lesson easier to understand.',
      'INTEGRID encouraged me to participate actively during the lesson.',
    ],
  },
  {
    dim: 'Relevance',
    items: [
      'INTEGRID helped me understand the rules in adding and subtracting integers.',
      'The activities in INTEGRID helped me connect the lesson to real-life situations.',
      'The exercises in INTEGRID helped improve my problem-solving skills in mathematics.',
      'The examples provided in INTEGRID were easy to follow.',
      'INTEGRID helped me distinguish positive and negative integers clearly.',
    ],
  },
  {
    dim: 'Confidence',
    items: [
      'INTEGRID was easy to use during the lesson.',
      'The instructions in INTEGRID were clear and easy to understand.',
      'I was able to navigate INTEGRID without difficulty.',
      'I quickly learned how to use INTEGRID without difficulty.',
      'I became more confident in solving integer operations after using INTEGRID.',
    ],
  },
  {
    dim: 'Satisfaction',
    items: [
      'The layout and design of INTEGRID helped me complete the activities.',
      'I felt motivated to complete the activities in INTEGRID.',
      'The activities in INTEGRID helped me avoid mistakes in integer operations.',
      'I was satisfied with my learning experience while using INTEGRID.',
      'I would like to use INTEGRID again in future lessons.',
    ],
  },
]
