import { useEffect, useRef, useState } from 'react'
import { api, fileUrl } from '../../api'
import { useFlow } from '../UserFlow'

const MAX_IMAGE_MB = 5

export default function ImageStep() {
  const { draft, setDraft, setStep } = useFlow()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const objectUrl = draft.imageUrl

  // Revoke preview blob/object URLs when replaced or unmounted.
  useEffect(() => {
    return () => {
      if (objectUrl && objectUrl.startsWith('blob:')) URL.revokeObjectURL(objectUrl)
    }
  }, [objectUrl])

  async function upload(file: File) {
    setError('')
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      setError(`Image is too large. Maximum ${MAX_IMAGE_MB} MB.`)
      return
    }
    setBusy(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const r = await api.upload<{ image_id: number }>('/media/images', form)
      if (draft.imageUrl && draft.imageUrl.startsWith('blob:')) URL.revokeObjectURL(draft.imageUrl)
      setDraft({ ...draft, imageId: r.image_id, imageUrl: fileUrl('images', r.image_id) })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (draft.imageId == null) return
    setBusy(true)
    try {
      await api.delete(`/media/images/${draft.imageId}`)
      if (draft.imageUrl && draft.imageUrl.startsWith('blob:')) URL.revokeObjectURL(draft.imageUrl)
      setDraft({ ...draft, imageId: null, imageUrl: null })
    } catch {
      // Draft row already gone server-side; clear locally regardless.
      setDraft({ ...draft, imageId: null, imageUrl: null })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <div className="topbar">
        <button className="secondary" onClick={() => setStep('amount')}>
          ← Back
        </button>
        <span className="title">Add a photo (optional)</span>
      </div>

      {objectUrl && (
        <div className="preview-box">
          <img src={objectUrl} alt="Attached receipt preview" />
          <div className="row">
            <button className="secondary" onClick={() => galleryRef.current?.click()} disabled={busy}>
              Replace
            </button>
            <button className="danger" onClick={remove} disabled={busy}>
              Remove
            </button>
          </div>
        </div>
      )}

      {!objectUrl && (
        <>
          <div className="hint">You can attach a photo of a receipt or document. This step can be skipped.</div>
          <button className="block secondary" onClick={() => cameraRef.current?.click()} disabled={busy}>
            📷 Take photo
          </button>
          <button className="block secondary" onClick={() => galleryRef.current?.click()} disabled={busy}>
            🖼 Choose from gallery
          </button>
        </>
      )}

      {/* Native inputs; Capacitor maps these to camera/gallery on Android. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
      />

      {error && <div className="error-banner" role="alert">{error}</div>}
      {busy && <div className="spin" />}
      <button className="block" onClick={() => setStep('voice')}>
        {objectUrl ? 'Next' : 'Skip'}
      </button>
    </section>
  )
}
