import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AnomalyCard } from '@/components/agent/chat/AnomalyCard'
import type { AnomalyItem } from '@/types/agent'

// Render agent copy synchronously (bypass the typing-animation queue).
jest.mock('@/components/agent/chat/AgentMessageBoardText', () => ({
  AgentMessageBoardText: ({ target }: { target: string }) => <span>{target}</span>,
}))

function anomaly(overrides: Partial<AnomalyItem> = {}): AnomalyItem {
  return {
    id: 'anom_0',
    metric: 'ROAS',
    movement: 'SHARP_DECREASE',
    severity: 'critical',
    current_value: 1,
    previous_value: 2,
    change_percent: -50,
    description: 'ROAS dropped',
    ...overrides,
  }
}

describe('AnomalyCard — interactive review', () => {
  it('renders an include checkbox and severity select per anomaly', () => {
    render(<AnomalyCard anomalies={[anomaly()]} onConfirm={jest.fn()} />)
    expect(screen.getByLabelText(/include ROAS/i)).toBeChecked()
    expect(screen.getByLabelText(/severity for ROAS/i)).toBeInTheDocument()
  })

  it('excluding an anomaly mutes its row (line-through title)', () => {
    render(<AnomalyCard anomalies={[anomaly()]} onConfirm={jest.fn()} />)
    const checkbox = screen.getByLabelText(/include ROAS/i)
    fireEvent.click(checkbox)
    expect(checkbox).not.toBeChecked()
    // The title wrapper carries the line-through class when excluded.
    expect(screen.getByText('ROAS').closest('.line-through')).toBeInTheDocument()
  })

  it('changing severity moves a row between Alerts and Signals', () => {
    render(<AnomalyCard anomalies={[anomaly()]} onConfirm={jest.fn()} />)
    // Starts as critical -> in Alerts section.
    expect(screen.getByText(/Alerts \(1\)/)).toBeInTheDocument()
    expect(screen.queryByText(/Signals \(/)).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/severity for ROAS/i), { target: { value: 'info' } })
    expect(screen.getByText(/Signals \(1\)/)).toBeInTheDocument()
    expect(screen.queryByText(/Alerts \(/)).not.toBeInTheDocument()
  })

  it('Confirm sends every anomaly exactly once with edits applied', () => {
    const onConfirm = jest.fn()
    render(
      <AnomalyCard
        anomalies={[anomaly({ id: 'anom_0' }), anomaly({ id: 'anom_1', metric: 'CPA', severity: 'info' })]}
        onConfirm={onConfirm}
      />
    )
    // Exclude the first one.
    fireEvent.click(screen.getByLabelText(/include ROAS/i))
    fireEvent.click(screen.getByRole('button', { name: /confirm anomalies/i }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    const payload = onConfirm.mock.calls[0][0]
    expect(payload).toHaveLength(2)
    expect(payload.map((p: any) => p.id).sort()).toEqual(['anom_0', 'anom_1'])
    const first = payload.find((p: any) => p.id === 'anom_0')
    expect(first.included).toBe(false)
  })

  it('locks controls read-only once confirmed', () => {
    render(<AnomalyCard anomalies={[anomaly()]} confirmed onConfirm={jest.fn()} />)
    expect(screen.getByText(/review locked/i)).toBeInTheDocument()
    // Checkbox remains visible but disabled; severity select is replaced by a label.
    expect(screen.getByLabelText(/include ROAS/i)).toBeDisabled()
    expect(screen.queryByLabelText(/severity for ROAS/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /confirm anomalies/i })).not.toBeInTheDocument()
  })

  it('shows the pre-confirm lock warning', () => {
    render(<AnomalyCard anomalies={[anomaly()]} onConfirm={jest.fn()} />)
    expect(screen.getByText(/once confirmed, this review is locked/i)).toBeInTheDocument()
  })
})
