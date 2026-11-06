import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { EmptyState, Pagination, PriceBreakdown, StarRating, StatusBadge } from '../components/ui'
import StatusTimeline from '../components/StatusTimeline'

describe('StatusBadge', () => {
  it('shows a friendly label and status class', () => {
    render(<StatusBadge status="EN_ROUTE" />)
    expect(screen.getByText('On the way')).toHaveClass('status-en_route')
  })
})

describe('StarRating', () => {
  it('calls onChange with the clicked star', () => {
    const onChange = vi.fn()
    render(<StarRating value={2} onChange={onChange} />)
    fireEvent.click(screen.getByRole('radio', { name: '4 stars' }))
    expect(onChange).toHaveBeenCalledWith(4)
    expect(screen.getByRole('radio', { name: '2 stars' })).toHaveAttribute('aria-checked', 'true')
  })

  it('read-only mode exposes an accessible label', () => {
    render(<StarRating value={3.6} readOnly />)
    expect(screen.getByLabelText('3.6 out of 5 stars')).toBeInTheDocument()
  })
})

describe('PriceBreakdown', () => {
  const breakdown = {
    lines: [{ label: 'Petrol 5 L', amount: 514.25 }, { label: 'Delivery fee', amount: 49 }],
    total: 563.25,
  }

  it('lists every line and the total', () => {
    render(<PriceBreakdown breakdown={breakdown} />)
    expect(screen.getByText('Petrol 5 L')).toBeInTheDocument()
    expect(screen.getByText('Delivery fee')).toBeInTheDocument()
    expect(screen.getByText(/563\.25/)).toBeInTheDocument()
  })

  it('shows the final amount when it differs from the estimate', () => {
    render(<PriceBreakdown breakdown={breakdown} finalPrice={600} />)
    expect(screen.getByText('Final amount')).toBeInTheDocument()
  })
})

describe('Pagination', () => {
  it('hides for a single page and pages forward', () => {
    const { container, rerender } = render(<Pagination pagination={{ page: 1, pages: 1, total: 3 }} onPage={() => {}} />)
    expect(container).toBeEmptyDOMElement()
    const onPage = vi.fn()
    rerender(<Pagination pagination={{ page: 1, pages: 3, total: 30 }} onPage={onPage} />)
    expect(screen.getByRole('button', { name: /prev/i })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(onPage).toHaveBeenCalledWith(2)
  })
})

describe('StatusTimeline', () => {
  it('marks completed and current steps', () => {
    const request = {
      status: 'EN_ROUTE',
      history: [
        { status: 'PENDING', created_at: '2026-11-06T06:00:00Z' },
        { status: 'ACCEPTED', created_at: '2026-11-06T06:01:00Z' },
        { status: 'EN_ROUTE', created_at: '2026-11-06T06:02:00Z' },
      ],
    }
    const { container } = render(<StatusTimeline request={request} />)
    expect(container.querySelectorAll('li.done')).toHaveLength(2)
    expect(container.querySelector('li.current')).toHaveTextContent('On the way')
  })

  it('ends with the cancellation for cancelled requests', () => {
    const request = {
      status: 'CANCELLED',
      history: [
        { status: 'PENDING', created_at: '2026-11-06T06:00:00Z' },
        { status: 'CANCELLED', created_at: '2026-11-06T06:03:00Z' },
      ],
    }
    const { container } = render(<StatusTimeline request={request} />)
    const items = container.querySelectorAll('li')
    expect(items).toHaveLength(2)
    expect(items[1]).toHaveTextContent('Cancelled')
  })
})

describe('EmptyState', () => {
  it('renders title, text and action', () => {
    render(<EmptyState title="No requests" text="Nothing yet" action={<button>Go</button>} />)
    expect(screen.getByRole('heading', { name: 'No requests' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument()
  })
})
