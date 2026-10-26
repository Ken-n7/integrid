import type { SupabaseClient } from '@supabase/supabase-js'

// Delete exactly one student. Database foreign keys remove their attempts and research atomically.
// Selecting the deleted code prevents an RLS-filtered zero-row response from looking successful.
export async function deleteStudent(client: Pick<SupabaseClient, 'from'>, code: string) {
  if (!/^[A-Z0-9-]{1,12}$/.test(code)) throw new Error('Invalid student code.')
  const { data, error } = await client.from('students').delete().eq('code', code).select('code')
  if (error) {
    if (error.code === '42501') throw new Error('Student deletion is not enabled for this teacher account. Ask the project administrator to enable it.')
    throw new Error(error.message)
  }
  if (data?.length !== 1 || data[0].code !== code) throw new Error('No student was deleted. Refresh the list and check that your account has permission to delete students.')
}
