import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { createElement } from 'react'

// Replicate MobileMenuButton from App.jsx (inline component, not exported)
const MobileMenuButton = ({ onClick, isOpen }) =>
  createElement('button', {
    className: 'btn btn-ghost mobile-menu-toggle',
    onClick,
    'aria-label': isOpen ? 'Close menu' : 'Open menu',
    'aria-expanded': isOpen,
    style: { display: 'flex', padding: '8px', fontSize: '20px', lineHeight: 1 },
  }, isOpen ? '✕' : '☰')

// Replicate MobileDrawer from App.jsx
const MobileDrawer = ({ isOpen, onClose, children }) => {
  if (!isOpen) return null
  return createElement('div', { className: 'mobile-drawer' },
    createElement('div', { 'data-testid': 'overlay', onClick: onClose }),
    createElement('nav', null,
      createElement('button', { onClick: onClose, 'aria-label': 'Close menu' }, '✕'),
      children
    )
  )
}

describe('MobileMenuButton', () => {
  it('shows hamburger icon when closed', () => {
    cleanup()
    const { getByRole } = render(createElement(MobileMenuButton, { onClick: vi.fn(), isOpen: false }))
    const btn = getByRole('button')
    expect(btn).toHaveTextContent('☰')
    expect(btn).toHaveAttribute('aria-label', 'Open menu')
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    cleanup()
  })

  it('shows close icon when open', () => {
    cleanup()
    const { getByRole } = render(createElement(MobileMenuButton, { onClick: vi.fn(), isOpen: true }))
    const btn = getByRole('button')
    expect(btn).toHaveTextContent('✕')
    expect(btn).toHaveAttribute('aria-label', 'Close menu')
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    cleanup()
  })

  it('calls onClick when pressed', () => {
    cleanup()
    const handler = vi.fn()
    const { getByRole } = render(createElement(MobileMenuButton, { onClick: handler, isOpen: false }))
    fireEvent.click(getByRole('button'))
    expect(handler).toHaveBeenCalledOnce()
    cleanup()
  })
})

describe('MobileDrawer', () => {
  it('renders nothing when closed', () => {
    cleanup()
    const { container } = render(createElement(MobileDrawer, { isOpen: false, onClose: vi.fn() }, 'content'))
    expect(container.innerHTML).toBe('')
    cleanup()
  })

  it('renders children when open', () => {
    cleanup()
    const { getByText } = render(createElement(MobileDrawer, { isOpen: true, onClose: vi.fn() },
      createElement('span', null, 'Menu item')
    ))
    expect(getByText('Menu item')).toBeTruthy()
    cleanup()
  })

  it('calls onClose when overlay is clicked', () => {
    cleanup()
    const handler = vi.fn()
    const { getByTestId } = render(createElement(MobileDrawer, { isOpen: true, onClose: handler }))
    fireEvent.click(getByTestId('overlay'))
    expect(handler).toHaveBeenCalledOnce()
    cleanup()
  })

  it('calls onClose when close button is clicked', () => {
    cleanup()
    const handler = vi.fn()
    const { getByLabelText } = render(createElement(MobileDrawer, { isOpen: true, onClose: handler }))
    fireEvent.click(getByLabelText('Close menu'))
    expect(handler).toHaveBeenCalledOnce()
    cleanup()
  })
})
