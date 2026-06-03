import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { ChatInput } from '@/components/agent/chat/ChatInput'

describe('ChatInput — context panel', () => {
  const mockSend = jest.fn()
  const mockUpload = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('does not show context textarea on mount', () => {
    render(<ChatInput onSend={mockSend} onFileUpload={mockUpload} />)
    expect(screen.queryByPlaceholderText(/context/i)).not.toBeInTheDocument()
  })

  it('shows context textarea after clicking the toggle', async () => {
    render(<ChatInput onSend={mockSend} onFileUpload={mockUpload} />)
    await userEvent.click(screen.getByRole('button', { name: /add analysis context/i }))
    expect(screen.getByPlaceholderText(/context/i)).toBeInTheDocument()
  })

  it('character counter absent when context is empty', async () => {
    render(<ChatInput onSend={mockSend} onFileUpload={mockUpload} />)
    await userEvent.click(screen.getByRole('button', { name: /add analysis context/i }))
    expect(screen.queryByText(/\/ 500/)).not.toBeInTheDocument()
  })

  it('shows counter once user types', async () => {
    render(<ChatInput onSend={mockSend} onFileUpload={mockUpload} />)
    await userEvent.click(screen.getByRole('button', { name: /add analysis context/i }))
    await userEvent.type(screen.getByPlaceholderText(/context/i), 'Hello')
    expect(screen.getByText('5 / 500')).toBeInTheDocument()
  })

  it('counter has orange class at 400 chars', async () => {
    render(<ChatInput onSend={mockSend} onFileUpload={mockUpload} />)
    await userEvent.click(screen.getByRole('button', { name: /add analysis context/i }))
    const textarea = screen.getByPlaceholderText(/context/i)
    fireEvent.change(textarea, { target: { value: 'a'.repeat(400) } })
    const counter = screen.getByText('400 / 500')
    expect(counter.className).toMatch(/orange/)
  })

  it('counter has red class at 500 chars', async () => {
    render(<ChatInput onSend={mockSend} onFileUpload={mockUpload} />)
    await userEvent.click(screen.getByRole('button', { name: /add analysis context/i }))
    const textarea = screen.getByPlaceholderText(/context/i)
    fireEvent.change(textarea, { target: { value: 'a'.repeat(500) } })
    const counter = screen.getByText('500 / 500')
    expect(counter.className).toMatch(/red/)
  })

  it('onSend called with message and context', async () => {
    render(<ChatInput onSend={mockSend} onFileUpload={mockUpload} />)
    await userEvent.click(screen.getByRole('button', { name: /add analysis context/i }))
    await userEvent.type(screen.getByPlaceholderText(/context/i), 'Focus on ROAS')
    await userEvent.type(screen.getByRole('textbox', { name: /message/i }), 'Analyze this')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(mockSend).toHaveBeenCalledWith('Analyze this', 'Focus on ROAS')
  })

  it('context clears after send', async () => {
    render(<ChatInput onSend={mockSend} onFileUpload={mockUpload} />)
    await userEvent.click(screen.getByRole('button', { name: /add analysis context/i }))
    const contextArea = screen.getByPlaceholderText(/context/i)
    await userEvent.type(contextArea, 'Some context')
    await userEvent.type(screen.getByRole('textbox', { name: /message/i }), 'hi')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(screen.queryByPlaceholderText(/context/i)).not.toBeInTheDocument()
  })

  it('onSend called with undefined context when panel closed', async () => {
    render(<ChatInput onSend={mockSend} onFileUpload={mockUpload} />)
    await userEvent.type(screen.getByRole('textbox', { name: /message/i }), 'hello')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(mockSend).toHaveBeenCalledWith('hello', undefined)
  })
})
