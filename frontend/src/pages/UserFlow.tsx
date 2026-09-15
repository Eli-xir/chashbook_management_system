import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import type { PaymentMedium } from '../types'
import HeadLevel from './user/HeadLevel'
import AmountStep from './user/AmountStep'
import ImageStep from './user/ImageStep'
import VoiceStep from './user/VoiceStep'
import PayableStep from './user/PayableStep'
import ReviewStep from './user/ReviewStep'
import SuccessStep from './user/SuccessStep'

export interface Draft {
  headId: number | null
  headPath: { head_id: number; head_name: string }[]
  amount: string
  mediumId: number | null
  imageId: number | null
  imageUrl: string | null
  voiceId: number | null
  voiceUrl: string | null
  payable: boolean
  submitted: boolean
}

export type Step = 'heads' | 'amount' | 'image' | 'voice' | 'payable' | 'review' | 'success'

interface UserFlowState {
  draft: Draft
  setDraft: (d: Draft) => void
  step: Step
  setStep: (s: Step) => void
  mediums: PaymentMedium[]
}

const emptyDraft: Draft = {
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
}

const FlowContext = createContext<UserFlowState | null>(null)

export function useFlow() {
  const ctx = useContext(FlowContext)
  if (!ctx) throw new Error('useFlow outside UserFlow')
  return ctx
}

/** Draft survives reloads (sessionStorage) and every Back navigation. */
function loadDraft(): Draft {
  try {
    const raw = sessionStorage.getItem('cashbook_draft')
    if (raw) return { ...emptyDraft, ...JSON.parse(raw) }
  } catch {
    /* ignore corrupt drafts */
  }
  return emptyDraft
}

export default function UserFlow() {
  const { me, signOut } = useAuth()
  const [draft, setDraftState] = useState<Draft>(loadDraft)
  const [step, setStep] = useState<Step>(draft.headId ? 'amount' : 'heads')
  const [mediums, setMediums] = useState<PaymentMedium[]>([])
  const navigate = useNavigate()
  const stepRef = useRef(step)
  stepRef.current = step

  useEffect(() => {
    api.get<PaymentMedium[]>('/transactions/mediums').then(setMediums).catch(() => setMediums([]))
  }, [])

  const setDraft = useCallback((d: Draft) => {
    setDraftState(d)
    // Blob URLs cannot be persisted; reload loses previews but keeps IDs.
    sessionStorage.setItem('cashbook_draft', JSON.stringify({ ...d, imageUrl: null, voiceUrl: null }))
  }, [])

  // Browser/hardware Back: return one wizard step, preserving the draft.
  useEffect(() => {
    const order: Step[] = ['heads', 'amount', 'image', 'voice', 'payable', 'review']
    function onPop() {
      const cur = stepRef.current
      const idx = order.indexOf(cur)
      if (idx > 0) setStep(order[idx - 1])
      else if (cur === 'success') setStep('heads')
    }
    window.history.pushState({ flow: true }, '')
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const setStepManaged = useCallback((s: Step) => {
    if (s !== stepRef.current) window.history.pushState({ flow: true }, '')
    setStep(s)
  }, [])

  async function doSignOut() {
    if (draft.headId && !draft.submitted && draft.amount) {
      const ok = window.confirm('You have an unfinished entry. Signing out will discard it. Continue?')
      if (!ok) return
    }
    await signOut()
    navigate('/login', { replace: true })
  }

  if (!me) return null

  return (
    <FlowContext.Provider value={{ draft, setDraft, step, setStep: setStepManaged, mediums }}>
      <main className="mobile-page">
        <div className="topbar">
          <span className="title">Cashbook</span>
          <button className="subtle" onClick={doSignOut}>
            Sign out
          </button>
        </div>
        {me.role === 'debit_user' && <div className="crumb">You record money out (debit).</div>}
        {me.role === 'credit_user' && <div className="crumb">You record money in (credit).</div>}
        <div className="grow">
          {step === 'heads' && <HeadLevel />}
          {step === 'amount' && <AmountStep />}
          {step === 'image' && <ImageStep />}
          {step === 'voice' && <VoiceStep />}
          {step === 'payable' && <PayableStep />}
          {step === 'review' && <ReviewStep />}
          {step === 'success' && <SuccessStep />}
        </div>
      </main>
    </FlowContext.Provider>
  )
}
