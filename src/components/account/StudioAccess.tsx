import { useEffect, useState, type FormEvent } from 'react'
import App from '../../App'
import { setProjectScope } from '../../lib/projects'
import { resetApiSession } from '../../lib/api'

type Access = { hosted: boolean; user: { id: string; username: string } | null }
export function StudioAccess() {
  const [access, setAccess] = useState<Access>()
  const [register, setRegister] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  function apply(value: Access) {
    setProjectScope(value.user?.id); resetApiSession(); setAccess(value); setPassword('')
  }
  useEffect(() => {
    let alive = true
    void fetch('/api/access').then(async response => {
      if (!response.ok) throw new Error('Studio is unavailable. Refresh to try again.')
      const value = await response.json() as Access
      if (alive) apply(value)
    }).catch(() => { if (alive) setError('Cannot reach your studio. Refresh to try again.') })
    return () => { alive = false }
  }, [])
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const response = await fetch('/api/auth/' + (register ? 'register' : 'login'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Sign-in failed.')
      apply({ hosted: true, user: result.user })
    } catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  async function signOut() {
    const response = await fetch('/api/auth/logout', { method: 'POST' })
    if (!response.ok) throw new Error('Could not sign out. Please try again.')
    apply({ hosted: true, user: null })
  }
  if (access && (!access.hosted || access.user)) return <App key={access.user?.id || 'local'} account={access.user || undefined} onSignOut={access.hosted ? signOut : undefined} />
  return <main className="studio-access"><section className="access-content">
    <a className="brand" href="/" aria-label="Commission home"><img src="/favicon.svg" width="36" height="36" alt="" /><span>commission.</span></a>
    <h1>{!access ? 'Opening your studio…' : register ? 'A studio of your own.' : 'Welcome to your studio.'}</h1>
    {access && <><p className="text-muted">Create your campaign. Connect your own Binance wallet. Approve every purchase.</p>
      <form onSubmit={event => void submit(event)} className="access-form">
        <label className="field">Username<input autoComplete="username" value={username} minLength={3} maxLength={32} pattern="[A-Za-z0-9_-]{3,32}" required onChange={event => setUsername(event.target.value)} /></label>
        <label className="field">Password<input type="password" autoComplete={register ? 'new-password' : 'current-password'} minLength={12} maxLength={128} value={password} required onChange={event => setPassword(event.target.value)} /></label>
        {register && <p className="footnote">Use at least 12 characters and save your password. Password recovery is not available yet. Campaign drafts are saved in this browser.</p>}
        <button className="button primary" disabled={busy}>{busy ? 'Please wait…' : register ? 'Create studio' : 'Sign in'}</button>
      </form>
      <button className="text-button" disabled={busy} onClick={() => { setRegister(!register); setError('') }}>{register ? 'Already have a studio? Sign in' : 'New here? Create a studio'}</button>
    </>}
    {error && <p className="notice" role="alert">{error}</p>}
  </section></main>
}
