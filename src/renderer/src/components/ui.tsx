import { X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export const cx = (...parts: Array<string | false | null | undefined>): string => parts.filter(Boolean).join(' ')

const isMac = navigator.platform.toLowerCase().includes('mac')

/** Renders an accelerator such as "Mod+Shift+S" with platform glyphs. */
export function Kbd({ keys }: { keys: string }): ReactNode {
  const label = keys
    .split('+')
    .map((k) => (k === 'Mod' ? (isMac ? '⌘' : 'Ctrl') : k === 'Shift' ? (isMac ? '⇧' : 'Shift') : k === 'Alt' ? (isMac ? '⌥' : 'Alt') : k))
    .join(isMac ? '' : '+')
  return <kbd className="kbd">{label}</kbd>
}

interface IconButtonProps {
  title: string
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
  active?: boolean
  disabled?: boolean
  danger?: boolean
  size?: 'sm' | 'md'
  children: ReactNode
  className?: string
  badge?: ReactNode
}

export function IconButton({ title, onClick, active, disabled, danger, size = 'md', children, className, badge }: IconButtonProps): ReactNode {
  return (
    <button
      type="button"
      className={cx('icon-btn', size === 'sm' && 'sm', active && 'active', danger && 'danger', className)}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
      {badge ? <span className="icon-badge">{badge}</span> : null}
    </button>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label?: string }): ReactNode {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={cx('toggle', checked && 'on')} onClick={() => onChange(!checked)}>
      <span />
    </button>
  )
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  size
}: {
  value: T
  options: Array<{ value: T; label: ReactNode; title?: string }>
  onChange: (value: T) => void
  size?: 'sm'
}): ReactNode {
  return (
    <div className={cx('segmented', size)} role="radiogroup">
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value} title={o.title} className={cx(o.value === value && 'on')} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** A labelled settings row: text on the left, control on the right. */
export function Row({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }): ReactNode {
  return (
    <div className="row">
      <div className="row-text">
        <div className="row-label">{label}</div>
        {hint ? <div className="row-hint">{hint}</div> : null}
      </div>
      <div className="row-control">{children}</div>
    </div>
  )
}

interface PopoverProps {
  anchor: HTMLElement | null
  onClose: () => void
  children: ReactNode
  align?: 'start' | 'end' | 'center'
  width?: number
  className?: string
}

export function Popover({ anchor, onClose, children, align = 'start', width, className }: PopoverProps): ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' })

  useLayoutEffect(() => {
    if (!anchor || !ref.current) return
    const a = anchor.getBoundingClientRect()
    const p = ref.current.getBoundingClientRect()
    let left = align === 'end' ? a.right - p.width : align === 'center' ? a.left + a.width / 2 - p.width / 2 : a.left
    left = Math.max(8, Math.min(left, window.innerWidth - p.width - 8))
    const below = a.bottom + 6
    const top = below + p.height > window.innerHeight - 8 ? Math.max(8, a.top - p.height - 6) : below
    setStyle({ left, top, visibility: 'visible' })
  }, [anchor, align, children])

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      const target = e.target as Node
      if (ref.current?.contains(target) || anchor?.contains(target)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    // Clicking into a device pane never reaches this document; the window just loses focus.
    const onBlur = (): void => {
      if (document.activeElement?.tagName === 'WEBVIEW') onClose()
    }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onBlur)
    }
  }, [anchor, onClose])

  if (!anchor) return null
  return createPortal(
    <div ref={ref} className={cx('popover', className)} style={{ ...style, width }} role="dialog">
      {children}
    </div>,
    document.body
  )
}

/** A button that owns a popover. `content` receives a close callback. */
export function PopoverButton({
  title,
  icon,
  label,
  active,
  badge,
  align,
  width,
  className,
  content
}: {
  title: string
  icon: ReactNode
  label?: ReactNode
  active?: boolean
  badge?: ReactNode
  align?: 'start' | 'end' | 'center'
  width?: number
  className?: string
  content: (close: () => void) => ReactNode
}): ReactNode {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const close = (): void => setAnchor(null)
  return (
    <>
      <button
        type="button"
        title={title}
        aria-label={title}
        aria-expanded={!!anchor}
        className={cx(label ? 'tool-btn' : 'icon-btn', (active || anchor) && 'active', className)}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
      >
        {icon}
        {label ? <span>{label}</span> : null}
        {badge ? <span className="icon-badge">{badge}</span> : null}
      </button>
      {anchor ? (
        <Popover anchor={anchor} onClose={close} align={align} width={width}>
          {content(close)}
        </Popover>
      ) : null}
    </>
  )
}

export function Modal({ title, onClose, children, width = 720, footer, flush }: { title: ReactNode; onClose: () => void; children: ReactNode; width?: number; footer?: ReactNode; flush?: boolean }): ReactNode {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width }} role="dialog" aria-modal="true">
        <header className="modal-head">
          <h2>{title}</h2>
          <IconButton title="Close" onClick={onClose} size="sm">
            <X size={15} />
          </IconButton>
        </header>
        <div className={cx('modal-body', flush && 'flush')}>{children}</div>
        {footer ? <footer className="modal-foot">{footer}</footer> : null}
      </div>
    </div>,
    document.body
  )
}

export function MenuItem({
  icon,
  label,
  hint,
  checked,
  danger,
  disabled,
  onClick
}: {
  icon?: ReactNode
  label: ReactNode
  hint?: ReactNode
  checked?: boolean
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}): ReactNode {
  return (
    <button type="button" className={cx('menu-item', danger && 'danger', checked && 'checked')} disabled={disabled} onClick={onClick} role="menuitem">
      <span className="menu-icon">{icon}</span>
      <span className="menu-label">{label}</span>
      {hint ? <span className="menu-hint">{hint}</span> : null}
      {checked !== undefined ? <span className={cx('menu-check', checked && 'on')} /> : null}
    </button>
  )
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }): ReactNode {
  return (
    <div className="empty">
      {icon}
      <strong>{title}</strong>
      {children ? <p>{children}</p> : null}
    </div>
  )
}

export const Sev = ({ level }: { level: 'error' | 'warn' | 'info' | 'ok' }): ReactNode => <span className={cx('sev', level)} aria-label={level} />
