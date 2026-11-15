import { addDays, format, getISOWeek, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import type { Category, Transaction } from './db'
import { isBudgetIncome } from './budget'
import { addMonths, monthOf, weekStart, yearOf } from './format'

export type Granularity = 'week' | 'month' | 'year'

export function periodKey(iso: string, g: Granularity) {
  if (g === 'year') return yearOf(iso)
  if (g === 'month') return monthOf(iso)
  return weekStart(iso) // Montag der ISO-Woche
}

export function periodLabel(key: string, g: Granularity, long = false) {
  if (g === 'year') return key
  if (g === 'month') return format(parseISO(key + '-01'), long ? 'MMMM yyyy' : 'MMM yy', { locale: de })
  const d = parseISO(key)
  return long
    ? `KW ${getISOWeek(d)} · ${format(d, 'dd.MM.')}–${format(addDays(d, 6), 'dd.MM.yyyy')}`
    : `KW ${getISOWeek(d)}`
}

/** Alle Perioden zwischen erster und letzter Buchung – auch leere, damit Diagramme lückenlos sind. */
export function periodRange(fromIso: string, toIso: string, g: Granularity) {
  const out: string[] = []
  if (g === 'year') {
    for (let y = Number(yearOf(fromIso)); y <= Number(yearOf(toIso)); y++) out.push(String(y))
  } else if (g === 'month') {
    for (let m = monthOf(fromIso); m <= monthOf(toIso); m = addMonths(m, 1)) out.push(m)
  } else {
    const end = weekStart(toIso)
    for (let d = weekStart(fromIso); d <= end; d = format(addDays(parseISO(d), 7), 'yyyy-MM-dd')) out.push(d)
  }
  return out
}

export interface PeriodRow {
  key: string
  label: string
  income: number // Cent, positiv
  expense: number // Cent, positiv
  net: number
  byCategory: Map<number | null, number> // Ausgaben je Kategorie (positiv)
  incomeByCategory: Map<number | null, number>
}

export function aggregate(txs: Transaction[], categories: Category[], g: Granularity, fromIso?: string, toIso?: string): PeriodRow[] {
  if (!txs.length) return []
  const kind = new Map(categories.map((c) => [c.id!, c.kind]))
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date))
  const keys = periodRange(fromIso ?? sorted[0].date, toIso ?? sorted[sorted.length - 1].date, g)
  const rows = new Map<string, PeriodRow>(
    keys.map((k) => [k, { key: k, label: periodLabel(k, g), income: 0, expense: 0, net: 0, byCategory: new Map(), incomeByCategory: new Map() }]),
  )
  for (const t of sorted) {
    const r = rows.get(periodKey(t.date, g))
    if (!r) continue
    if (isBudgetIncome(t, kind)) {
      r.income += t.amount
      r.incomeByCategory.set(t.categoryId, (r.incomeByCategory.get(t.categoryId) ?? 0) + t.amount)
    } else {
      r.expense -= t.amount
      r.byCategory.set(t.categoryId, (r.byCategory.get(t.categoryId) ?? 0) - t.amount)
    }
  }
  for (const r of rows.values()) r.net = r.income - r.expense
  return [...rows.values()]
}

export function totalsByCategory(rows: PeriodRow[], which: 'expense' | 'income') {
  const m = new Map<number | null, number>()
  for (const r of rows) {
    for (const [k, v] of which === 'expense' ? r.byCategory : r.incomeByCategory) m.set(k, (m.get(k) ?? 0) + v)
  }
  return [...m.entries()].filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1])
}
