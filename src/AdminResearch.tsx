// Research tab: the paper's instrument, typed in from the paper forms, and the statistics its four
// research questions ask for (pretest, posttest, the difference, learning experience), plus the
// pilot's item analysis and reliability. A convenience: confirm in SPSS/jamovi with research.csv.
import { useState } from 'react'
import { RESEARCH_SURVEY, RESEARCH_TEST } from './content.ts'
import type { Op } from './puzzle.ts'
import { cronbach, difficultyLabel, discriminationLabel, itemAction, itemAnalysis, likert, mastery, mean, median, pairedT, sd, shapiroWilk, wilcoxon } from './stats.ts'
import { Deco, Dialog } from './ui.tsx'

export type Research = {
  pre: boolean[] | null
  post: boolean[] | null
  survey: number[] | null
}
type Which = 'pre' | 'post'
type EntryStatus = { saving: boolean; error: string }

const ITEMS = RESEARCH_TEST.length
const SURVEY = RESEARCH_SURVEY.flatMap((d) => d.items.map((text) => ({ dim: d.dim, text })))
const score = (marks: boolean[]) => marks.filter(Boolean).length
const mps = (s: number) => (100 * s) / ITEMS
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '—')
const pval = (p: number) => (p < 0.001 ? '< .001' : `= ${p.toFixed(3).replace(/^0/, '')}`)
const OPS: [Op, string][] = [
  ['+', 'Addition'],
  ['−', 'Subtraction'],
  ['×', 'Multiplication'],
  ['÷', 'Division'],
]
const alphaLabel = (a: number) => (a >= 0.9 ? 'Excellent' : a >= 0.8 ? 'Good' : a >= 0.7 ? 'Acceptable' : a >= 0.6 ? 'Questionable' : a >= 0.5 ? 'Poor' : 'Unacceptable')

function download(name: string, rows: (string | number)[][]) {
  const url = URL.createObjectURL(new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' }))
  Object.assign(document.createElement('a'), {
    href: url,
    download: name,
  }).click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ---------- entry ----------

function TestEditor({ code, which, value, onSave, onClose, saving, error }: { code: string; which: Which; value: boolean[] | null; onSave: (v: boolean[]) => void; onClose: () => void } & EntryStatus) {
  const [marks, setMarks] = useState<boolean[]>(value ?? Array(ITEMS).fill(false))
  const s = score(marks)
  return (
    <Dialog title={`${code}: ${which === 'pre' ? 'pretest' : 'posttest'} (Part I)`} onClose={onClose}>
      <p className="muted">Tap the items the learner got right. The answer key is shown to help you check the paper.</p>
      <div className="row wrap">
        <button className="link" onClick={() => setMarks(Array(ITEMS).fill(true))} disabled={saving}>
          All right
        </button>
        <button className="link" onClick={() => setMarks(Array(ITEMS).fill(false))} disabled={saving}>
          All wrong
        </button>
      </div>
      <ol className="marks">
        {RESEARCH_TEST.map((it, i) => (
          <li key={i}>
            <button className={marks[i] ? 'right' : 'wrong'} aria-pressed={marks[i]} disabled={saving} onClick={() => setMarks(marks.map((m, j) => (j === i ? !m : m)))}>
              <span className="n">{i + 1}.</span> {it.q} = {it.a < 0 ? `−${-it.a}` : it.a}
              <b>{marks[i] ? '✓ Right' : '✗ Wrong'}</b>
            </button>
          </li>
        ))}
      </ol>
      <p className="score-line" role="status">
        Score: <b>{s} / 20</b> · MPS {mps(s)}% · {mastery(mps(s))}
      </p>
      <div className="row">
        <button className="big secondary" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button className="big" onClick={() => onSave(marks)} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </Dialog>
  )
}

const SCALE = ['Strongly Disagree', 'Disagree', 'Agree', 'Strongly Agree']
function SurveyEditor({ code, value, onSave, onClose, saving, error }: { code: string; value: number[] | null; onSave: (v: number[]) => void; onClose: () => void } & EntryStatus) {
  const [answers, setAnswers] = useState<number[]>(value ?? Array(SURVEY.length).fill(0))
  const done = answers.every((a) => a >= 1)
  return (
    <Dialog title={`${code}: survey (Part II)`} onClose={onClose}>
      <label>
        Quick entry: type the 20 answers in order (1–4; a 0 marks one not answered yet)
        <input
          inputMode="numeric"
          autoComplete="off"
          disabled={saving}
          // up to the last answered item, with 0 for any gap, so each digit stays on its own item
          value={answers.slice(0, answers.findLastIndex((a) => a > 0) + 1).join('')}
          onChange={(e) => {
            const digits = e.target.value
              .replace(/[^0-4]/g, '')
              .slice(0, SURVEY.length)
              .split('')
              .map(Number)
            setAnswers(SURVEY.map((_, i) => digits[i] ?? 0))
          }}
        />
      </label>
      {RESEARCH_SURVEY.map((d, di) => (
        <fieldset key={d.dim} className="survey-dim">
          <legend>{d.dim}</legend>
          {d.items.map((text, j) => {
            const i = di * 5 + j
            return (
              <div key={i} className="survey-item">
                <p>
                  <span className="n">{i + 1}.</span> {text}
                </p>
                <div className="likert" role="group" aria-label={`Item ${i + 1}`}>
                  {SCALE.map((label, k) => (
                    <button key={k} aria-pressed={answers[i] === k + 1} aria-label={`${k + 1}, ${label}`} disabled={saving} onClick={() => setAnswers(answers.map((a, m) => (m === i ? k + 1 : a)))}>
                      {k + 1}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </fieldset>
      ))}
      <p className="score-line" role="status">
        {done ? `All 20 answered · mean ${f2(mean(answers))}` : `${answers.filter(Boolean).length} of 20 answered`}
      </p>
      <div className="row">
        <button className="big secondary" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button className="big" onClick={() => onSave(answers)} disabled={!done || saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </Dialog>
  )
}

// ---------- results ----------

function Describe({ rows }: { rows: { label: string; scores: number[] }[] }) {
  return (
    <div className="table-wrap" role="region" aria-label="Pretest and posttest scores" tabIndex={0}>
      <table className="rtable">
        <thead>
          <tr>
            <th>Test</th>
            <th>N</th>
            <th>Mean</th>
            <th>Median</th>
            <th>SD</th>
            <th>MPS</th>
            <th>Interpretation</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ label, scores }) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{scores.length}</td>
              <td>{scores.length ? f2(mean(scores)) : '—'}</td>
              <td>{scores.length ? f2(median(scores)) : '—'}</td>
              <td>{scores.length > 1 ? f2(sd(scores)) : '—'}</td>
              <td>{scores.length ? `${f2(mps(mean(scores)))}%` : '—'}</td>
              <td>{scores.length ? mastery(mps(mean(scores))) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Difference({ pre, post }: { pre: number[]; post: number[] }) {
  if (pre.length < 3) return <p className="note">Needs at least 3 learners with both a pretest and a posttest.</p>
  const gains = post.map((x, i) => x - pre[i])
  const t = pairedT(pre, post)
  const w = wilcoxon(pre, post)
  const sw = shapiroWilk(gains)
  const normal = !sw || sw.p > 0.05
  const p = normal ? t?.p : w?.p
  const conclusion =
    p === undefined
      ? 'Every learner changed by the same amount, so there is no spread to test.'
      : p <= 0.05
        ? `There is a significant difference: posttest scores are ${mean(gains) > 0 ? 'higher' : 'lower'} than pretest scores (${normal ? `paired t-test, t(${t!.df}) = ${f2(t!.t)}` : `Wilcoxon signed-rank, W = ${w!.stat}`}, p ${pval(p)}).`
        : `There is no significant difference between pretest and posttest scores (${normal ? `paired t-test, t(${t!.df}) = ${f2(t!.t)}` : `Wilcoxon signed-rank, W = ${w!.stat}`}, p ${pval(p)}).`
  return (
    <>
      <div className="table-wrap" role="region" aria-label="Pretest and posttest difference" tabIndex={0}>
        <table className="rtable">
          <tbody>
            <tr>
              <th scope="row">Learners with both tests</th>
              <td>{pre.length}</td>
            </tr>
            <tr>
              <th scope="row">Mean gain (posttest − pretest)</th>
              <td>
                {f2(mean(gains))} points (SD {f2(sd(gains))})
              </td>
            </tr>
            <tr>
              <th scope="row">Normality of the gains (Shapiro–Wilk)</th>
              <td>{sw ? `W = ${f2(sw.w)}, p ${pval(sw.p)}: ${normal ? 'looks normal, so the paired t-test applies' : 'not normal, so the Wilcoxon test applies'}` : '—'}</td>
            </tr>
            <tr className={normal ? 'pick' : undefined}>
              <th scope="row">Paired t-test</th>
              <td>{t ? `t(${t.df}) = ${f2(t.t)}, p ${pval(t.p)}, Cohen’s d = ${f2(t.d)}` : '—'}</td>
            </tr>
            <tr className={normal ? undefined : 'pick'}>
              <th scope="row">Wilcoxon signed-rank</th>
              <td>{w ? `W = ${w.stat}, p ${pval(w.p)} (${w.exact ? 'exact' : 'normal approximation, ties corrected'})` : '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="conclusion">{conclusion}</p>
    </>
  )
}

function ByOperation({ pre, post }: { pre: boolean[][]; post: boolean[][] }) {
  const pct = (rows: boolean[][], op: Op) => {
    const idx = RESEARCH_TEST.flatMap((it, i) => (it.op === op ? [i] : []))
    const marks = rows.flatMap((r) => idx.map((i) => r[i]))
    return marks.length ? (100 * marks.filter(Boolean).length) / marks.length : NaN
  }
  return (
    <div className="table-wrap" role="region" aria-label="Results by operation" tabIndex={0}>
      <table className="rtable">
        <thead>
          <tr>
            <th>Operation</th>
            <th>Items</th>
            <th>Pretest correct</th>
            <th>Posttest correct</th>
            <th>Change</th>
          </tr>
        </thead>
        <tbody>
          {OPS.map(([op, name]) => {
            const a = pct(pre, op)
            const b = pct(post, op)
            return (
              <tr key={op}>
                <th scope="row">{name}</th>
                <td>{RESEARCH_TEST.filter((it) => it.op === op).length}</td>
                <td>{Number.isFinite(a) ? `${a.toFixed(0)}%` : '—'}</td>
                <td>{Number.isFinite(b) ? `${b.toFixed(0)}%` : '—'}</td>
                <td>{Number.isFinite(a) && Number.isFinite(b) ? `${b - a >= 0 ? '+' : '−'}${Math.abs(b - a).toFixed(0)} points` : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Experience({ surveys }: { surveys: number[][] }) {
  if (!surveys.length) return <p className="note">No surveys entered yet.</p>
  const cols = (from: number, to: number) => surveys.flatMap((s) => s.slice(from, to))
  return (
    <>
      <div className="table-wrap" role="region" aria-label="Survey by dimension" tabIndex={0}>
        <table className="rtable">
          <thead>
            <tr>
              <th>Dimension</th>
              <th>Mean</th>
              <th>SD</th>
              <th>Interpretation</th>
            </tr>
          </thead>
          <tbody>
            {RESEARCH_SURVEY.map((d, di) => {
              // a learner's dimension score is the mean of its five items
              const scores = surveys.map((s) => mean(s.slice(di * 5, di * 5 + 5)))
              return (
                <tr key={d.dim}>
                  <th scope="row">{d.dim}</th>
                  <td>{f2(mean(scores))}</td>
                  <td>{scores.length > 1 ? f2(sd(scores)) : '—'}</td>
                  <td>{likert(mean(scores))}</td>
                </tr>
              )
            })}
            <tr className="total">
              <th scope="row">Overall</th>
              <td>{f2(mean(cols(0, 20)))}</td>
              <td>{surveys.length > 1 ? f2(sd(surveys.map((s) => mean(s)))) : '—'}</td>
              <td>{likert(mean(cols(0, 20)))}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <details>
        <summary>Each statement</summary>
        <div className="table-wrap" role="region" aria-label="Each statement" tabIndex={0}>
          <table className="rtable">
            <thead>
              <tr>
                <th>#</th>
                <th>Statement</th>
                <th>Mean</th>
                <th>SD</th>
                <th>Interpretation</th>
              </tr>
            </thead>
            <tbody>
              {SURVEY.map((it, i) => {
                const xs = surveys.map((s) => s[i])
                return (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td className="text">{it.text}</td>
                    <td>{f2(mean(xs))}</td>
                    <td>{xs.length > 1 ? f2(sd(xs)) : '—'}</td>
                    <td>{likert(mean(xs))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </details>
    </>
  )
}

function Instrument({ pre, post, surveys }: { pre: boolean[][]; post: boolean[][]; surveys: number[][] }) {
  const [which, setWhich] = useState<Which>('pre')
  const rows = which === 'pre' ? pre : post
  const items = rows.length >= 2 ? itemAnalysis(rows) : []
  const kr20 = rows.length >= 2 ? cronbach(rows.map((r) => r.map(Number))) : null
  return (
    <>
      <p className="muted">
        For the pilot test: items with very high or very low difficulty, or poor discrimination, should be revised or discarded (your Data Gathering Methods). Upper and lower
        groups are the top and bottom 27% of learners by score.
      </p>
      <div className="tabs" role="tablist" aria-label="Which test">
        {(['pre', 'post'] as const).map((w) => (
          <button key={w} role="tab" aria-selected={w === which} onClick={() => setWhich(w)}>
            {w === 'pre' ? 'Pretest' : 'Posttest'}
          </button>
        ))}
      </div>
      {items.length ? (
        <>
          <p>
            Reliability (KR-20): <b>{kr20 === null ? '—' : `${f2(kr20)} · ${alphaLabel(kr20)}`}</b>
          </p>
          <div className="table-wrap" role="region" aria-label="Item analysis" tabIndex={0}>
            <table className="rtable">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Difficulty</th>
                  <th>Discrimination</th>
                  <th>Suggested</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i}>
                    <th scope="row">
                      {i + 1}. {RESEARCH_TEST[i].q}
                    </th>
                    <td>
                      {f2(it.difficulty)} · {difficultyLabel(it.difficulty)}
                    </td>
                    <td>
                      {f2(it.discrimination)} · {discriminationLabel(it.discrimination)}
                    </td>
                    <td>{itemAction(it.difficulty, it.discrimination)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="note">Needs at least 2 learners’ {which === 'pre' ? 'pretests' : 'posttests'}.</p>
      )}
      <p>
        Survey reliability (Cronbach’s α):{' '}
        {surveys.length >= 2
          ? [['Overall', 0, 20] as const, ...RESEARCH_SURVEY.map((d, di) => [d.dim, di * 5, di * 5 + 5] as const)]
              .map(([label, from, to]) => {
                const a = cronbach(surveys.map((s) => s.slice(from, to)))
                return `${label} ${a === null ? '—' : `${f2(a)} (${alphaLabel(a)})`}`
              })
              .join(' · ')
          : 'needs at least 2 surveys.'}
      </p>
    </>
  )
}

// ---------- the tab ----------

export function ResearchTab({
  codes,
  data,
  saveIssue,
  onSave,
}: {
  codes: string[]
  data: Record<string, Research>
  saveIssue: string
  onSave: (code: string, patch: Partial<Research>) => Promise<void>
}) {
  const [edit, setEdit] = useState<{
    code: string
    part: Which | 'survey'
  } | null>(null)
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const openEntry = (code: string, part: Which | 'survey') => {
    setSaveError('')
    setEdit({ code, part })
  }
  const closeEntry = () => { if (!saving) setEdit(null) }
  const get = (code: string): Research => data[code] ?? { pre: null, post: null, survey: null }
  const both = codes.filter((c) => get(c).pre && get(c).post)
  const preMarks = codes.flatMap((c) => (get(c).pre ? [get(c).pre!] : []))
  const postMarks = codes.flatMap((c) => (get(c).post ? [get(c).post!] : []))
  const surveys = codes.flatMap((c) => (get(c).survey ? [get(c).survey!] : []))

  async function save(code: string, patch: Partial<Research>) {
    if (saving) return
    setSaving(true)
    setSaveError('')
    try {
      await onSave(code, patch)
      setEdit(null)
      setMsg(`Saved ${code}.`)
    } catch (e) {
      setSaveError(`Couldn’t save ${code}: ${(e as Error).message}. Your entries are still here; try saving again.`)
    } finally {
      setSaving(false)
    }
  }

  function exportCsv() {
    const n = Array.from({ length: ITEMS }, (_, i) => i + 1)
    download('research.csv', [
      [
        'student',
        ...n.map((i) => `pre_${i}`),
        'pre_score',
        'pre_mps',
        ...n.map((i) => `post_${i}`),
        'post_score',
        'post_mps',
        'gain',
        ...SURVEY.map((_, i) => `survey_${i + 1}`),
        ...RESEARCH_SURVEY.map((d) => d.dim.toLowerCase()),
        'survey_mean',
      ],
      ...codes.map((c) => {
        const r = get(c)
        const part = (m: boolean[] | null) => (m ? [...m.map(Number), score(m), mps(score(m))] : Array(ITEMS + 2).fill(''))
        return [
          c,
          ...part(r.pre),
          ...part(r.post),
          r.pre && r.post ? score(r.post) - score(r.pre) : '',
          ...(r.survey ?? Array(SURVEY.length).fill('')),
          ...RESEARCH_SURVEY.map((_, di) => (r.survey ? mean(r.survey.slice(di * 5, di * 5 + 5)).toFixed(2) : '')),
          r.survey ? mean(r.survey).toFixed(2) : '',
        ]
      }),
    ])
  }

  const cell = (code: string, part: Which) => {
    const m = get(code)[part]
    return (
      <button
        className="link"
        onClick={() => openEntry(code, part)}
        aria-label={`${code} ${part === 'pre' ? 'pretest' : 'posttest'}: ${m ? `${score(m)} of 20, edit` : 'enter'}`}
      >
        {m ? `${score(m)}/20 · ${mps(score(m))}%` : 'Enter'}
      </button>
    )
  }

  return (
    <>
      <section className="card">
        <h2>Research results</h2>
        <p>
          Type in the paper instrument (Appendix 5): <b>Part I</b>, the 20-item test, before and after the intervention, and <b>Part II</b>, the learning-experience survey. The
          page works out what your four research questions need. Codes only; only signed-in admins can see this.
        </p>
        {saveIssue && <p className="notice">{saveIssue}</p>}
        <p className="muted">
          A convenience, not a replacement for your statistician: check the numbers in SPSS or jamovi with the CSV.{' '}
          <button className="link" onClick={exportCsv} disabled={!codes.length}>
            <Deco>⬇</Deco> research.csv
          </button>
        </p>
        <div className="table-wrap" role="region" aria-label="Research entries" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Pretest</th>
                <th>Posttest</th>
                <th>Gain</th>
                <th>Survey</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => {
                const r = get(c)
                return (
                  <tr key={c}>
                    <td>
                      <b>{c}</b>
                    </td>
                    <td>{cell(c, 'pre')}</td>
                    <td>{cell(c, 'post')}</td>
                    <td>{r.pre && r.post ? `${score(r.post) - score(r.pre) >= 0 ? '+' : '−'}${Math.abs(score(r.post) - score(r.pre))}` : '—'}</td>
                    <td>
                      <button className="link" onClick={() => openEntry(c, 'survey')} aria-label={`${c} survey: ${r.survey ? 'entered, edit' : 'enter'}`}>
                        {r.survey ? `✓ mean ${f2(mean(r.survey))}` : 'Enter'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="note" role="status">
          {msg}
        </p>
      </section>

      <section className="card">
        <h2>RQ1–2 · Pretest and posttest scores</h2>
        <Describe
          rows={[
            { label: 'Pretest', scores: preMarks.map(score) },
            { label: 'Posttest', scores: postMarks.map(score) },
          ]}
        />
        <p className="muted small">MPS = mean score ÷ 20 × 100, read on DepEd’s mastery scale (your interpretation table).</p>
      </section>

      <section className="card">
        <h2>RQ3 · Difference between pretest and posttest</h2>
        <Difference pre={both.map((c) => score(get(c).pre!))} post={both.map((c) => score(get(c).post!))} />
        <h3>By operation</h3>
        <ByOperation pre={preMarks} post={postMarks} />
      </section>

      <section className="card">
        <h2>RQ4 · Learning experience (survey)</h2>
        <Experience surveys={surveys} />
        <p className="muted small">Read on your Table 1: 1.0–1.4 Strongly Disagree · 1.5–2.4 Disagree · 2.5–3.4 Agree · 3.5–4.0 Strongly Agree.</p>
      </section>

      <section className="card">
        <h2>Instrument check (pilot)</h2>
        <Instrument pre={preMarks} post={postMarks} surveys={surveys} />
      </section>

      {edit && edit.part !== 'survey' && (
        <TestEditor code={edit.code} which={edit.part} value={get(edit.code)[edit.part]} onClose={closeEntry} onSave={(v) => save(edit.code, { [edit.part]: v })} saving={saving} error={saveError} />
      )}
      {edit?.part === 'survey' && <SurveyEditor code={edit.code} value={get(edit.code).survey} onClose={closeEntry} onSave={(v) => save(edit.code, { survey: v })} saving={saving} error={saveError} />}
    </>
  )
}
