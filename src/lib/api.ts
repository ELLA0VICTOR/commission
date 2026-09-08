let token = ''
export function resetApiSession() { token = '' }
export async function api<T>(path: string, body?: unknown): Promise<T> {
  if (body !== undefined && !token) {
    const response = await fetch('/api/session')
    if (!response.ok) throw new Error(response.status === 401 ? 'Your session ended. Refresh and sign in again.' : 'The production service is unavailable. Please try again.')
    token = (await response.json() as { token: string }).token
  }
  let response: Response
  try {
    response = await fetch('/api' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Commission-Session': token },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch { throw new Error('Cannot reach the production service. Check your connection and try again.') }
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new Error('The production service is unavailable. Please try again.')
  const result = await response.json()
  if (!response.ok) {
    if (response.status === 403) token = ''
    throw new Error(result.error || 'The request could not be completed.')
  }
  return result as T
}
