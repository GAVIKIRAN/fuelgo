import { useState } from 'react'
import toast from 'react-hot-toast'
import { Badge, EmptyState, ErrorState, Field, Loading, Modal, PageHeader, Pagination } from '../../components/ui'
import { adminApi } from '../../api'
import { errorMessage } from '../../api/client'
import { useAsync } from '../../hooks/useAsync'
import { dateTime, money } from '../../utils/format'

const TONES = { SUCCESS: 'green', PENDING: 'amber', FAILED: 'red', REFUNDED: 'blue' }

export default function AdminPayments() {
  const [filters, setFilters] = useState({ status: '', method: '', refund_requested: '', page: 1 })
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ refund_requested: false, refund_note: '', mark_refunded: false })
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''))
  const list = useAsync(() => adminApi.payments({ ...params, per_page: 15 }), [JSON.stringify(params)])
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value, page: 1 })

  const open = (p) => {
    setEditing(p)
    setForm({ refund_requested: p.refund_requested, refund_note: p.refund_note || '', mark_refunded: false })
  }

  const save = async () => {
    try {
      await adminApi.refund(editing.id, form)
      toast.success('Payment updated')
      setEditing(null)
      list.reload({ silent: true })
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div>
      <PageHeader title="Payments" subtitle="All transactions, failures and refunds" />
      <div className="filters">
        <select value={filters.status} onChange={set('status')} aria-label="Status">
          <option value="">Any status</option>
          {Object.keys(TONES).map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={filters.method} onChange={set('method')} aria-label="Method">
          <option value="">Any method</option>
          <option>UPI</option><option>CARD</option><option>CASH</option>
        </select>
        <select value={filters.refund_requested} onChange={set('refund_requested')} aria-label="Refund">
          <option value="">All</option>
          <option value="true">Refund flagged</option>
        </select>
      </div>
      {list.loading ? <Loading /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : list.data.items.length === 0 ? <EmptyState icon="card" title="No payments match" /> : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Transaction</th><th>Request</th><th>Customer</th><th>Method</th><th>Amount</th><th>Status</th><th>Refund</th><th>Date</th><th /></tr></thead>
              <tbody>
                {list.data.items.map((p) => (
                  <tr key={p.id}>
                    <td><code>{p.transaction_id}</code>{p.failure_reason && <div className="small" style={{ color: 'var(--danger)' }}>{p.failure_reason}</div>}</td>
                    <td>#{p.request_id}</td>
                    <td>{p.customer_name}</td>
                    <td>{p.method}</td>
                    <td><strong>{money(p.amount)}</strong></td>
                    <td><Badge tone={TONES[p.status]}>{p.status}</Badge></td>
                    <td>{p.refund_requested ? <Badge tone="amber">Flagged</Badge> : '—'}</td>
                    <td>{dateTime(p.paid_at || p.created_at)}</td>
                    <td><div className="actions"><button className="btn btn-ghost btn-sm" onClick={() => open(p)}>Manage</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination pagination={list.data.pagination} onPage={(page) => setFilters({ ...filters, page })} />
        </>
      )}
      <Modal open={Boolean(editing)} title={`Payment ${editing?.transaction_id || ''}`} onClose={() => setEditing(null)}
        footer={<><button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
        <p className="muted">{money(editing?.amount)} · {editing?.method} · {editing?.status}</p>
        <label className="checkbox"><input type="checkbox" checked={form.refund_requested} onChange={(e) => setForm({ ...form, refund_requested: e.target.checked })} /> Flag for refund</label>
        <Field label="Refund note">{(id) => <textarea id={id} value={form.refund_note} onChange={(e) => setForm({ ...form, refund_note: e.target.value })} maxLength={255} />}</Field>
        {editing?.status === 'SUCCESS' && (
          <label className="checkbox"><input type="checkbox" checked={form.mark_refunded} onChange={(e) => setForm({ ...form, mark_refunded: e.target.checked, refund_requested: e.target.checked || form.refund_requested })} /> Mark as refunded (processes the refund)</label>
        )}
      </Modal>
    </div>
  )
}
