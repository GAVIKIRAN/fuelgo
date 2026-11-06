import { useState } from 'react'
import toast from 'react-hot-toast'
import { Badge, EmptyState, ErrorState, Loading, Modal, PageHeader, Pagination } from '../../components/ui'
import { adminApi } from '../../api'
import { errorMessage } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useAsync } from '../../hooks/useAsync'
import { shortDate } from '../../utils/format'

export default function AdminUsers() {
  const { user: me } = useAuth()
  const [filters, setFilters] = useState({ role: '', q: '', page: 1 })
  const [query, setQuery] = useState('')
  const [confirm, setConfirm] = useState(null)
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''))
  const list = useAsync(() => adminApi.users({ ...params, per_page: 15 }), [JSON.stringify(params)])

  const toggle = async (u) => {
    try {
      await adminApi.setUserActive(u.id, !u.is_active)
      toast.success(u.is_active ? `${u.name} blocked` : `${u.name} unblocked`)
      list.reload({ silent: true })
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const remove = async () => {
    try {
      await adminApi.deleteUser(confirm.id)
      toast.success('User deleted')
      setConfirm(null)
      list.reload({ silent: true })
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div>
      <PageHeader title="Users" subtitle="View, block or remove accounts" />
      <form className="filters" onSubmit={(e) => { e.preventDefault(); setFilters({ ...filters, q: query, page: 1 }) }}>
        <input className="input" placeholder="Search name, email or phone" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value, page: 1 })} aria-label="Role">
          <option value="">All roles</option>
          <option value="user">Vehicle owners</option>
          <option value="provider">Providers</option>
          <option value="admin">Admins</option>
        </select>
        <button className="btn btn-secondary btn-sm">Search</button>
      </form>
      {list.loading ? <Loading /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : list.data.items.length === 0 ? <EmptyState icon="users" title="No users found" /> : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Status</th><th>Joined</th><th /></tr></thead>
              <tbody>
                {list.data.items.map((u) => (
                  <tr key={u.id}>
                    <td><strong>{u.name}</strong></td>
                    <td>{u.email}</td>
                    <td>{u.phone || '—'}</td>
                    <td><Badge tone={u.role === 'admin' ? 'blue' : u.role === 'provider' ? 'amber' : 'neutral'}>{u.role}</Badge></td>
                    <td><Badge tone={u.is_active ? 'green' : 'red'}>{u.is_active ? 'Active' : 'Blocked'}</Badge></td>
                    <td>{shortDate(u.created_at)}</td>
                    <td>
                      {u.id !== me.id && u.role !== 'admin' && (
                        <div className="actions">
                          <button className={`btn btn-sm ${u.is_active ? 'btn-danger-outline' : 'btn-secondary'}`} onClick={() => toggle(u)}>{u.is_active ? 'Block' : 'Unblock'}</button>
                          <button className="btn btn-sm btn-ghost" onClick={() => setConfirm(u)}>Delete</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination pagination={list.data.pagination} onPage={(page) => setFilters({ ...filters, page })} />
        </>
      )}
      <Modal open={Boolean(confirm)} title="Delete user?" onClose={() => setConfirm(null)}
        footer={<><button className="btn btn-ghost" onClick={() => setConfirm(null)}>Cancel</button><button className="btn btn-danger" onClick={remove}>Delete permanently</button></>}>
        <p>This permanently deletes <strong>{confirm?.name}</strong> ({confirm?.email}) and their vehicles and history. Consider blocking instead.</p>
      </Modal>
    </div>
  )
}
