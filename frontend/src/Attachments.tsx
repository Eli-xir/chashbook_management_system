import { useEffect, useRef, useState } from 'react'
import { api, fileUrl } from './api'
import { Alert, Icon } from './ui'

export function ImagePicker({ value, onChange, onBusy }: { value: number | null; onChange: (id: number | null) => void; onBusy?: (value: boolean) => void }) {
  const camera = useRef<HTMLInputElement>(null), gallery = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [choosing, setChoosing] = useState(false)
  async function upload(file?: File) {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setError('Choose a photo smaller than 5 MB.'); return }
    setBusy(true); onBusy?.(true); setError('')
    try { const form = new FormData(); form.append('file', file); const r = await api.upload<{ image_id: number }>('/media/images', form); onChange(r.image_id); setChoosing(false) }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false); onBusy?.(false) }
  }
  return <div className="attachment-picker"><Alert>{error}</Alert><input ref={camera} hidden type="file" accept="image/*" capture="environment" onChange={e => { void upload(e.target.files?.[0]); e.target.value = '' }}/><input ref={gallery} hidden type="file" accept="image/jpeg,image/png,image/webp,image/heic" onChange={e => { void upload(e.target.files?.[0]); e.target.value = '' }}/>
    {value ? <div className="media-preview"><img src={fileUrl('images', value)} alt="Selected attachment"/><div className="row"><button type="button" className="secondary" disabled={busy} onClick={() => setChoosing(true)}>Replace photo</button><button type="button" className="subtle danger-text" disabled={busy} onClick={() => onChange(null)}>Remove</button></div></div> : <button type="button" className="upload-tile" disabled={busy} onClick={() => setChoosing(true)}><span className="large-icon"><Icon name="image" size={32}/></span><strong>{busy ? 'Uploading photo…' : 'Add a photo'}</strong><span>A receipt, a document, or a quick photo</span><small>JPG, PNG, WebP or HEIC · up to 5 MB</small></button>}
    {choosing && <div className="choice-grid"><button type="button" className="choice-card" disabled={busy} onClick={() => camera.current?.click()}><Icon name="camera"/><strong>Use camera</strong></button><button type="button" className="choice-card" disabled={busy} onClick={() => gallery.current?.click()}><Icon name="image"/><strong>From gallery</strong></button></div>}{busy && <p role="status" className="hint">Uploading… please keep this step open.</p>}
  </div>
}

export function VoicePicker({ value, onChange, onBusy }: { value: number | null; onChange: (id: number | null) => void; onBusy?: (value: boolean) => void }) {
  const rec = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null), alive = useRef(true)
  const uploadInput = useRef<HTMLInputElement>(null)
  const [recording, setRecording] = useState(false), [busy, setBusy] = useState(false), [seconds, setSeconds] = useState(0), [error, setError] = useState('')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false; if (rec.current) rec.current.onstop = null; stream.current?.getTracks().forEach(t => t.stop()) } }, [])
  useEffect(() => { if (!recording) return; const timer = setInterval(() => setSeconds(s => s + 1), 1000); return () => clearInterval(timer) }, [recording])
  useEffect(() => { if (recording && seconds >= 180) rec.current?.stop() }, [seconds, recording])
  async function upload(file: File) {
    setPendingFile(file)
    if (file.size > 10 * 1024 * 1024) { setError('Choose a recording smaller than 10 MB.'); setPendingFile(null); onBusy?.(false); return }
    setBusy(true); onBusy?.(true); setError('')
    try { const form = new FormData(); form.append('file', file); const r = await api.upload<{ voice_id: number }>('/media/voice', form); if (alive.current) { onChange(r.voice_id); setPendingFile(null) } }
    catch (e) { if (alive.current) setError((e as Error).message) }
    finally { if (alive.current) { setBusy(false); onBusy?.(false) } }
  }
  async function start() {
    setError(''); onBusy?.(true); setBusy(true)
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Recording needs a secure browser connection. You can upload an audio file instead.')
      const s = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!alive.current) { s.getTracks().forEach(t => t.stop()); return }
      stream.current = s
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported(t))
      const r = new MediaRecorder(s, mimeType ? { mimeType } : undefined); rec.current = r
      const chunks: Blob[] = []
      r.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
      r.onstop = () => { s.getTracks().forEach(t => t.stop()); setRecording(false); const type = r.mimeType.split(';')[0]; void upload(new File(chunks, `voice.${type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'}`, { type })) }
      r.start(); setSeconds(0); setRecording(true); setBusy(false)
    } catch (e) { setError((e as Error).message); setBusy(false); onBusy?.(false) }
  }
  return <div className="attachment-picker"><Alert>{error}</Alert>{value && !recording && <div className="media-preview"><audio controls src={fileUrl('voice', value)}/><button type="button" className="subtle danger-text" disabled={busy} onClick={() => onChange(null)}>Remove recording</button></div>}
    <div className={`record-area ${recording ? 'is-recording' : ''}`}><button type="button" className="record-button" aria-label={recording ? 'Stop recording' : 'Start recording'} disabled={busy} onClick={() => recording ? rec.current?.stop() : void start()}>{recording ? <span className="stop-square"/> : <Icon name="mic" size={32}/>}</button><strong>{recording ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : busy ? 'Saving your recording…' : value ? 'Record again' : 'Tap to record'}</strong><p>{recording ? 'Tap the square to stop' : 'Say what this entry is for. Up to 3 minutes.'}</p></div>
    {pendingFile && !busy && <button type="button" className="secondary block" onClick={() => void upload(pendingFile)}>Retry upload</button>}
    <input ref={uploadInput} type="file" hidden accept="audio/*" onChange={e => { if (e.target.files?.[0]) void upload(e.target.files[0]); e.target.value = '' }}/><button type="button" className="subtle block" disabled={busy || recording} onClick={() => uploadInput.current?.click()}>Upload an audio file instead</button>
  </div>
}
