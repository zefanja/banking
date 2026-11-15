import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cx, money } from '../lib/format'
import type { Category } from '../lib/db'

// ---------- Dialog ----------

export function Dialog({
  open, onClose, title, children, footer, wide,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-[2px] sm:items-center" onMouseDown={onClose}>
      <div
        className={cx('card max-h-[90vh] w-full overflow-hidden flex flex-col animate-[pop_.15s_ease-out]', wide ? 'max-w-2xl' : 'max-w-md')}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button className="btn-ghost -mr-2 p-1.5" onClick={onClose} aria-label="Schließen">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

// ---------- Toasts ----------

interface Toast {
  id: number
  text: ReactNode
  action?: { label: string; run: () => void }
  tone?: 'ok' | 'error'
}
const ToastCtx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random()
    setToasts((ts) => [...ts, { ...t, id }])
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), t.action ? 8000 : 4000)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-4 z-[60] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              'pointer-events-auto flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-white shadow-lg animate-[pop_.15s_ease-out]',
              t.tone === 'error' ? 'bg-[#e11d48]' : 'bg-ink',
            )}
          >
            <div className="flex-1">{t.text}</div>
            {t.action && (
              <button
                className="shrink-0 rounded-lg bg-white/15 px-2.5 py-1 font-medium hover:bg-white/25"
                onClick={() => {
                  t.action!.run()
                  setToasts((ts) => ts.filter((x) => x.id !== t.id))
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

// ---------- Kleinteile ----------

export function Amount({ value, className, plus }: { value: number; className?: string; plus?: boolean }) {
  return (
    <span className={cx('num whitespace-nowrap', value < 0 ? 'text-rose-600' : value > 0 ? 'text-emerald-600' : 'text-slate-400', className)}>
      {plus && value > 0 ? '+' : ''}
      {money(value)}
    </span>
  )
}

export function CategoryBadge({ category, className }: { category?: Category | null; className?: string }) {
  if (!category) {
    return <span className={cx('inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500', className)}>Ohne Kategorie</span>
  }
  return (
    <span
      className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', className)}
      style={{ backgroundColor: category.color + '1f', color: category.color }}
    >
      <span>{category.icon}</span>
      <span className="text-slate-700">{category.name}</span>
    </span>
  )
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">{icon}</div>
      <h3 className="font-semibold text-slate-800">{title}</h3>
      {children && <div className="mt-1 max-w-md text-sm text-slate-500">{children}</div>}
    </div>
  )
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Array<[T, string]> }) {
  return (
    <div className="seg">
      {options.map(([v, l]) => (
        <button key={v} data-active={v === value} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  )
}

/** Kategorie-Auswahl, gruppiert. */
export function CategorySelect({
  value, onChange, categories, groups, kind, allowEmpty = true, emptyLabel = '— Ohne Kategorie —', className,
}: {
  value: number | null
  onChange: (id: number | null) => void
  categories: Category[]
  groups: Array<{ id?: number; name: string; kind: string; sort: number }>
  kind?: 'expense' | 'income'
  allowEmpty?: boolean
  emptyLabel?: string
  className?: string
}) {
  const gs = [...groups].filter((g) => !kind || g.kind === kind).sort((a, b) => a.sort - b.sort)
  return (
    <select
      className={cx('input py-1.5', className)}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
    >
      {allowEmpty && <option value="">{emptyLabel}</option>}
      {gs.map((g) => (
        <optgroup key={g.id} label={g.name}>
          {categories
            .filter((c) => c.groupId === g.id && (!c.archived || c.id === value))
            .sort((a, b) => a.sort - b.sort)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  )
}

export function MoneyInput({
  value, onCommit, className, autoFocus,
}: {
  value: number
  onCommit: (cents: number) => void
  className?: string
  autoFocus?: boolean
}) {
  const [text, setText] = useState<string | null>(null)
  const display = text ?? (value === 0 ? '' : (value / 100).toFixed(2).replace('.', ','))
  const commit = () => {
    if (text === null) return
    const expr = text.replace(/\s/g, '')
    // Kleine Rechenhilfe: "50+20" oder "100-15,5"
    let cents: number | null = null
    if (/^[-+]?[\d.,]+([+-][\d.,]+)*$/.test(expr)) {
      const parts = expr.match(/[-+]?[\d.,]+/g) ?? []
      cents = parts.reduce((s, p) => {
        const n = Number(p.replace(/\./g, '').replace(',', '.'))
        return s + Math.round(n * 100)
      }, 0)
    } else if (expr === '') cents = 0
    if (cents !== null && Number.isFinite(cents)) onCommit(cents)
    setText(null)
  }
  return (
    <input
      className={cx('input num py-1.5 text-right', className)}
      inputMode="decimal"
      placeholder="0,00"
      value={display}
      autoFocus={autoFocus}
      onFocus={(e) => {
        setText(display)
        requestAnimationFrame(() => e.target.select())
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          setText(null)
          ;(e.target as HTMLInputElement).blur()
        }
      }}
    />
  )
}

export function Stat({ label, value, hint, icon, tone = 'slate' }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: 'slate' | 'emerald' | 'rose' | 'brand' | 'amber' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    rose: 'bg-rose-50 text-rose-600',
    brand: 'bg-brand-50 text-brand-600',
    amber: 'bg-amber-50 text-amber-600',
  }
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">{label}</span>
        {icon && <span className={cx('flex h-8 w-8 items-center justify-center rounded-xl', tones[tone])}>{icon}</span>}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  )
}
