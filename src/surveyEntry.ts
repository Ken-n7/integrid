// Separators are intentional formatting; invalid answer characters keep their item slot.
const compact = (text: string) => text.replace(/[\s,;]/g, '')
export function parseSurveyEntry(text: string, total = 20) {
  const tokens = [...compact(text)]
  const invalid = tokens.flatMap((value, index) => /^[0-4]$/.test(value) ? [] : [index + 1])
  const errors: string[] = []
  if (invalid.length) errors.push(`Check answer ${invalid.slice(0, 5).join(', ')}${invalid.length > 5 ? ' and more' : ''}. Use 1–4, or 0 for an unanswered item.`)
  if (tokens.length > total) errors.push(`You entered ${tokens.length} answers. Keep exactly ${total}.`)
  const answers = Array.from({ length: total }, (_, i) => /^[1-4]$/.test(tokens[i] ?? '') ? Number(tokens[i]) : 0)
  return { answers, error: errors.join(' '), complete: errors.length === 0 && answers.every(value => value >= 1) }
}
export function setSurveyChoice(text: string, index: number, value: number, total = 20) {
  if (!Number.isInteger(index) || index < 0 || index >= total || !Number.isInteger(value) || value < 1 || value > 4) throw new Error('Invalid survey choice')
  const tokens = [...compact(text)]
  while (tokens.length <= index) tokens.push('0')
  tokens[index] = String(value)
  return tokens.join('')
}
