import { useFlow } from '../UserFlow'

/** Simple confirmation. Send clears the draft; "Make another" and the natural
 * flow both return to the top-level heads. */
export default function SuccessStep() {
  const { draft, setDraft, setStep } = useFlow()

  function done() {
    setDraft({
      headId: null,
      headPath: [],
      amount: '',
      mediumId: null,
      imageId: null,
      imageUrl: null,
      voiceId: null,
      voiceUrl: null,
      payable: false,
      submitted: false,
    })
    setStep('heads')
  }

  return (
    <section style={{ justifyContent: 'center', display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div className="card" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
        <div style={{ fontSize: '3rem' }}>✅</div>
        <h1>Entry recorded</h1>
        <div className="hint">
          PKR {draft.amount} at “{draft.headPath[draft.headPath.length - 1]?.head_name}”
        </div>
      </div>
      <button className="block" onClick={done}>
        Make another entry
      </button>
    </section>
  )
}
