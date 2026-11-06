import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ErrorState, Field, Loading, PageHeader, Spinner, StarRating } from '../../components/ui'
import { feedbackApi, requestApi } from '../../api'
import { errorMessage } from '../../api/client'
import { useAsync } from '../../hooks/useAsync'
import { serviceTitle } from '../../utils/format'

const LABELS = { 1: 'Very poor', 2: 'Poor', 3: 'Okay', 4: 'Good', 5: 'Excellent' }

export default function RateService() {
  const { id } = useParams()
  const navigate = useNavigate()
  const req = useAsync(() => requestApi.get(id), [id])
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [complain, setComplain] = useState(false)
  const [complaint, setComplaint] = useState({ subject: '', description: '' })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  if (req.loading) return <Loading />
  if (req.error) return <ErrorState message={req.error} onRetry={req.reload} />
  const r = req.data
  const canRate = r.status === 'COMPLETED' && !r.has_feedback

  const submit = async (e) => {
    e.preventDefault()
    const errs = {}
    if (canRate && !rating) errs.rating = 'Tap a star to rate'
    if (complain) {
      if (complaint.subject.trim().length < 3) errs.subject = 'Add a short subject'
      if (complaint.description.trim().length < 5) errs.description = 'Tell us what went wrong'
    }
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      if (canRate) await feedbackApi.submit({ request_id: r.id, rating, comment: comment || undefined })
      if (complain) await feedbackApi.complain({ request_id: r.id, ...complaint })
      toast.success(complain ? 'Thanks. We have registered your complaint.' : 'Thanks for your feedback!')
      navigate('/app/history')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <PageHeader title="Rate your service" subtitle={`${serviceTitle(r)} by ${r.provider?.business_name || 'provider'}`} />
      <form className="card" onSubmit={submit} noValidate>
        {canRate ? (
          <>
            <div style={{ textAlign: 'center' }}>
              <StarRating value={rating} onChange={setRating} size={38} />
              <p className="muted" style={{ minHeight: 24 }}>{LABELS[rating] || 'How was it?'}</p>
              {errors.rating && <p className="field-error">{errors.rating}</p>}
            </div>
            <Field label="Comments (optional)">
              {(fid) => <textarea id={fid} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What went well? What could be better?" />}
            </Field>
          </>
        ) : (
          <p className="muted">{r.has_feedback ? 'You have already rated this service.' : 'Rating opens after the service is completed.'}</p>
        )}

        <label className="checkbox">
          <input type="checkbox" checked={complain} onChange={(e) => setComplain(e.target.checked)} />
          I want to raise a complaint
        </label>
        {complain && (
          <div style={{ marginTop: 10 }}>
            <Field label="Subject" error={errors.subject}>
              {(fid) => <input id={fid} value={complaint.subject} onChange={(e) => setComplaint({ ...complaint, subject: e.target.value })} placeholder="e.g. Charged more than the estimate" />}
            </Field>
            <Field label="What happened?" error={errors.description}>
              {(fid) => <textarea id={fid} value={complaint.description} onChange={(e) => setComplaint({ ...complaint, description: e.target.value })} />}
            </Field>
          </div>
        )}
        <div className="btn-row" style={{ marginTop: 10 }}>
          <button className="btn btn-primary btn-lg" disabled={busy || (!canRate && !complain)}>{busy ? <Spinner size={18} /> : 'Submit'}</button>
          <Link className="btn btn-ghost" to={`/app/requests/${id}`}>Back</Link>
        </div>
      </form>
    </div>
  )
}
