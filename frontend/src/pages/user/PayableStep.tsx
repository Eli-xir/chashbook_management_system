import { useFlow } from '../UserFlow'

export default function PayableStep() {
  const { draft, setDraft, setStep } = useFlow()

  return (
    <section>
      <div className="topbar">
        <button className="secondary" onClick={() => setStep('voice')}>
          ← Back
        </button>
        <span className="title">Is this payable?</span>
      </div>

      <div className="toggle-row">
        <div>
          <div style={{ fontWeight: 700 }}>Is this payable?</div>
          <div className="hint">
            Turn on only if this entry is a payable {draft.payable ? '' : ''}amount.
            Leave it off for a normal entry.
          </div>
        </div>
        <div className="switch">
          <input
            type="checkbox"
            id="payable"
            checked={draft.payable}
            onChange={(e) => setDraft({ ...draft, payable: e.target.checked })}
          />
          <span className="slider" />
        </div>
      </div>

      <button className="block" onClick={() => setStep('review')}>
        Review
      </button>
    </section>
  )
}
