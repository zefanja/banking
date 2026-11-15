import type { Assignment, Category, Cents, Transaction } from './db'
import { monthOf } from './format'

export interface EnvelopeRow {
  category: Category
  assigned: Cents // in diesem Monat zugewiesen
  activity: Cents // Umsätze in diesem Monat (negativ = Ausgaben)
  available: Cents // verfügbar inkl. Übertrag aus Vormonaten
  carryover: Cents // Übertrag aus dem Vormonat
}

export interface BudgetMonth {
  month: string
  rows: EnvelopeRow[]
  /** Noch zu verteilen – "jeder Euro braucht einen Job". */
  readyToAssign: Cents
  incomeThisMonth: Cents
  assignedThisMonth: Cents
  activityThisMonth: Cents
  /** Ausgaben ohne Umschlag (bis einschließlich Monat) – reduzieren "Zu verteilen". */
  uncategorizedSpending: Cents
  uncategorizedCountThisMonth: number
  /** Zuweisungen in zukünftigen Monaten (bereits von "Zu verteilen" abgezogen). */
  assignedFuture: Cents
  startBalance: Cents
}

/**
 * Zählt eine Buchung als Einnahme für "Zu verteilen"?
 * Ja, wenn sie einer Einnahmen-Kategorie zugeordnet ist oder positiv und unkategorisiert ist.
 * Positive Beträge in einem Ausgaben-Umschlag sind Erstattungen und fließen in den Umschlag zurück.
 */
export function isBudgetIncome(t: Transaction, catKind: Map<number, Category['kind']>) {
  if (t.categoryId == null) return t.amount > 0
  return catKind.get(t.categoryId) === 'income'
}

export function computeBudget(
  month: string,
  txs: Transaction[],
  categories: Category[],
  assignments: Assignment[],
  startBalance: Cents,
): BudgetMonth {
  const kind = new Map(categories.map((c) => [c.id!, c.kind]))
  const envelopes = categories.filter((c) => c.kind === 'expense')

  const assignedTo = new Map<number, Cents>() // bis Vormonat
  const assignedIn = new Map<number, Cents>() // in diesem Monat
  let assignedFuture = 0
  let assignedThroughMonth = 0
  for (const a of assignments) {
    if (a.month > month) {
      assignedFuture += a.amount
      continue
    }
    assignedThroughMonth += a.amount
    const map = a.month === month ? assignedIn : assignedTo
    map.set(a.categoryId, (map.get(a.categoryId) ?? 0) + a.amount)
  }

  const activityTo = new Map<number, Cents>()
  const activityIn = new Map<number, Cents>()
  let income = 0
  let incomeThisMonth = 0
  let uncategorizedSpending = 0
  let uncategorizedCountThisMonth = 0
  for (const t of txs) {
    const m = monthOf(t.date)
    if (m > month) continue
    const isThis = m === month
    if (isBudgetIncome(t, kind)) {
      income += t.amount
      if (isThis) incomeThisMonth += t.amount
      continue
    }
    if (t.categoryId == null) {
      uncategorizedSpending += t.amount
      continue
    }
    const map = isThis ? activityIn : activityTo
    map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.amount)
  }
  for (const t of txs) if (t.categoryId == null && monthOf(t.date) === month) uncategorizedCountThisMonth++

  const rows: EnvelopeRow[] = envelopes.map((c) => {
    const id = c.id!
    const carryover = (assignedTo.get(id) ?? 0) + (activityTo.get(id) ?? 0)
    const assigned = assignedIn.get(id) ?? 0
    const activity = activityIn.get(id) ?? 0
    return { category: c, assigned, activity, carryover, available: carryover + assigned + activity }
  })

  return {
    month,
    rows,
    readyToAssign: startBalance + income + uncategorizedSpending - assignedThroughMonth - assignedFuture,
    incomeThisMonth,
    assignedThisMonth: [...assignedIn.values()].reduce((s, v) => s + v, 0),
    activityThisMonth: [...activityIn.values()].reduce((s, v) => s + v, 0),
    uncategorizedSpending,
    uncategorizedCountThisMonth,
    assignedFuture,
    startBalance,
  }
}

/** Wie viel einer Einnahme ist bereits auf Umschläge verteilt? */
export function allocatedForTx(txId: string, assignments: Assignment[]) {
  return assignments.filter((a) => a.txId === txId).reduce((s, a) => s + a.amount, 0)
}
