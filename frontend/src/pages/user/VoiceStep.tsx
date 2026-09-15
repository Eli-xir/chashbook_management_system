import { useEffect, useRef, useState } from 'react'
import { api, fileUrl } from '../../api'
import { useFlow } from '../UserFlow'

const MAX_VOICE_MB = 10

export default function VoiceStep() {
  const { draft, setDraft, setStep } = useFlow()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    return () => {
      // Stop mic and revoke object URL when leaving.
      streamRef.current?.getTracks().forEach((t) => t.stop())
      if (draft.voiceUrl && draft.voiceUrl.startsWith('blob:')) URL.revokeObjectURL(draft.voiceUrl)
    }
  }, [draft.voiceUrl])

  useEffect(() => {
    if (!recording) return
    const t = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [recording])

  async function startRecording() {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Recording is not supported on this device or browser.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const rec = new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = (e) => chunksRef.current.push(e.data)
      rec.onstop = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        void saveRecording()
      }
      rec.start()
      recorderRef.current = rec
      setSeconds(0)
      setRecording(true)
    } catch {
      setError('Microphone access was denied. You can continue without a voice note.')
    }
  }

  function stopRecording() {
    recorderRef.current?.stop()
    setRecording(false)
  }

  async function saveRecording() {
    const blob = new Blob(chunksRef.current, { type: recorderRef.current?.mimeType || 'audio/webm' })
    if (blob.size > MAX_VOICE_MB * 1024 * 1024) {
      setError('Recording is too large. Maximum 10 MB.')
      return
    }
    setBusy(true)
    try {
      const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm'
      const form = new FormData()
      form.append('file', new File([blob], `note.${ext}`, { type: blob.type }))
      const r = await api.upload<{ voice_id: number }>('/media/voice', form)
      if (draft.voiceUrl && draft.voiceUrl.startsWith('blob:')) URL.revokeObjectURL(draft.voiceUrl)
      setDraft({ ...draft, voiceId: r.voice_id, voiceUrl: fileUrl('voice', r.voice_id) })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (draft.voiceId == null) return
    setBusy(true)
    try {
      await api.delete(`/media/voice/${draft.voiceId}`)
      if (draft.voiceUrl && draft.voiceUrl.startsWith('blob:')) URL.revokeObjectURL(draft.voiceUrl)
      setDraft({ ...draft, voiceId: null, voiceUrl: null })
    } catch {
      setDraft({ ...draft, voiceId: null, voiceUrl: null })
    } finally {
      setBusy(false)
    }
  }

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

  return (
    <section>
      <div className="topbar">
        <button className="secondary" onClick={() => setStep('image')}>
          ← Back
        </button>
        <span className="title">Voice note (optional)</span>
      </div>

      {error && <div className="error-banner" role="alert">{error}</div>}

      {recording && (
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.6rem' }}>● Recording {mmss}</div>
          <button className="block danger" onClick={stopRecording}>
            ■ Stop
          </button>
        </div>
      )}

      {!recording && !draft.voiceId && (
        <>
          <div className="hint">Record a short note about this entry. You can also skip this.</div>
          <button className="block secondary" onClick={startRecording} disabled={busy}>
            🎙 Start recording
          </button>
        </>
      )}

      {!recording && draft.voiceId && (
        <div className="preview-box">
          <audio ref={audioRef} controls src={draft.voiceUrl ?? undefined} style={{ width: '100%' }} />
          <div className="row">
            <button
              className="secondary"
              onClick={startRecording}
              disabled={busy}
            >
              Re-record
            </button>
            <button className="danger" onClick={remove} disabled={busy}>
              Remove
            </button>
          </div>
        </div>
      )}

      {busy && <div className="spin" />}
      <button className="block" onClick={() => setStep('payable')}>
        {draft.voiceId || recording ? 'Next' : 'Skip'}
      </button>
    </section>
  )
}
