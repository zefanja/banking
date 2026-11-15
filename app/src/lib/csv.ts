import Papa from 'papaparse'
import { parseMoney } from './format'
import type { Transaction } from './db'

export type ParsedTx = Omit<Transaction, 'categoryId' | 'note' | 'importId'>

export interface ParseResult {
  accountName: string
  iban: string
  periodFrom: string
  periodTo: string
  /** Kontostand laut CSV-Kopf (falls vorhanden). */
  balance: { date: string; amount: number } | null
  transactions: ParsedTx[]
  pendingCount: number
  /** Hinweis, z. B. wenn die erkannte Anzahl nicht zur Angabe im Dokument passt. */
  warning?: string
}

/** Mögliche Spaltennamen (neues und altes DKB-Format, plus generische Varianten). */
const COLS = {
  date: ['buchungsdatum', 'buchungstag', 'datum'],
  valueDate: ['wertstellung', 'valuta', 'wertstellungsdatum'],
  status: ['status'],
  payer: ['zahlungspflichtige*r', 'zahlungspflichtiger', 'auftraggeber'],
  payee: ['zahlungsempfänger*in', 'zahlungsempfänger', 'empfänger', 'begünstigter'],
  counterparty: ['auftraggeber / begünstigter', 'auftraggeber/begünstigter', 'name zahlungsbeteiligter'],
  purpose: ['verwendungszweck'],
  type: ['umsatztyp', 'buchungstext'],
  iban: ['iban', 'kontonummer', 'kontonummer/iban', 'iban zahlungsbeteiligter'],
  amount: ['betrag (€)', 'betrag (eur)', 'betrag', 'umsatz'],
  creditorId: ['gläubiger-id', 'gläubiger id', 'glaeubiger-id'],
  mandateRef: ['mandatsreferenz'],
  customerRef: ['kundenreferenz', 'kundenreferenz (end-to-end)'],
} as const

/** "13.11.26" oder "13.11.2026" → "2026-11-13" */
export function parseGermanDate(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/)
  if (!m) return null
  let year = Number(m[3])
  if (m[3].length === 2) year += 2000
  return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

/** Schneller, stabiler 53-Bit-Hash (cyrb53). */
export function hash(str: string) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * Formatunabhängiger Abgleichschlüssel – nur Felder, die CSV *und* PDF enthalten:
 * Buchungsdatum, Betrag, IBAN der Gegenseite und Name der Gegenseite (ohne Leerzeichen,
 * damit Zeilenumbrüche im PDF keine Rolle spielen).
 */
export function canonicalKey(t: { date: string; amount: number; iban: string; counterparty: string }) {
  // Nur echte IBANs – die DKB-CSV enthält bei Abrechnungen z. B. die eigene Kontonummer, das PDF gar nichts
  const iban = t.iban.replace(/\s/g, '').toUpperCase()
  return [t.date, t.amount, /^[A-Z]{2}\d{2}[A-Z0-9]{8,}$/.test(iban) ? iban : '', t.counterparty.replace(/\s+/g, '').toLowerCase()].join('|')
}

/** Vergibt matchKeys inkl. laufender Nummer für identische Buchungen innerhalb einer Datei. */
export function withMatchKeys<T extends { date: string; amount: number; iban: string; counterparty: string }>(txs: T[]) {
  const seen = new Map<string, number>()
  return txs.map((t) => {
    const k = canonicalKey(t)
    const n = (seen.get(k) ?? 0) + 1
    seen.set(k, n)
    return { ...t, matchKey: `${hash(k)}-${n}` }
  })
}

export function parseBankCsv(text: string): ParseResult {
  const clean = text.replace(/^﻿/, '')
  const rows = Papa.parse<string[]>(clean, { delimiter: '', skipEmptyLines: false }).data

  // Kopfzeile finden: erste Zeile, die eine Datumsspalte und eine Betragsspalte enthält
  const headerIdx = rows.findIndex((r) => {
    const cells = r.map(norm)
    return cells.some((c) => (COLS.date as readonly string[]).includes(c)) &&
      cells.some((c) => (COLS.amount as readonly string[]).includes(c))
  })
  if (headerIdx < 0) {
    throw new Error('Keine Kopfzeile mit „Buchungsdatum“ und „Betrag“ gefunden. Ist das ein DKB-Kontoauszug im CSV-Format?')
  }

  // Metadaten aus den Zeilen vor der Kopfzeile
  let accountName = ''
  let iban = ''
  let periodFrom = ''
  let periodTo = ''
  let balance: ParseResult['balance'] = null
  rows.slice(0, headerIdx).forEach((r, i) => {
    const [k = '', v = ''] = r
    if (i === 0 && /^[A-Z]{2}\d{2}/.test(v.replace(/\s/g, ''))) {
      accountName = k
      iban = v.replace(/\s/g, '')
    }
    if (/zeitraum/i.test(k)) {
      const m = v.match(/(\S+)\s*-\s*(\S+)/)
      if (m) {
        periodFrom = parseGermanDate(m[1]) ?? ''
        periodTo = parseGermanDate(m[2]) ?? ''
      }
    }
    const bm = k.match(/kontostand vom (\S+?):?$/i)
    if (bm) {
      const d = parseGermanDate(bm[1])
      const a = parseMoney(v)
      if (d && a !== null) balance = { date: d, amount: a }
    }
  })

  const header = rows[headerIdx].map(norm)
  const col = (names: readonly string[]) => header.findIndex((h) => names.includes(h))
  const idx = Object.fromEntries(
    Object.entries(COLS).map(([k, names]) => [k, col(names)]),
  ) as Record<keyof typeof COLS, number>

  const get = (r: string[], k: keyof typeof COLS) => (idx[k] >= 0 ? (r[idx[k]] ?? '').trim() : '')

  const transactions: ParsedTx[] = []
  const occurrences = new Map<string, number>()
  let pendingCount = 0

  for (const r of rows.slice(headerIdx + 1)) {
    if (r.length < 3 || r.every((c) => !c.trim())) continue
    const date = parseGermanDate(get(r, 'date'))
    const amount = parseMoney(get(r, 'amount'))
    if (!date || amount === null) continue

    // Vorgemerkte Umsätze können sich noch ändern → nicht importieren
    const status = get(r, 'status').toLowerCase()
    if (status && status !== 'gebucht') {
      pendingCount++
      continue
    }

    const payer = get(r, 'payer')
    const payee = get(r, 'payee')
    const cp = get(r, 'counterparty')
    const counterparty = cp || (amount < 0 ? payee : payer) || payee || payer
    const t = {
      date,
      valueDate: parseGermanDate(get(r, 'valueDate')) ?? date,
      payer: payer || (amount >= 0 ? cp : ''),
      payee: payee || (amount < 0 ? cp : ''),
      counterparty,
      purpose: get(r, 'purpose'),
      type: get(r, 'type'),
      iban: get(r, 'iban').replace(/\s/g, ''),
      amount,
      creditorId: get(r, 'creditorId'),
      mandateRef: get(r, 'mandateRef'),
      customerRef: get(r, 'customerRef'),
    }

    // Fingerabdruck aus allen fachlichen Feldern. Wirklich identische Buchungen
    // (z. B. zweimal 5 € am selben Tag beim selben Empfänger) werden über einen
    // laufenden Zähler unterschieden – so bleiben sie erhalten, ein erneuter
    // Import derselben Datei erzeugt aber exakt dieselben IDs.
    const key = [
      t.date, t.valueDate, t.amount, norm(t.payer), norm(t.payee), norm(t.purpose),
      t.iban, t.customerRef, t.mandateRef,
    ].join('|')
    const n = (occurrences.get(key) ?? 0) + 1
    occurrences.set(key, n)

    transactions.push({ id: `${hash(key)}-${n}`, matchKey: '', ...t })
  }

  return { accountName, iban, periodFrom, periodTo, balance, transactions: withMatchKeys(transactions), pendingCount }
}
