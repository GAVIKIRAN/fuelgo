import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import Icon from '../../components/Icon'
import { Badge, Field, Loading, PageHeader, Spinner } from '../../components/ui'
import { openProtectedFile, providerApi } from '../../api'
import { errorMessage } from '../../api/client'
import { useAsync } from '../../hooks/useAsync'
import { VerificationBanner } from './ProviderDashboard'
import { dateTime } from '../../utils/format'

const DOC_TYPES = {
  driving_license: 'Driving licence',
  id_proof: 'ID proof (Aadhaar / PAN)',
  vehicle_rc: 'Vehicle RC',
  fuel_permit: 'Fuel transport permit (PESO)',
  trade_certificate: 'Mechanic trade certificate',
  other: 'Other',
}
const ZONES = ['Vijayanagar', 'Kuvempunagar', 'Gokulam', 'Jayalakshmipuram', 'Nazarbad', 'Saraswathipuram',
  'Hebbal', 'Bannimantap', 'Chamundipuram', 'Devaraja Mohalla']

export default function ProviderProfile() {
  const profile = useAsync(() => providerApi.profile(), [])
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [docType, setDocType] = useState('driving_license')
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    const p = profile.data
    if (p && !form) {
      setForm({ business_name: p.business_name, zone: p.zone || '', service_radius_km: p.service_radius_km,
        vehicle_info: p.vehicle_info || '', tools_info: p.tools_info || '', fuel_types: p.fuel_types })
    }
  }, [profile.data, form])

  if (profile.loading || !form) return <Loading />
  const p = profile.data
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const body = { ...form, service_radius_km: Number(form.service_radius_km) }
      if (p.provider_type !== 'fuel') delete body.fuel_types
      const updated = await providerApi.updateProfile(body)
      profile.setData(updated)
      toast.success('Profile saved')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const upload = async (e) => {
    e.preventDefault()
    if (!file) return toast.error('Choose a file to upload')
    if (file.size > 8 * 1024 * 1024) return toast.error('File must be under 8 MB')
    setUploading(true)
    try {
      await providerApi.uploadDocument(docType, file)
      toast.success('Document uploaded')
      setFile(null)
      e.target.reset()
      profile.reload({ silent: true })
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  const removeDoc = async (id) => {
    try {
      await providerApi.deleteDocument(id)
      profile.reload({ silent: true })
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const toggleFuel = (ft) => setForm({ ...form, fuel_types: form.fuel_types.includes(ft) ? form.fuel_types.filter((x) => x !== ft) : [...form.fuel_types, ft] })

  return (
    <div>
      <PageHeader title="Partner profile" subtitle={p.provider_type === 'fuel' ? 'Fuel delivery agent' : 'Mechanic'}
        actions={<Badge tone={p.is_verified ? 'green' : p.verification_status === 'PENDING' ? 'amber' : 'red'}>{p.verification_status}</Badge>} />
      <VerificationBanner profile={p} />
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <form className="card" onSubmit={save}>
          <h2>Business details</h2>
          <Field label="Business name">{(id) => <input id={id} value={form.business_name} onChange={set('business_name')} />}</Field>
          <div className="form-grid">
            <Field label="Service area">{(id) => <select id={id} value={form.zone} onChange={set('zone')}><option value="">—</option>{ZONES.map((z) => <option key={z}>{z}</option>)}</select>}</Field>
            <Field label="Radius (km)">{(id) => <input id={id} type="number" min={1} max={50} value={form.service_radius_km} onChange={set('service_radius_km')} />}</Field>
          </div>
          {p.provider_type === 'fuel' && (
            <Field label="Fuels carried">
              <div className="chips">
                {['petrol', 'diesel', 'cng'].map((ft) => <button type="button" key={ft} className={`chip ${form.fuel_types.includes(ft) ? 'active' : ''}`} onClick={() => toggleFuel(ft)}>{ft.toUpperCase()}</button>)}
              </div>
            </Field>
          )}
          <Field label="Vehicle details">{(id) => <input id={id} value={form.vehicle_info} onChange={set('vehicle_info')} />}</Field>
          <Field label="Tools / equipment">{(id) => <input id={id} value={form.tools_info} onChange={set('tools_info')} />}</Field>
          <button className="btn btn-primary" disabled={saving}>{saving ? <Spinner size={16} /> : 'Save'}</button>
        </form>

        <div className="card">
          <h2>Verification documents</h2>
          <p className="muted small">Upload clear scans or photos (PDF, JPG, PNG, WEBP, up to 8 MB). Only you and FuelGo admins can see them.</p>
          <form onSubmit={upload}>
            <div className="form-grid">
              <Field label="Document type">{(id) => <select id={id} value={docType} onChange={(e) => setDocType(e.target.value)}>{Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}</Field>
              <Field label="File">{(id) => <input id={id} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => setFile(e.target.files?.[0] || null)} />}</Field>
            </div>
            <button className="btn btn-secondary" disabled={uploading}>{uploading ? <Spinner size={16} /> : <><Icon name="upload" size={16} /> Upload</>}</button>
          </form>
          <hr className="divider" />
          {p.documents.length === 0 ? <p className="muted">No documents uploaded yet.</p> : (
            <div className="list">
              {p.documents.map((d) => (
                <div key={d.id} className="list-item">
                  <span className="li-icon"><Icon name="file" /></span>
                  <div className="li-main">
                    <div className="li-title">{DOC_TYPES[d.doc_type] || d.doc_type}</div>
                    <div className="li-sub">{d.original_name} · {dateTime(d.uploaded_at)}</div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => openProtectedFile(d.url).catch(() => toast.error('Could not open file'))}>View</button>
                  <button className="icon-btn" aria-label="Delete document" onClick={() => removeDoc(d.id)}><Icon name="trash" size={18} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
