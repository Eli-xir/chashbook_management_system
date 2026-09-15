import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { Brand } from '../ui'

type Step = 'username' | 'code' | 'newpass'

/**
 * Recovery: username -> SMS OTP to the admin-registered number -> verify ->
 * new password -> signed in straight into the app.
 */
export default function Recover() {
  const [step, setStep] = useState<Step>('username')
  const [username, setUsername] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [code, setCode] = useState('')
  const [grantId, setGrantId] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const { refresh } = useAuth()

  async function request(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const r = await api.post<{ ok: boolean; challenge_id: string }>('/auth/forgot-password', {
        username,
      })
      // Response is uniform whether or not the account exists; the code goes to
      // the registered phone (local mock provider prints it in the backend console).
      setChallengeId(r.challenge_id)
      setNotice('If the account exists, a code was sent to the registered number.')
      setStep('code')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const r = await api.post<{ grant_id: string }>('/auth/verify-otp', {
        username,
        challenge_id: challengeId,
        code,
      })
      setGrantId(r.grant_id)
      setStep('newpass'); setNotice('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code')
    } finally {
      setBusy(false)
    }
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setBusy(true)
    try {
      await api.post('/auth/reset-password', {
        username,
        grant_id: grantId,
        new_password: password,
      })
      await refresh() // reset signs the user straight in
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed')
      setBusy(false)
    }
  }

  return (
    <main className="recovery-shell"><Brand/><section className="recovery-panel"><span className="eyebrow">ACCOUNT RECOVERY</span>
      <h1>{step === 'username' ? 'Forgot your password?' : step === 'code' ? 'Check your phone' : 'A fresh start'}</h1><p className="step-help">{step === 'username' ? 'We will send a code to the phone number registered by your administrator.' : step === 'code' ? 'Enter your six-digit recovery code.' : 'Choose a new password, then go straight to your heads.'}</p>
      {error && <div className="error-banner" role="alert">{error}</div>}
      {notice && <div className="ok-banner">{notice}</div>}

      {step === 'username' && (
        <form onSubmit={request}>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoCapitalize="none"
            required
          />
          <button className="block" disabled={busy}>
            {busy ? 'Sendingâ€¦' : 'Send code'}
          </button>
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={verify}>
          <label htmlFor="code">6-digit code sent by SMS</label>
          <input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            minLength={6}
            maxLength={6}
            required
          />
          <button className="block" disabled={busy}>
            {busy ? 'Checkingâ€¦' : 'Verify code'}
          </button>
        </form>
      )}

      {step === 'newpass' && (
        <form onSubmit={reset}>
          <label htmlFor="p1">New password</label>
          <input
            id="p1"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
          <label htmlFor="p2">Confirm new password</label>
          <input
            id="p2"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={6}
            required
          />
          <button className="block" disabled={busy}>
            {busy ? 'Savingâ€¦' : 'Set new password'}
          </button>
        </form>
      )}

      {step === 'code' && <button className="subtle block" onClick={() => { setStep('username'); setCode(''); setNotice(''); setError('') }}>Change username or request another code</button>}
      <Link to="/login" style={{ marginTop: '1rem', textAlign: 'center' }}>
        Back to sign in
      </Link>
    </section></main>
  )
}
