import { describe, expect, it } from 'vitest'
import { NEXT_STATUS, STATUS_LABELS, directionsUrl, hourLabel, km, money, serviceTitle } from '../utils/format'

describe('format utils', () => {
  it('formats rupees', () => {
    expect(money(1234.5)).toContain('1,234.5')
    expect(money(1234.5)).toContain('₹')
    expect(money(null)).toBe('—')
  })

  it('formats distance and hours', () => {
    expect(km(2.345)).toBe('2.3 km')
    expect(km(undefined)).toBe('—')
    expect(hourLabel(0)).toBe('12am')
    expect(hourLabel(13)).toBe('1pm')
    expect(hourLabel(12)).toBe('12pm')
  })

  it('builds service titles', () => {
    expect(serviceTitle({ service_type: 'fuel', fuel_type: 'diesel', quantity_litres: 10 })).toBe('Diesel delivery · 10 L')
    expect(serviceTitle({ service_type: 'mechanic', problem_category: 'flat_tyre' })).toBe('Flat tyre')
  })

  it('has a label for every status and a linear provider flow', () => {
    for (const s of ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED']) {
      expect(STATUS_LABELS[s]).toBeTruthy()
    }
    expect(NEXT_STATUS.ACCEPTED.status).toBe('EN_ROUTE')
    expect(NEXT_STATUS.IN_PROGRESS.status).toBe('COMPLETED')
    expect(NEXT_STATUS.COMPLETED).toBeUndefined()
  })

  it('builds a directions link', () => {
    expect(directionsUrl(12.3, 76.6)).toContain('destination=12.3,76.6')
  })
})
