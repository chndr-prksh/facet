import { Columns2, FileText, Globe, Lock, Star, TriangleAlert, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import type { Tab } from '@shared/types'
import { displayUrl } from '@shared/urls'
import { navigate, setCompare } from '@/lib/views'
import { useWorkspace } from '@/store/workspace'
import { IconButton, cx } from './ui'

function SchemeIcon({ url }: { url: string }): ReactNode {
  if (url.startsWith('https://')) return <Lock size={12} />
  if (url.startsWith('file://')) return <FileText size={12} />
  if (/^http:\/\/(localhost|127\.|\[::1\])/.test(url)) return <Globe size={12} />
  if (url.startsWith('http://')) return <TriangleAlert size={12} className="warn" />
  return <Globe size={12} />
}

export function AddressBar({ tab }: { tab: Tab }): ReactNode {
  const bookmarks = useWorkspace((s) => s.bookmarks)
  const history = useWorkspace((s) => s.history)
  const [value, setValue] = useState(tab.url)
  const [focused, setFocused] = useState(false)
  const [cursor, setCursor] = useState(-1)
  const [comparing, setComparing] = useState(false)
  const [compareValue, setCompareValue] = useState(tab.compareUrl ?? '')
  const input = useRef<HTMLInputElement>(null)
  const compareInput = useRef<HTMLInputElement>(null)
  const bookmarked = bookmarks.some((b) => b.url === tab.url)

  // Follow the page as it navigates, unless the user is mid-edit.
  useEffect(() => {
    if (!focused) setValue(tab.url)
  }, [tab.url, tab.id, focused])
  useEffect(() => setCompareValue(tab.compareUrl ?? ''), [tab.compareUrl, tab.id])

  useEffect(() => {
    const focus = (): void => {
      input.current?.focus()
      input.current?.select()
    }
    const compare = (): void => {
      setComparing(true)
      setTimeout(() => compareInput.current?.focus(), 0)
    }
    window.addEventListener('facet:focus-url', focus)
    window.addEventListener('facet:compare', compare)
    return () => {
      window.removeEventListener('facet:focus-url', focus)
      window.removeEventListener('facet:compare', compare)
    }
  }, [])

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!focused || q === tab.url.toLowerCase()) return []
    const seen = new Set<string>()
    const pool = [...bookmarks.map((b) => ({ ...b, star: true })), ...history.map((h) => ({ ...h, star: false }))]
    return pool
      .filter((item) => {
        if (seen.has(item.url) || !(item.url.toLowerCase().includes(q) || item.title.toLowerCase().includes(q))) return false
        seen.add(item.url)
        return true
      })
      .slice(0, 7)
  }, [value, focused, bookmarks, history, tab.url])

  const go = (url: string): void => {
    navigate(tab.id, url)
    setCursor(-1)
    input.current?.blur()
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') go(cursor >= 0 && suggestions[cursor] ? suggestions[cursor].url : value)
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(c + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(c - 1, -1))
    } else if (e.key === 'Escape') {
      setValue(tab.url)
      input.current?.blur()
    }
  }

  return (
    <div className="address-wrap">
      <div className={cx('address', focused && 'focused')}>
        <span className="address-icon">
          <SchemeIcon url={tab.url} />
        </span>
        <input
          ref={input}
          value={focused ? value : displayUrl(value)}
          placeholder="Enter a URL, localhost:3000, or search"
          spellCheck={false}
          autoCapitalize="off"
          aria-label="Address"
          onChange={(e) => {
            setValue(e.target.value)
            setCursor(-1)
          }}
          onFocus={(e) => {
            // Swap in the full URL and select it in one step, so typing or
            // pasting straight after focusing always replaces it.
            flushSync(() => {
              setFocused(true)
              setValue(tab.url)
            })
            e.target.select()
          }}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
        />
        <IconButton size="sm" title={bookmarked ? 'Remove bookmark' : 'Bookmark this page'} active={bookmarked} disabled={!tab.url} onClick={() => useWorkspace.getState().toggleBookmark(tab.url, tab.title)}>
          <Star size={13} fill={bookmarked ? 'currentColor' : 'none'} />
        </IconButton>
        <IconButton
          size="sm"
          title={tab.compareUrl ? 'Stop comparing' : 'Compare with a second URL on every device'}
          active={!!tab.compareUrl || comparing}
          onClick={() => {
            if (tab.compareUrl) {
              setCompare(tab.id, null)
              setComparing(false)
            } else {
              setComparing((c) => !c)
              setTimeout(() => compareInput.current?.focus(), 0)
            }
          }}
        >
          <Columns2 size={13} />
        </IconButton>
        {suggestions.length > 0 ? (
          <div className="suggestions" role="listbox">
            {suggestions.map((s, i) => (
              <button key={s.url} type="button" role="option" aria-selected={i === cursor} className={cx(i === cursor && 'on')} onMouseDown={(e) => (e.preventDefault(), go(s.url))}>
                {s.star ? <Star size={12} fill="currentColor" /> : <Globe size={12} />}
                <span className="s-title">{s.title || displayUrl(s.url)}</span>
                <span className="s-url">{displayUrl(s.url)}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {comparing || tab.compareUrl ? (
        <div className="address compare">
          <span className="address-tag">B</span>
          <input
            ref={compareInput}
            value={compareValue}
            placeholder="Second URL, e.g. your production site"
            spellCheck={false}
            aria-label="Comparison address"
            onChange={(e) => setCompareValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && compareValue.trim()) {
                setCompare(tab.id, compareValue)
                e.currentTarget.blur()
              } else if (e.key === 'Escape') setComparing(false)
            }}
          />
          <IconButton
            size="sm"
            title="Stop comparing"
            onClick={() => {
              setCompare(tab.id, null)
              setComparing(false)
            }}
          >
            <X size={13} />
          </IconButton>
        </div>
      ) : null}
    </div>
  )
}
