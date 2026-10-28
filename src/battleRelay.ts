// Production Battle traffic passes only through credential-checked database functions.
// Room snapshots require the owning teacher; events require the student's PIN/group.
import { isGroupMsg, isRoom, type GroupMsg, type Room } from './battleState.ts'
export type BattleAuth = { teacher: true } | { code: string; pin: string }
type Client = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> }
type Event = { seq: number; group: number; message: GroupMsg }
type Response = { snapshot: Room & { instance: string; revision: number }; events: Event[] }
const isResponse = (value: unknown): value is Response => {
  if (!value || typeof value !== 'object') return false
  const r = value as Response
  return isRoom(r.snapshot) && typeof r.snapshot.instance === 'string' && /^[a-f\d-]{36}$/i.test(r.snapshot.instance) && Number.isSafeInteger(r.snapshot.revision) && r.snapshot.revision >= 1 &&
    Array.isArray(r.events) && r.events.every(e => e && Number.isSafeInteger(e.seq) && e.seq > 0 && Number.isInteger(e.group) && e.group >= 0 && e.group < r.snapshot.members.length && isGroupMsg(e.message))
}
export class BattleRelay {
  private client: Client
  private room: string
  private auth: BattleAuth
  private onError: (error: unknown) => void
  private listeners = new Set<{ subject: 'room' | number; receive: (value: unknown) => void; ready: () => void; started: boolean }>()
  private instance: string | null = null
  private revision = 0
  private cursor = 0
  private group: number | null = null
  private polling = false
  private closed = false
  private timer: ReturnType<typeof setInterval> | undefined
  private outgoing: Promise<unknown> = Promise.resolve()
  pending = 0
  constructor(client: Client, room: string, auth: BattleAuth, onError: (error: unknown) => void, autoPoll = true) {
    this.client = client; this.room = room; this.auth = auth; this.onError = onError
    if (autoPoll) this.timer = setInterval(() => { void this.poll() }, 500)
  }
  subscribe(subject: 'room' | number, receive: (value: unknown) => void, ready: () => void) {
    const listener = { subject, receive, ready, started: false }
    this.listeners.add(listener)
    if (this.instance) queueMicrotask(() => { if (!this.closed && this.listeners.has(listener)) { listener.started = true; ready() } })
    void this.poll()
    return () => { this.listeners.delete(listener) }
  }
  private accept(value: unknown) {
    if (this.closed || value === null) return
    if (!isResponse(value)) throw new Error('Invalid Battle response')
    if (this.instance && value.snapshot.instance !== this.instance) throw new Error('This Battle room has ended')
    this.instance = value.snapshot.instance
    if (value.snapshot.revision >= this.revision) {
      this.revision = value.snapshot.revision
      for (const listener of this.listeners) if (listener.subject === 'room') listener.receive(value.snapshot)
    }
    for (const event of value.events) {
      if (event.seq <= this.cursor) continue
      for (const listener of this.listeners) if (listener.subject === event.group) listener.receive(event.message)
      this.cursor = event.seq
    }
    for (const listener of this.listeners) if (!listener.started) { listener.started = true; listener.ready() }
  }
  async poll() {
    if (this.closed || this.polling) return
    this.polling = true
    try {
      const auth = this.auth
      const teacher = 'teacher' in auth
      const { data, error } = await this.client.rpc(teacher ? 'integrid_battle_host' : 'integrid_battle_watch', teacher
        ? { p_room: this.room, p_after: this.cursor }
        : { p_room: this.room, p_code: auth.code, p_pin: auth.pin, p_group: this.group, p_after: this.cursor, p_instance: this.instance })
      if (error) throw error
      this.accept(data)
    } catch (error) { if (!this.closed) this.onError(error) }
    finally { this.polling = false }
  }
  publish(snapshot: Room) {
    if (!('teacher' in this.auth)) return Promise.reject(new Error('Only the teacher can publish room controls'))
    return this.enqueue(async () => {
      const { data, error } = await this.client.rpc('integrid_battle_host', { p_room: this.room, p_snapshot: snapshot, p_after: this.cursor })
      if (error) throw error
      if (data === null) throw new Error('Battle room was not saved')
      this.accept(data)
      return 'ok' as const
    })
  }
  event(group: number, message: GroupMsg) {
    if ('teacher' in this.auth) return Promise.reject(new Error('A teacher cannot impersonate a student'))
    const auth = this.auth
    const id = crypto.randomUUID()
    return this.enqueue(async () => {
      if (!this.instance) throw new Error('Wait for the room to connect')
      // Retry lost acknowledgements with the same ID. The database deduplicates it.
      let lastError: unknown
      for (let retry = 0; !this.closed; retry++) {
        if (this.closed) throw new Error('Battle connection closed')
        const { data, error } = await this.client.rpc('integrid_battle_event', { p_room: this.room, p_instance: this.instance, p_code: auth.code, p_pin: auth.pin, p_group: group, p_id: id, p_message: message })
        if (!error && data && typeof data === 'object' && 'ok' in data && data.ok === true) {
          if (message.t === 'join') this.group = group
          if (message.t === 'leave' && this.group === group) this.group = null
          void this.poll()
          return 'ok' as const
        }
        lastError = error ?? new Error('Battle answer was not confirmed')
        if (error && typeof error === 'object' && 'code' in error && ['42501', 'P0001', 'PGRST202'].includes(String(error.code))) break
        this.onError(lastError)
        await new Promise(resolve => setTimeout(resolve, Math.min(10_000, 250 * 2 ** Math.min(retry, 6))))
      }
      throw lastError
    })
  }
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    this.pending++
    const next = this.outgoing.catch(() => {}).then(fn).finally(() => { this.pending-- })
    this.outgoing = next
    return next
  }
  close() { this.closed = true; clearInterval(this.timer); this.listeners.clear() }
}
