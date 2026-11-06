import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import Icon from '../../components/Icon'
import { EmptyState, Field, Loading, Modal, PageHeader, Spinner } from '../../components/ui'
import { authApi, vehicleApi } from '../../api'
import { errorMessage, fieldErrors } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useAsync } from '../../hooks/useAsync'
import { FUEL_LABELS } from '../../utils/format'

const EMPTY_VEHICLE = { make: '', model: '', registration_number: '', fuel_type: 'petrol', vehicle_type: 'car' }

export function validateVehicle(v) {
  const e = {}
  if (!v.make.trim()) e.make = 'Required'
  if (!v.model.trim()) e.model = 'Required'
  if (!/^[A-Z]{2}[ -]?[0-9]{1,2}[ -]?[A-Z]{0,3}[ -]?[0-9]{1,4}$/.test(v.registration_number.trim().toUpperCase())) e.registration_number = 'e.g. KA09AB1234'
  return e
}

function ProfileForm() {
  const { user, setUser } = useAuth()
  const [form, setForm] = useState({ name: user.name, phone: user.phone || '', address: user.address || '' })
  const [pw, setPw] = useState({ current_password: '', new_password: '' })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    try {
      const body = { name: form.name, phone: form.phone || null, address: form.address || null }
      if (pw.new_password) Object.assign(body, pw)
      setUser(await authApi.updateMe(body))
      setPw({ current_password: '', new_password: '' })
      toast.success('Profile saved')
    } catch (err) {
      setErrors(fieldErrors(err))
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card" onSubmit={save} noValidate>
      <h2>Profile</h2>
      <Field label="Name" error={errors.name}>{(id) => <input id={id} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
      <div className="form-grid">
        <Field label="Email">{(id) => <input id={id} value={user.email} disabled />}</Field>
        <Field label="Mobile" error={errors.phone}>{(id) => <input id={id} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" />}</Field>
      </div>
      <Field label="Home address" error={errors.address}>{(id) => <input id={id} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />}</Field>
      <hr className="divider" />
      <h3>Change password</h3>
      <div className="form-grid">
        <Field label="Current password" error={errors.current_password}>{(id) => <input id={id} type="password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} autoComplete="current-password" />}</Field>
        <Field label="New password" error={errors.new_password}>{(id) => <input id={id} type="password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} autoComplete="new-password" />}</Field>
      </div>
      <button className="btn btn-primary" disabled={busy}>{busy ? <Spinner size={16} /> : 'Save changes'}</button>
    </form>
  )
}

function Vehicles() {
  const list = useAsync(() => vehicleApi.list(), [])
  const [editing, setEditing] = useState(null) // null | 'new' | vehicle
  const [form, setForm] = useState(EMPTY_VEHICLE)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const open = (v) => {
    setEditing(v || 'new')
    setForm(v ? { make: v.make, model: v.model, registration_number: v.registration_number, fuel_type: v.fuel_type, vehicle_type: v.vehicle_type } : EMPTY_VEHICLE)
    setErrors({})
  }

  const save = async () => {
    const errs = validateVehicle(form)
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      if (editing === 'new') await vehicleApi.create(form)
      else await vehicleApi.update(editing.id, form)
      toast.success('Vehicle saved')
      setEditing(null)
      list.reload({ silent: true })
    } catch (err) {
      setErrors(fieldErrors(err))
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    try {
      await vehicleApi.remove(confirmDelete.id)
      toast.success('Vehicle removed')
      setConfirmDelete(null)
      list.reload({ silent: true })
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  return (
    <div className="card">
      <div className="card-head">
        <h2>My vehicles</h2>
        <button className="btn btn-primary btn-sm" onClick={() => open(null)}><Icon name="plus" size={16} /> Add vehicle</button>
      </div>
      {list.loading ? <Loading /> : list.data?.items.length ? (
        <div className="list">
          {list.data.items.map((v) => (
            <div key={v.id} className="list-item">
              <span className="li-icon"><Icon name="car" /></span>
              <div className="li-main">
                <div className="li-title">{v.make} {v.model}</div>
                <div className="li-sub">{v.registration_number} · {FUEL_LABELS[v.fuel_type]} · {v.vehicle_type}</div>
              </div>
              <button className="icon-btn" aria-label={`Edit ${v.model}`} onClick={() => open(v)}><Icon name="edit" size={18} /></button>
              <button className="icon-btn" aria-label={`Delete ${v.model}`} onClick={() => setConfirmDelete(v)}><Icon name="trash" size={18} /></button>
            </div>
          ))}
        </div>
      ) : <EmptyState icon="car" title="No vehicles yet" text="Add a vehicle to pre-fill fuel type and details." />}

      <Modal open={Boolean(editing)} title={editing === 'new' ? 'Add vehicle' : 'Edit vehicle'} onClose={() => setEditing(null)}
        footer={<><button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? <Spinner size={16} /> : 'Save'}</button></>}>
        <div className="form-grid">
          <Field label="Make" error={errors.make}>{(id) => <input id={id} value={form.make} onChange={set('make')} placeholder="Maruti Suzuki" />}</Field>
          <Field label="Model" error={errors.model}>{(id) => <input id={id} value={form.model} onChange={set('model')} placeholder="Swift" />}</Field>
        </div>
        <Field label="Registration number" error={errors.registration_number}>{(id) => <input id={id} value={form.registration_number} onChange={(e) => setForm({ ...form, registration_number: e.target.value.toUpperCase() })} placeholder="KA09AB1234" />}</Field>
        <div className="form-grid">
          <Field label="Fuel type" error={errors.fuel_type}>
            {(id) => <select id={id} value={form.fuel_type} onChange={set('fuel_type')}>{Object.entries(FUEL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
          </Field>
          <Field label="Vehicle type">
            {(id) => <select id={id} value={form.vehicle_type} onChange={set('vehicle_type')}>{['car', 'bike', 'scooter', 'auto', 'van', 'truck'].map((t) => <option key={t}>{t}</option>)}</select>}
          </Field>
        </div>
      </Modal>
      <Modal open={Boolean(confirmDelete)} title="Remove vehicle?" onClose={() => setConfirmDelete(null)}
        footer={<><button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Keep</button><button className="btn btn-danger" onClick={remove}>Remove</button></>}>
        <p>{confirmDelete?.make} {confirmDelete?.model} ({confirmDelete?.registration_number}) will be removed from your account.</p>
      </Modal>
    </div>
  )
}

export default function Profile() {
  const [params] = useSearchParams()
  return (
    <div>
      <PageHeader title="Profile & vehicles" />
      {params.get('welcome') && <div className="alert alert-success">Welcome to FuelGo! Add your vehicle below to get help faster.</div>}
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <ProfileForm />
        <Vehicles />
      </div>
    </div>
  )
}
