import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Sparkles } from 'lucide-react'
import type { Transaction } from '../lib/db'
import type { AppData } from '../lib/hooks'
import { computeBudget, type EnvelopeRow } from '../lib/budget'
import { allocateIncome, moveMoney } from '../lib/store'
import { cx, fmtDate, fmtMonth, money } from '../lib/format'
import { Dialog, MoneyInput, useToast } from './ui'

/** Geld zwischen Umschlägen (oder aus "Zu verteilen") verschieben. */
export function MoveDialog({
  open, onClose, data, month, initialFrom, initialTo, initialAmount,
}: {
  open: boolean
  onClose: () => void
  data: AppData
  month: string
  initialFrom?: number | null
  initialTo?: number | null
  initialAmount?: number
}) {
  const toast = useToast()
  const budget = useMemo(
    () => computeBudget(month, data.transactions, data.categories, data.assignments, data.startBalance),
    [month, data.transactions, data.categories, data.assignments, data.startBalance],
  )
  const [from, setFrom] = useState<number | null>(initialFrom ?? null)
  const [to, setTo] = useState<number | null>(initialTo ?? null)
  const [amount, setAmount] = useState(initialAmount ?? 0)

  useEffect(() => {
    if (open) {
      setFrom(initialFrom ?? null)
      setTo(initialTo ?? null)
      setAmount(initialAmount ?? 0)
    }
  }, [open, initialFrom, initialTo, initialAmount])

  const avail = (id: number | null) => (id == null ? budget.readyToAssign : budget.rows.find((r) => r.category.id === id)?.available ?? 0)

  const options = (exclude: number | null) => (
    <>
      <option value="rta">💰 Zu verteilen ({money(budget.readyToAssign)})</option>
      {data.groups.filter((g) => g.kind === 'expense').map((g) => (
        <optgroup key={g.id} label={g.name}>
          {budget.rows
            .filter((r) => r.category.groupId === g.id && !r.category.archived && r.category.id !== exclude)
            .sort((a, b) => a.category.sort - b.category.sort)
            .map((r) => (
              <option key={r.category.id} value={r.category.id}>
                {r.category.icon} {r.category.name} ({money(r.available)})
              </option>
            ))}
        </optgroup>
      ))}
    </>
  )

  // Vorschläge: Umschläge mit dem meisten verfügbaren Geld
  const suggestions = budget.rows
    .filter((r) => r.available > 0 && r.category.id !== to)
    .sort((a, b) => b.available - a.available)
    .slice(0, 4)

  const save = async () => {
    if (amount <= 0 || from === to) return
    await moveMoney(month, from, to, amount)
    toast({ text: `${money(amount)} verschoben.` })
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Geld verschieben · ${fmtMonth(month)}`}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary" onClick={save} disabled={amount <= 0 || from === to}>Verschieben</button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <div>
            <label className="label">Von</label>
            <select className="input" value={from ?? 'rta'} onChange={(e) => setFrom(e.target.value === 'rta' ? null : Number(e.target.value))}>
              {options(null)}
            </select>
          </div>
          <ArrowRight className="mb-2.5 text-slate-400" size={18} />
          <div>
            <label className="label">Nach</label>
            <select className="input" value={to ?? 'rta'} onChange={(e) => setTo(e.target.value === 'rta' ? null : Number(e.target.value))}>
              {options(null)}
            </select>
          </div>
        </div>
        <div>
          <label className="label">Betrag</label>
          <MoneyInput value={amount} onCommit={setAmount} className="text-lg" />
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {avail(from) > 0 && (
              <button className="rounded-full bg-slate-100 px-2.5 py-1 hover:bg-slate-200" onClick={() => setAmount(avail(from))}>
                Alles verfügbare ({money(avail(from))})
              </button>
            )}
            {to != null && avail(to) < 0 && (
              <button className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-700 hover:bg-rose-100" onClick={() => setAmount(-avail(to))}>
                Überzug ausgleichen ({money(-avail(to))})
              </button>
            )}
          </div>
        </div>
        {to != null && suggestions.length > 0 && (
          <div>
            <div className="label">Schnell wählen: Quelle</div>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((r) => (
                <button
                  key={r.category.id}
                  onClick={() => setFrom(r.category.id!)}
                  className={cx('rounded-xl border px-3 py-1.5 text-sm transition', from === r.category.id ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 hover:bg-slate-50')}
                >
                  {r.category.icon} {r.category.name} <span className="num text-slate-500">{money(r.available)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {amount > avail(from) && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Hinweis: In der Quelle sind nur {money(avail(from))} verfügbar – sie wird dadurch negativ.
          </p>
        )}
      </div>
    </Dialog>
  )
}

/** Eine Einnahme auf Umschläge verteilen – "jeder Euro bekommt einen Job". */
export function AllocateDialog({ tx, onClose, data }: { tx: Transaction | null; onClose: () => void; data: AppData }) {
  const toast = useToast()
  const [parts, setParts] = useState<Map<number, number>>(new Map())
  const month = tx?.date.slice(0, 7) ?? ''

  useEffect(() => {
    if (!tx) return
    const m = new Map<number, number>()
    for (const a of data.assignments) if (a.txId === tx.id) m.set(a.categoryId, (m.get(a.categoryId) ?? 0) + a.amount)
    setParts(m)
  }, [tx, data.assignments])

  const budget = useMemo(
    () => (month ? computeBudget(month, data.transactions, data.categories, data.assignments, data.startBalance) : null),
    [month, data.transactions, data.categories, data.assignments, data.startBalance],
  )

  if (!tx || !budget) return null
  const total = [...parts.values()].reduce((s, v) => s + v, 0)
  const rest = tx.amount - total
  const set = (id: number, v: number) => setParts((p) => new Map(p).set(id, v))

  /** Fehlbeträge zu den Monatszielen (oder Überzüge) aus dieser Einnahme auffüllen. */
  const fillGoals = () => {
    let left = rest
    const next = new Map(parts)
    const need = (r: EnvelopeRow) => {
      const already = next.get(r.category.id!) ?? 0
      const target = Math.max(r.category.goal - (r.assigned - (parts.get(r.category.id!) ?? 0)), -r.available, 0)
      return Math.max(0, target - already)
    }
    const rows = budget.rows.filter((r) => !r.category.archived).sort((a, b) => a.available - b.available)
    for (const r of rows) {
      if (left <= 0) break
      const n = Math.min(need(r), left)
      if (n > 0) {
        next.set(r.category.id!, (next.get(r.category.id!) ?? 0) + n)
        left -= n
      }
    }
    setParts(next)
  }

  const save = async () => {
    await allocateIncome(tx, [...parts.entries()].map(([categoryId, amount]) => ({ categoryId, amount })))
    toast({ text: rest === 0 ? 'Jeder Euro hat einen Job 🎉' : `Verteilt. ${money(rest)} bleiben in „Zu verteilen“.` })
    onClose()
  }

  return (
    <Dialog
      open={!!tx}
      onClose={onClose}
      wide
      title="Einnahme verteilen"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary" onClick={save} disabled={rest < 0}>Speichern</button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-br from-emerald-50 to-brand-50 p-4">
        <div>
          <div className="text-sm font-medium">{tx.counterparty}</div>
          <div className="text-xs text-slate-500">{fmtDate(tx.date)} · {tx.purpose || '—'}</div>
        </div>
        <div className="text-right">
          <div className="num text-xl font-semibold text-emerald-600">{money(tx.amount)}</div>
          <div className={cx('num text-xs font-medium', rest === 0 ? 'text-emerald-600' : rest < 0 ? 'text-rose-600' : 'text-amber-700')}>
            {rest === 0 ? '✓ vollständig verteilt' : rest > 0 ? `noch ${money(rest)} offen` : `${money(-rest)} zu viel`}
          </div>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <button className="btn-outline text-xs" onClick={fillGoals} disabled={rest <= 0}>
          <Sparkles size={14} /> Ziele & Überzüge auffüllen
        </button>
        <button className="btn-ghost text-xs" onClick={() => setParts(new Map())}>Zurücksetzen</button>
      </div>

      <div className="space-y-4">
        {data.groups.filter((g) => g.kind === 'expense').map((g) => {
          const rows = budget.rows.filter((r) => r.category.groupId === g.id && !r.category.archived).sort((a, b) => a.category.sort - b.category.sort)
          if (!rows.length) return null
          return (
            <div key={g.id}>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{g.name}</div>
              <div className="space-y-1.5">
                {rows.map((r) => {
                  const id = r.category.id!
                  const v = parts.get(id) ?? 0
                  return (
                    <div key={id} className="flex items-center gap-3">
                      <span className="flex-1 truncate text-sm">
                        {r.category.icon} {r.category.name}
                        <span className={cx('num ml-2 text-xs', r.available < 0 ? 'text-rose-600' : 'text-slate-400')}>
                          verfügbar {money(r.available)}
                          {r.category.goal > 0 && ` · Ziel ${money(r.category.goal)}`}
                        </span>
                      </span>
                      {rest > 0 && (
                        <button className="rounded-lg px-2 py-1 text-xs text-brand-700 hover:bg-brand-50" onClick={() => set(id, v + rest)} title="Rest hierhin">
                          + Rest
                        </button>
                      )}
                      <MoneyInput value={v} onCommit={(c) => set(id, c)} className="w-32" />
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </Dialog>
  )
}
