import Dexie, { type EntityTable } from 'dexie'

/** Beträge werden immer als ganze Cent gespeichert, um Rundungsfehler zu vermeiden. */
export type Cents = number

export interface Transaction {
  /** Fingerabdruck aus den Buchungsdaten – dient der Duplikaterkennung. */
  id: string
  date: string // Buchungsdatum, ISO yyyy-mm-dd
  valueDate: string
  payer: string
  payee: string
  /** Gegenpartei: bei Ausgaben der Empfänger, bei Einnahmen der Zahlende. */
  counterparty: string
  purpose: string
  type: string
  iban: string
  amount: Cents
  creditorId: string
  mandateRef: string
  customerRef: string
  categoryId: number | null
  note: string
  importId: number
}

export type CategoryKind = 'expense' | 'income'

export interface Group {
  id?: number
  name: string
  kind: CategoryKind
  sort: number
}

export interface Category {
  id?: number
  name: string
  groupId: number
  kind: CategoryKind
  color: string
  icon: string
  sort: number
  archived: boolean
  /** Optionales Monatsziel für einen Umschlag. */
  goal: Cents
}

/**
 * Zuweisung von Geld an einen Umschlag in einem Monat.
 * - txId === null: manuelle Zuweisung (eine pro Monat/Umschlag)
 * - txId gesetzt: stammt aus dem Verteilen einer konkreten Einnahme
 */
export interface Assignment {
  id?: number
  month: string // yyyy-mm
  categoryId: number
  amount: Cents
  txId: string | null
}

export type RuleField = 'counterparty' | 'purpose' | 'any' | 'iban'

export interface Rule {
  id?: number
  field: RuleField
  pattern: string
  /** Optional: nur Ausgaben (-1), nur Einnahmen (1) oder beides (0). */
  sign: -1 | 0 | 1
  categoryId: number
  createdAt: number
}

export interface ImportRecord {
  id?: number
  fileName: string
  importedAt: number
  added: number
  skipped: number
  pending: number
  periodFrom: string
  periodTo: string
}

export interface Meta {
  key: string
  value: unknown
}

export const db = new Dexie('haushaltsbuch') as Dexie & {
  transactions: EntityTable<Transaction, 'id'>
  groups: EntityTable<Group, 'id'>
  categories: EntityTable<Category, 'id'>
  assignments: EntityTable<Assignment, 'id'>
  rules: EntityTable<Rule, 'id'>
  imports: EntityTable<ImportRecord, 'id'>
  meta: EntityTable<Meta, 'key'>
}

db.version(1).stores({
  transactions: 'id, date, categoryId, amount, importId',
  groups: '++id, sort',
  categories: '++id, groupId, kind, sort',
  assignments: '++id, month, categoryId, txId, [month+categoryId]',
  rules: '++id, categoryId',
  imports: '++id, importedAt',
  meta: 'key',
})

/** Beim ersten Start ein paar sinnvolle Kategorien anlegen. */
db.on('populate', async (tx) => {
  const groups: Array<[string, 'expense' | 'income', Array<[string, string, string]>]> = [
    ['Einnahmen', 'income', [
      ['Gehalt / Lohn', '💼', '#10b981'],
      ['Taschengeld', '🪙', '#14b8a6'],
      ['Geschenke', '🎁', '#22c55e'],
      ['Sonstige Einnahmen', '✨', '#84cc16'],
    ]],
    ['Fixkosten', 'expense', [
      ['Miete & Nebenkosten', '🏠', '#6366f1'],
      ['Handy & Internet', '📱', '#8b5cf6'],
      ['Versicherungen', '🛡️', '#a855f7'],
      ['Abos', '🔁', '#d946ef'],
    ]],
    ['Alltag', 'expense', [
      ['Lebensmittel', '🛒', '#f59e0b'],
      ['Drogerie', '🧴', '#f97316'],
      ['Mobilität', '🚆', '#0ea5e9'],
      ['Kleidung', '👕', '#ec4899'],
    ]],
    ['Freizeit', 'expense', [
      ['Essen gehen', '🍕', '#ef4444'],
      ['Hobbys', '🎨', '#f43f5e'],
      ['Ausflüge & Urlaub', '🏖️', '#06b6d4'],
      ['Geschenke für andere', '🎀', '#e879f9'],
    ]],
    ['Sparen', 'expense', [
      ['Notgroschen', '🐷', '#64748b'],
      ['Sparziele', '🎯', '#0d9488'],
    ]],
  ]
  let gSort = 0
  for (const [name, kind, cats] of groups) {
    const groupId = (await tx.table('groups').add({ name, kind, sort: gSort++ })) as number
    let cSort = 0
    for (const [cname, icon, color] of cats) {
      await tx.table('categories').add({
        name: cname, groupId, kind, icon, color, sort: cSort++, archived: false, goal: 0,
      })
    }
  }
})

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const m = await db.meta.get(key)
  return (m?.value as T) ?? fallback
}

export async function setMeta(key: string, value: unknown) {
  await db.meta.put({ key, value })
}

/** Den Browser bitten, die Daten nicht automatisch zu löschen. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist()
    }
  } catch {
    /* ignorieren */
  }
}
