import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import Icon from '../../components/Icon'
import Receipt from '../../components/Receipt'
import { ErrorState, Field, Loading, PageHeader, PriceBreakdown, Segmented, Spinner } from '../../components/ui'
import { paymentApi } from '../../api'
import { errorMessage, fieldErrors } from '../../api/client'
import { useLiveRequest } from '../../hooks/useLiveRequest'
import { money, serviceTitle } from '../../utils/format'

function loadRazorpay() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve(window.Razorpay)
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = () => resolve(window.Razorpay)
    s.onerror = () => reject(new Error('Could not load Razorpay Checkout'))
    document.body.appendChild(s)
  })
}

const formatCard = (v) => v.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim()
const formatExpiry = (v) => {
  const d = v.replace(/\D/g, '').slice(0, 4)
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d
}

export default function Payment() {
  const { id } = useParams()
  const { request, loading, error, reload } = useLiveRequest(id)
  const [config, setConfig] = useState(null)
  const [method, setMethod] = useState('UPI')
  const [upi, setUpi] = useState('')
  const [card, setCard] = useState({ number: '', expiry: '', cvv: '' })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)
  const [receipt, setReceipt] = useState(null)
  const [cashPending, setCashPending] = useState(false)

  useEffect(() => {
    paymentApi.config().then(setConfig).catch(() => setConfig({ gateway: 'mock', methods: ['UPI', 'CARD', 'CASH'] }))
  }, [])

  // Show the receipt once the request is paid (also catches provider-confirmed cash)
  useEffect(() => {
    if (!request) return
    const paid = request.payments?.find((p) => p.status === 'SUCCESS' || p.status === 'REFUNDED')
    if (paid && !receipt) paymentApi.receipt(paid.id).then(setReceipt).catch(() => {})
    const pendingCash = request.payments?.find((p) => p.status === 'PENDING' && p.method === 'CASH')
    if (pendingCash && !paid) setCashPending(true)
  }, [request, receipt])

  if (loading) return <Loading />
  if (error && !request) return <ErrorState message={error} onRetry={reload} />
  if (!request) return null

  const amount = request.final_price ?? request.estimated_price

  if (receipt) {
    return (
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <div className="card"><Receipt receipt={receipt} /></div>
        <div className="btn-row no-print" style={{ marginTop: 16, justifyContent: 'center' }}>
          <button className="btn btn-secondary" onClick={() => window.print()}><Icon name="printer" size={18} /> Print receipt</button>
          {!request.has_feedback && <Link className="btn btn-primary" to={`/app/requests/${id}/rate`}><Icon name="star" size={18} /> Rate service</Link>}
          <Link className="btn btn-ghost" to="/app">Home</Link>
        </div>
      </div>
    )
  }

  if (request.status !== 'COMPLETED') {
    return (
      <div className="card">
        <p>Payment opens once the service is completed. Current status: <strong>{request.status}</strong>.</p>
        <Link to={`/app/requests/${id}`} className="btn btn-secondary">Back to tracking</Link>
      </div>
    )
  }

  const validate = () => {
    const e = {}
    if (method === 'UPI' && config?.gateway !== 'razorpay' && !/^[\w.-]{2,64}@[A-Za-z]{2,32}$/.test(upi.trim())) e.upi_id = 'Enter a valid UPI ID, e.g. name@okaxis'
    if (method === 'CARD' && config?.gateway !== 'razorpay') {
      const n = card.number.replace(/\s/g, '')
      if (!/^\d{12,19}$/.test(n)) e.card_number = 'Enter a valid card number'
      if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(card.expiry)) e.card_expiry = 'Use MM/YY'
      if (!/^\d{3,4}$/.test(card.cvv)) e.card_cvv = '3 or 4 digits'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleDone = async (payment) => {
    toast.success('Payment successful')
    setReceipt(await paymentApi.receipt(payment.id))
    reload()
  }

  const handleFail = (err) => {
    const e = err.response?.data?.error
    if (err.response?.status === 402) setFailure(e.message)
    else {
      setErrors(fieldErrors(err))
      toast.error(errorMessage(err))
    }
  }

  const pay = async () => {
    if (!validate()) return
    setBusy(true)
    setFailure(null)
    try {
      const { payment, checkout } = await paymentApi.initiate({ request_id: Number(id), method })
      if (method === 'CASH') {
        setCashPending(true)
        toast.success('Hand the cash to your provider. They will confirm it in the app.')
        return
      }
      if (checkout.gateway === 'razorpay') {
        const Razorpay = await loadRazorpay()
        await new Promise((resolve) => {
          const rz = new Razorpay({
            key: checkout.key_id, order_id: checkout.order_id, amount: Math.round(payment.amount * 100), currency: 'INR',
            name: 'FuelGo', description: `Request #${id}`,
            handler: async (resp) => {
              try {
                await handleDone(await paymentApi.confirm(payment.id, { gateway_payment_id: resp.razorpay_payment_id, gateway_signature: resp.razorpay_signature }))
              } catch (err) {
                handleFail(err)
              }
              resolve()
            },
            modal: { ondismiss: resolve },
          })
          rz.open()
        })
        return
      }
      const details = method === 'UPI'
        ? { upi_id: upi.trim() }
        : { card_number: card.number.replace(/\s/g, ''), card_expiry: card.expiry, card_cvv: card.cvv }
      await handleDone(await paymentApi.confirm(payment.id, details))
    } catch (err) {
      handleFail(err)
    } finally {
      setBusy(false)
    }
  }

  const hints = config?.test_hints
  return (
    <div>
      <PageHeader title="Payment" subtitle={`Request #${id} · ${serviceTitle(request)}`} />
      <div className="split">
        <div className="card">
          <div className="row-between" style={{ marginBottom: 14 }}>
            <h3 style={{ margin: 0 }}>Amount due</h3>
            <span style={{ fontSize: '1.6rem', fontWeight: 800 }}>{money(amount)}</span>
          </div>

          {failure && (
            <div className="alert alert-error" role="alert">
              <Icon name="alert" size={18} />
              <div><strong>Payment failed.</strong> {failure} You haven't been charged. Check your details and try again, or pick another method.</div>
            </div>
          )}

          {cashPending ? (
            <div className="state-block">
              <Spinner size={28} />
              <h3>Waiting for cash confirmation</h3>
              <p>Pay {money(amount)} in cash to {request.provider?.business_name}. This page updates automatically once they confirm.</p>
              <button className="btn btn-ghost btn-sm" onClick={() => setCashPending(false)}>Pay online instead</button>
            </div>
          ) : (
            <>
              <div className="pay-methods">
                <Segmented name="Payment method" value={method} onChange={(m) => { setMethod(m); setErrors({}); setFailure(null) }}
                  options={[{ value: 'UPI', label: 'UPI', icon: 'phone' }, { value: 'CARD', label: 'Card', icon: 'card' }, { value: 'CASH', label: 'Cash', icon: 'wallet' }]} />
              </div>

              {hints && method !== 'CASH' && (
                <div className="test-hints">
                  <strong>Sandbox mode.</strong> No real money moves.{' '}
                  {method === 'UPI'
                    ? <>Success: <code>{hints.upi_success}</code> · Decline: <code>{hints.upi_failure}</code></>
                    : <>Success: <code>{hints.card_success}</code> · Decline: <code>{hints.card_failure}</code>, any future expiry, any CVV</>}
                </div>
              )}

              {config?.gateway !== 'razorpay' && method === 'UPI' && (
                <Field label="UPI ID" error={errors.upi_id}>
                  {(fid) => <input id={fid} value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="yourname@okaxis" autoComplete="off" />}
                </Field>
              )}
              {config?.gateway !== 'razorpay' && method === 'CARD' && (
                <>
                  <Field label="Card number" error={errors.card_number}>
                    {(fid) => <input id={fid} inputMode="numeric" autoComplete="cc-number" value={card.number} onChange={(e) => setCard({ ...card, number: formatCard(e.target.value) })} placeholder="4111 1111 1111 1111" />}
                  </Field>
                  <div className="form-grid">
                    <Field label="Expiry" error={errors.card_expiry}>
                      {(fid) => <input id={fid} inputMode="numeric" autoComplete="cc-exp" value={card.expiry} onChange={(e) => setCard({ ...card, expiry: formatExpiry(e.target.value) })} placeholder="MM/YY" />}
                    </Field>
                    <Field label="CVV" error={errors.card_cvv}>
                      {(fid) => <input id={fid} inputMode="numeric" type="password" autoComplete="cc-csc" maxLength={4} value={card.cvv} onChange={(e) => setCard({ ...card, cvv: e.target.value.replace(/\D/g, '') })} />}
                    </Field>
                  </div>
                </>
              )}
              {method === 'CASH' && <p className="muted">Pay the provider in cash. They'll confirm receipt in their app and your receipt will appear here.</p>}

              <button className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={pay}>
                {busy ? <Spinner size={18} /> : method === 'CASH' ? 'Pay with cash' : failure ? `Retry ${money(amount)}` : `Pay ${money(amount)}`}
              </button>
            </>
          )}
        </div>
        <div className="card">
          <h3>Bill details</h3>
          <PriceBreakdown breakdown={request.price_breakdown} finalPrice={request.final_price} />
          <p className="muted small" style={{ marginTop: 12 }}>Provider: {request.provider?.business_name}</p>
        </div>
      </div>
    </div>
  )
}
