import { db, getMeta, setMeta, type Cents, type Transaction } from './db'
import type { ParseResult } from './csv'
import { findCategory } from './rules'

export interface BalanceAnchor {
  date: string
  amount: Cents
}

export interface ImportOutcome {
  added: number
  skipped: number
  pending: number
  autoCategorized: number
}

/**
 * Neue Buchungen ermitteln. Duplikat ist, was dieselbe ID hat (gleiche Datei erneut importiert)
 * oder denselben formatunabhängigen matchKey (dieselbe Buchung kam schon per CSV bzw. PDF).
 */
export async function filterNew(parsed: ParseResult) {
  const ids = parsed.transactions.map((t) => t.id)
  const byId = await db.transactions.bulkGet(ids)
  const keys = await db.transactions.where('matchKey').anyOf(parsed.transactions.map((t) => t.matchKey)).toArray()
  const knownKeys = new Set(keys.map((t) => t.matchKey))
  return parsed.transactions.filter((t, i) => !byId[i] && !knownKeys.has(t.matchKey))
}

export async function importParsed(parsed: ParseResult, fileName: string): Promise<ImportOutcome> {
  const rules = await db.rules.toArray()
  return db.transaction('rw', [db.transactions, db.imports, db.meta], async () => {
    const fresh = await filterNew(parsed)

    const importId = (await db.imports.add({
      fileName,
      importedAt: Date.now(),
      added: fresh.length,
      skipped: parsed.transactions.length - fresh.length,
      pending: parsed.pendingCount,
      periodFrom: parsed.periodFrom,
      periodTo: parsed.periodTo,
    })) as number

    let autoCategorized = 0
    const rows: Transaction[] = fresh.map((t) => {
      const categoryId = findCategory(rules, t)
      if (categoryId != null) autoCategorized++
      return { ...t, categoryId, note: '', importId }
    })
    await db.transactions.bulkAdd(rows)

    // Neuesten bekannten Kontostand merken – daraus wird der Anfangssaldo berechnet
    if (parsed.balance) {
      const cur = await getMeta<BalanceAnchor | null>('balanceAnchor', null)
      if (!cur || parsed.balance.date >= cur.date) await setMeta('balanceAnchor', parsed.balance)
    }
    if (parsed.accountName || parsed.iban) {
      await setMeta('account', { name: parsed.accountName, iban: parsed.iban })
    }

    return {
      added: fresh.length,
      skipped: parsed.transactions.length - fresh.length,
      pending: parsed.pendingCount,
      autoCategorized,
    }
  })
}

/**
 * Anfangssaldo = bekannter Kontostand − Summe aller Buchungen bis zu diesem Datum.
 * Das ist das Geld, das vor der ersten importierten Buchung schon auf dem Konto war.
 */
export function startBalanceFrom(anchor: BalanceAnchor | null, txs: Transaction[]) {
  if (!anchor) return 0
  const sum = txs.filter((t) => t.date <= anchor.date).reduce((s, t) => s + t.amount, 0)
  return anchor.amount - sum
}

/** Manuelle Zuweisung eines Umschlags in einem Monat auf einen Zielwert setzen. */
export async function setAssigned(month: string, categoryId: number, target: Cents) {
  await db.transaction('rw', db.assignments, async () => {
    const all = await db.assignments.where({ month, categoryId }).toArray()
    const fromIncome = all.filter((a) => a.txId != null).reduce((s, a) => s + a.amount, 0)
    const manual = all.find((a) => a.txId == null)
    const amount = target - fromIncome
    if (manual) await db.assignments.update(manual.id!, { amount })
    else await db.assignments.add({ month, categoryId, amount, txId: null })
  })
}

/** Geld zwischen Umschlägen verschieben (fromId null = aus "Zu verteilen"). */
export async function moveMoney(month: string, fromId: number | null, toId: number | null, amount: Cents) {
  await db.transaction('rw', db.assignments, async () => {
    const adjust = async (categoryId: number, delta: Cents) => {
      const manual = await db.assignments
        .where({ month, categoryId })
        .filter((a) => a.txId == null)
        .first()
      if (manual) await db.assignments.update(manual.id!, { amount: manual.amount + delta })
      else await db.assignments.add({ month, categoryId, amount: delta, txId: null })
    }
    if (fromId != null) await adjust(fromId, -amount)
    if (toId != null) await adjust(toId, amount)
  })
}

/** Eine Einnahme auf Umschläge verteilen (ersetzt eine frühere Verteilung dieser Einnahme). */
export async function allocateIncome(tx: Transaction, parts: Array<{ categoryId: number; amount: Cents }>) {
  const month = tx.date.slice(0, 7)
  await db.transaction('rw', db.assignments, async () => {
    await db.assignments.where('txId').equals(tx.id).delete()
    await db.assignments.bulkAdd(
      parts.filter((p) => p.amount !== 0).map((p) => ({ month, categoryId: p.categoryId, amount: p.amount, txId: tx.id })),
    )
  })
}

// ---------- Backup ----------

const TABLES = ['transactions', 'groups', 'categories', 'assignments', 'rules', 'imports', 'meta'] as const

export async function exportBackup() {
  const data: Record<string, unknown[]> = {}
  for (const t of TABLES) data[t] = await db.table(t).toArray()
  const blob = new Blob([JSON.stringify({ app: 'haushaltsbuch', version: 1, exportedAt: new Date().toISOString(), data }, null, 1)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `haushaltsbuch-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function restoreBackup(file: File) {
  const json = JSON.parse(await file.text())
  if (json?.app !== 'haushaltsbuch' || !json.data) throw new Error('Das ist keine gültige Haushaltsbuch-Sicherung.')
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      await db.table(t).clear()
      if (Array.isArray(json.data[t])) await db.table(t).bulkAdd(json.data[t])
    }
  })
}

export async function wipeAll() {
  await db.delete()
  location.reload()
}
