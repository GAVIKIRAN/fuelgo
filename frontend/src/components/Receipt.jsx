import Icon from './Icon'
import { PriceBreakdown } from './ui'
import { dateTime, money, serviceTitle } from '../utils/format'

export default function Receipt({ receipt }) {
  const { payment, request, customer, provider } = receipt
  const ok = payment.status === 'SUCCESS' || payment.status === 'REFUNDED'
  return (
    <div className="receipt">
      <div className={`success-mark ${ok ? '' : 'fail-mark'}`}><Icon name={ok ? 'check' : 'x'} size={30} strokeWidth={3} /></div>
      <div className="receipt-amount">{money(payment.amount)}</div>
      <p className="muted" style={{ textAlign: 'center' }}>
        {payment.status === 'REFUNDED' ? 'Refunded' : ok ? 'Payment successful' : 'Payment failed'} · {receipt.receipt_number}
      </p>
      <div className="receipt-row"><span>Transaction ID</span><span><code>{payment.transaction_id}</code></span></div>
      {payment.gateway_reference && <div className="receipt-row"><span>Reference</span><span><code>{payment.gateway_reference}</code></span></div>}
      <div className="receipt-row"><span>Method</span><span>{payment.method}</span></div>
      <div className="receipt-row"><span>Paid at</span><span>{dateTime(payment.paid_at)}</span></div>
      <div className="receipt-row"><span>Service</span><span>{serviceTitle(request)} (#{request.id})</span></div>
      <div className="receipt-row"><span>Provider</span><span>{provider.name}</span></div>
      <div className="receipt-row"><span>Customer</span><span>{customer.name}</span></div>
      {request.price_breakdown && (
        <div style={{ marginTop: 12 }}>
          <PriceBreakdown breakdown={request.price_breakdown} finalPrice={request.final_price} />
        </div>
      )}
      <p className="muted small" style={{ textAlign: 'center', marginTop: 14 }}>{receipt.issued_by}</p>
    </div>
  )
}
