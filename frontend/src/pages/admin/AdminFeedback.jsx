import { useState } from 'react'
import toast from 'react-hot-toast'
import { Badge, EmptyState, ErrorState, Field, Loading, Modal, PageHeader, Pagination, Segmented, StarRating } from '../../components/ui'
import { adminApi } from '../../api'
import { errorMessage } from '../../api/client'
import { useAsync } from '../../hooks/useAsync'
import { dateTime } from '../../utils/format'

function FeedbackList() {
  const [rating, setRating] = useState('')
  const [page, setPage] = useState(1)
  const list = useAsync(() => adminApi.feedback({ rating: rating || undefined, page, per_page: 15 }), [rating, page])
  return (
    <>
      <div className="filters">
        <select value={rating} onChange={(e) => { setRating(e.target.value); setPage(1) }} aria-label="Rating">
          <option value="">All ratings</option>
          {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r} star{r > 1 ? 's' : ''}</option>)}
        </select>
      </div>
      {list.loading ? <Loading /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : list.data.items.length === 0 ? <EmptyState icon="star" title="No feedback" /> : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Rating</th><th>Comment</th><th>Customer</th><th>Provider</th><th>Request</th><th>Date</th></tr></thead>
              <tbody>
                {list.data.items.map((f) => (
                  <tr key={f.id}>
                    <td><StarRating value={f.rating} readOnly size={14} /></td>
                    <td>{f.comment || <span className="muted">—</span>}</td>
                    <td>{f.customer_name}</td>
                    <td>{f.provider_name}</td>
                    <td>#{f.request_id}</td>
                    <td>{dateTime(f.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination pagination={list.data.pagination} onPage={setPage} />
        </>
      )}
    </>
  )
}

function ComplaintList() {
  const [status, setStatus] = useState('OPEN')
  const [page, setPage] = useState(1)
  const [resolving, setResolving] = useState(null)
  const [note, setNote] = useState('')
  const list = useAsync(() => adminApi.complaints({ status: status || undefined, page, per_page: 15 }), [status, page])

  const resolve = async () => {
    if (note.trim().length < 3) return toast.error('Add a resolution note')
    try {
      await adminApi.resolveComplaint(resolving.id, note.trim())
      toast.success('Complaint resolved')
      setResolving(null)
      setNote('')
      list.reload({ silent: true })
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <>
      <div className="filters">
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} aria-label="Status">
          <option value="OPEN">Open</option>
          <option value="RESOLVED">Resolved</option>
          <option value="">All</option>
        </select>
      </div>
      {list.loading ? <Loading /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : list.data.items.length === 0 ? <EmptyState icon="message" title="No complaints here" /> : (
        <>
          <div className="list">
            {list.data.items.map((c) => (
              <div key={c.id} className="card" style={{ marginTop: 0 }}>
                <div className="row-between">
                  <strong>{c.subject}</strong>
                  <Badge tone={c.status === 'OPEN' ? 'amber' : 'green'}>{c.status}</Badge>
                </div>
                <p className="small muted" style={{ margin: '4px 0 8px' }}>#{c.id} · Request #{c.request_id} · {c.customer_name} vs {c.provider_name || '—'} · {dateTime(c.created_at)}</p>
                <p style={{ margin: 0 }}>{c.description}</p>
                {c.resolution_note && <div className="alert alert-success" style={{ marginTop: 10, marginBottom: 0 }}><div><strong>Resolution:</strong> {c.resolution_note}</div></div>}
                {c.status === 'OPEN' && <button className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={() => setResolving(c)}>Resolve</button>}
              </div>
            ))}
          </div>
          <Pagination pagination={list.data.pagination} onPage={setPage} />
        </>
      )}
      <Modal open={Boolean(resolving)} title="Resolve complaint" onClose={() => setResolving(null)}
        footer={<><button className="btn btn-ghost" onClick={() => setResolving(null)}>Cancel</button><button className="btn btn-primary" onClick={resolve}>Mark resolved</button></>}>
        <p className="muted">{resolving?.subject}</p>
        <Field label="Resolution note (sent to the customer)">{(id) => <textarea id={id} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      </Modal>
    </>
  )
}

export default function AdminFeedback() {
  const [tab, setTab] = useState('complaints')
  return (
    <div>
      <PageHeader title="Feedback & complaints" />
      <div style={{ maxWidth: 360, marginBottom: 16 }}>
        <Segmented name="View" value={tab} onChange={setTab} options={[{ value: 'complaints', label: 'Complaints' }, { value: 'feedback', label: 'Ratings' }]} />
      </div>
      {tab === 'complaints' ? <ComplaintList /> : <FeedbackList />}
    </div>
  )
}
