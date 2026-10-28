// Shared by the browser and the server-policy regression check.
export function versionOf(csv: string) {
  let h = 0x811c9dc5
  for (const ch of csv.trim()) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0
  return h.toString(16).padStart(8, '0')
}
