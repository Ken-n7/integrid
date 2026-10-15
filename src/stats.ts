/* eslint-disable no-loss-of-precision -- published coefficients (AS 241); each parses to the nearest double, as intended */
// Statistics for the paper's research questions (Research tab). Checked against scipy in
// scripts/check.ts. A convenience for the researchers: they should confirm in SPSS/jamovi.

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
export const mean = (xs: number[]) => sum(xs) / xs.length
export function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
export const variance = (xs: number[]) => {
  const m = mean(xs)
  return sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1)
}
export const sd = (xs: number[]) => Math.sqrt(variance(xs))

// DepEd mastery levels on the Mean Percentage Score (the paper's interpretation table).
const MASTERY: [number, string][] = [
  [96, 'Mastered'],
  [86, 'Closely Approximating Mastery'],
  [66, 'Moving Towards Mastery'],
  [35, 'Average Mastery'],
  [15, 'Low Mastery'],
  [5, 'Very Low Mastery'],
  [0, 'Absolutely No Mastery'],
]
export const mastery = (mps: number) => MASTERY.find(([min]) => Math.round(mps) >= min)![1]

// The paper's 4-point Likert intervals (Table 1), read on means rounded to one decimal.
export function likert(m: number) {
  const r = Math.round(m * 10) / 10
  return r < 1.5 ? 'Strongly Disagree' : r < 2.5 ? 'Disagree' : r < 3.5 ? 'Agree' : 'Strongly Agree'
}

// ---------- distributions ----------

// erfc, |relative error| < 1.2e-7 (Numerical Recipes)
function erfc(x: number) {
  const z = Math.abs(x)
  const t = 1 / (1 + z / 2)
  const r =
    t *
    Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))))
  return x >= 0 ? r : 2 - r
}
export const normalCdf = (z: number) => 0.5 * erfc(-z / Math.SQRT2)

// Inverse normal CDF (Wichura, AS 241), as used by the Shapiro–Wilk coefficients.
export function normalQuantile(p: number) {
  const q = p - 0.5
  if (Math.abs(q) <= 0.425) {
    const r = 0.180625 - q * q
    return (
      (q *
        (((((((r * 2509.0809287301226727 + 33430.575583588128105) * r + 67265.770927008700853) * r + 45921.953931549871457) * r + 13731.693765509461125) * r + 1971.5909503065514427) * r + 133.14166789178437745) * r +
          3.387132872796366608)) /
      (((((((r * 5226.495278852545925 + 28729.085735721942674) * r + 39307.89580009271061) * r + 21213.794301586595867) * r + 5394.1960214247511077) * r + 687.1870074920579083) * r + 42.313330701600911252) * r + 1)
    )
  }
  let r = Math.sqrt(-Math.log(q < 0 ? p : 1 - p))
  let x: number
  if (r <= 5) {
    r -= 1.6
    x =
      (((((((r * 7.7454501427834140764e-4 + 0.0227238449892691845833) * r + 0.24178072517745061177) * r + 1.27045825245236838258) * r + 3.64784832476320460504) * r + 5.7694972214606914055) * r + 4.6303378461565452959) * r +
        1.42343711074968357734) /
      (((((((r * 1.05075007164441684324e-9 + 5.475938084995344946e-4) * r + 0.0151986665636164571966) * r + 0.14810397642748007459) * r + 0.68976733498510000455) * r + 1.6763848301838038494) * r + 2.05319162663775882187) * r + 1)
  } else {
    r -= 5
    x =
      (((((((r * 2.01033439929228813265e-7 + 2.71155556874348757815e-5) * r + 0.0012426609473880784386) * r + 0.026532189526576123093) * r + 0.29656057182850489123) * r + 1.7848265399172913358) * r + 5.4637849111641143699) * r +
        6.6579046435011037772) /
      (((((((r * 2.04426310338993978564e-15 + 1.4215117583164458887e-7) * r + 1.8463183175100546818e-5) * r + 7.868691311456132591e-4) * r + 0.0148753612908506148525) * r + 0.13692988092273580531) * r + 0.59983220655588793769) * r + 1)
  }
  return q < 0 ? -x : x
}

function lgamma(x: number) {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]
  let y = x
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5)
  let ser = 1.000000000190015
  for (const c of g) ser += c / ++y
  return -tmp + Math.log((2.5066282746310005 * ser) / x)
}

// Regularized incomplete beta I_x(a, b) (Numerical Recipes, continued fraction).
function betaInc(x: number, a: number, b: number) {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const front = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  const cf = (x: number, a: number, b: number) => {
    let c = 1
    let d = 1 - ((a + b) * x) / (a + 1)
    if (Math.abs(d) < 1e-30) d = 1e-30
    d = 1 / d
    let h = d
    for (let m = 1; m <= 300; m++) {
      const m2 = 2 * m
      let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2))
      d = 1 + aa * d
      if (Math.abs(d) < 1e-30) d = 1e-30
      c = 1 + aa / c
      if (Math.abs(c) < 1e-30) c = 1e-30
      d = 1 / d
      h *= d * c
      aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1))
      d = 1 + aa * d
      if (Math.abs(d) < 1e-30) d = 1e-30
      c = 1 + aa / c
      if (Math.abs(c) < 1e-30) c = 1e-30
      d = 1 / d
      const del = d * c
      h *= del
      if (Math.abs(del - 1) < 3e-16) break
    }
    return h
  }
  return x < (a + 1) / (a + b + 2) ? (front * cf(x, a, b)) / a : 1 - (front * cf(1 - x, b, a)) / b
}
// two-tailed p of Student's t
export const tTwoTailed = (t: number, df: number) => betaInc(df / (df + t * t), df / 2, 0.5)

// ---------- tests ----------

export type Paired = { n: number; meanDiff: number; sdDiff: number; t: number; df: number; p: number; d: number }
// Paired t-test on post − pre (RQ3), with Cohen's d_z as the effect size.
export function pairedT(pre: number[], post: number[]): Paired | null {
  const diff = post.map((x, i) => x - pre[i])
  const n = diff.length
  if (n < 2) return null
  const m = mean(diff)
  const s = sd(diff)
  if (s === 0) return null // every learner changed by the same amount: no spread to test
  const t = m / (s / Math.sqrt(n))
  return { n, meanDiff: m, sdDiff: s, t, df: n - 1, p: tTwoTailed(t, n - 1), d: m / s }
}

// Shapiro–Wilk W and p (Royston 1995, AS R94; the same method as scipy.stats.shapiro).
export function shapiroWilk(xs: number[]): { w: number; p: number } | null {
  const n = xs.length
  if (n < 3) return null
  const x = [...xs].sort((a, b) => a - b)
  const range = x[n - 1] - x[0]
  if (range === 0) return null
  const m = Array.from({ length: n }, (_, i) => normalQuantile((i + 1 - 0.375) / (n + 0.25)))
  const mm = sum(m.map((v) => v * v))
  const a = new Array<number>(n)
  if (n === 3) {
    a[0] = -Math.SQRT1_2
    a[1] = 0
    a[2] = Math.SQRT1_2
  } else {
    const u = 1 / Math.sqrt(n)
    const poly = (c: number[], u: number) => c.reduce((s, ci, i) => s + ci * u ** i, 0)
    const an = poly([m[n - 1] / Math.sqrt(mm), 0.221157, -0.147981, -2.07119, 4.434685, -2.706056], u)
    if (n > 5) {
      const an1 = poly([m[n - 2] / Math.sqrt(mm), 0.042981, -0.293762, -1.752461, 5.682633, -3.582633], u)
      const phi = (mm - 2 * m[n - 1] ** 2 - 2 * m[n - 2] ** 2) / (1 - 2 * an ** 2 - 2 * an1 ** 2)
      for (let i = 2; i < n - 2; i++) a[i] = m[i] / Math.sqrt(phi)
      a[0] = -an
      a[1] = -an1
      a[n - 2] = an1
      a[n - 1] = an
    } else {
      const phi = (mm - 2 * m[n - 1] ** 2) / (1 - 2 * an ** 2)
      for (let i = 1; i < n - 1; i++) a[i] = m[i] / Math.sqrt(phi)
      a[0] = -an
      a[n - 1] = an
    }
  }
  const xm = mean(x)
  const w = Math.min(1, sum(a.map((ai, i) => ai * x[i])) ** 2 / sum(x.map((v) => (v - xm) ** 2)))
  let p: number
  if (n === 3) p = Math.max(0, Math.min(1, (6 / Math.PI) * (Math.asin(Math.sqrt(w)) - Math.asin(Math.sqrt(0.75)))))
  else if (n <= 11) {
    const gamma = 0.459 * n - 2.273
    const ww = -Math.log(gamma - Math.log(1 - w))
    const mu = 0.544 - 0.39978 * n + 0.025054 * n ** 2 - 0.0006714 * n ** 3
    const sigma = Math.exp(1.3822 - 0.77857 * n + 0.062767 * n ** 2 - 0.0020322 * n ** 3)
    p = 1 - normalCdf((ww - mu) / sigma)
  } else {
    const ln = Math.log(n)
    const mu = 0.0038915 * ln ** 3 - 0.083751 * ln ** 2 - 0.31082 * ln - 1.5861
    const sigma = Math.exp(0.0030302 * ln ** 2 - 0.082676 * ln - 0.4803)
    p = 1 - normalCdf((Math.log(1 - w) - mu) / sigma)
  }
  return { w, p }
}

// Wilcoxon signed-rank on post − pre, two-sided, zeros dropped: exact when there are no ties and no
// zeros, otherwise the normal approximation with tie correction (SPSS's "Asymp. Sig."). Packages
// disagree on tied data (scipy truncates, R adds a continuity correction), so the page says which.
export function wilcoxon(pre: number[], post: number[]): { stat: number; p: number; exact: boolean; n: number } | null {
  const all = post.map((x, i) => x - pre[i])
  const d = all.filter((v) => v !== 0)
  const zeros = all.length - d.length
  const n = d.length
  if (n < 1) return null
  const order = d.map((v, i) => [Math.abs(v), i]).sort((a, b) => a[0] - b[0])
  const rank = new Array<number>(n)
  let ties = 0
  for (let i = 0; i < n; ) {
    let j = i
    while (j + 1 < n && order[j + 1][0] === order[i][0]) j++
    const t = j - i + 1
    if (t > 1) ties += t * (t * t - 1)
    for (let k = i; k <= j; k++) rank[order[k][1]] = (i + j + 2) / 2
    i = j + 1
  }
  const plus = sum(d.map((v, i) => (v > 0 ? rank[i] : 0)))
  const minus = (n * (n + 1)) / 2 - plus
  const stat = Math.min(plus, minus)
  if (!ties && !zeros && n <= 50) {
    // exact: how many of the 2^n sign patterns give a rank sum this extreme
    const max = (n * (n + 1)) / 2
    let count = new Array<number>(max + 1).fill(0)
    count[0] = 1
    for (let r = 1; r <= n; r++) {
      const next = [...count]
      for (let s = r; s <= max; s++) next[s] += count[s - r]
      count = next
    }
    const total = 2 ** n
    const below = sum(count.slice(0, Math.floor(stat) + 1))
    return { stat, p: Math.min(1, (2 * below) / total), exact: true, n }
  }
  const mu = (n * (n + 1)) / 4
  const se = Math.sqrt((n * (n + 1) * (2 * n + 1) - ties / 2) / 24)
  const z = (stat - mu) / se
  return { stat, p: Math.min(1, 2 * normalCdf(-Math.abs(z))), exact: false, n }
}

// Cronbach's alpha over items (rows = learners, columns = items). On right/wrong items this is KR-20.
export function cronbach(rows: number[][]): number | null {
  const k = rows[0]?.length ?? 0
  if (rows.length < 2 || k < 2) return null
  const itemVar = sum(Array.from({ length: k }, (_, j) => variance(rows.map((r) => r[j]))))
  const totalVar = variance(rows.map(sum))
  return totalVar === 0 ? null : (k / (k - 1)) * (1 - itemVar / totalVar)
}

// Item analysis for right/wrong items: difficulty (share right) and discrimination (upper 27%
// minus lower 27% of learners by total score, at least one learner per group).
export function itemAnalysis(rows: boolean[][]) {
  const n = rows.length
  const g = Math.max(1, Math.round(n * 0.27))
  const byScore = [...rows].sort((a, b) => sum(b.map(Number)) - sum(a.map(Number)))
  const upper = byScore.slice(0, g)
  const lower = byScore.slice(n - g)
  return rows[0].map((_, j) => {
    const difficulty = rows.filter((r) => r[j]).length / n
    const discrimination = upper.filter((r) => r[j]).length / g - lower.filter((r) => r[j]).length / g
    return { difficulty, discrimination }
  })
}
export const difficultyLabel = (p: number) => (p > 0.8 ? 'Very easy' : p > 0.6 ? 'Easy' : p > 0.4 ? 'Average' : p > 0.2 ? 'Difficult' : 'Very difficult')
export const discriminationLabel = (d: number) => (d >= 0.4 ? 'Very good' : d >= 0.3 ? 'Good' : d >= 0.2 ? 'Fair' : 'Poor')
// The paper: revise or discard items that are too easy, too hard, or don't discriminate.
export const itemAction = (p: number, d: number) => (d < 0.2 ? 'Revise or discard' : p > 0.8 || p <= 0.2 || d < 0.3 ? 'Revise' : 'Keep')
