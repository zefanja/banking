import { hash, parseGermanDate, withMatchKeys, type ParseResult, type ParsedTx } from './csv'
import { parseMoney } from './format'

/** Ein Textstück aus dem PDF mit Position (PDF-Koordinaten: y wächst nach oben). */
export interface TextItem {
  str: string
  x: number
  y: number
  w: number
}

interface Cell {
  text: string
  x: number
}

const DATE_RE = /^\d{1,2}\.\d{1,2}\.(\d{2}|\d{4})$/
const MONEY_RE = /^[-+]?\d{1,3}(\.\d{3})*,\d{2}$|^[-+]?\d+,\d{2}$/
const IBAN_RE = /^[A-Z]{2}\d{2}(\s?[A-Z0-9]{4}){2,7}(\s?[A-Z0-9]{1,4})?$/

/** Textstücke zu Zeilen gruppieren und innerhalb einer Zeile zu Zellen (Spalten) zusammenfassen. */
function toLines(items: TextItem[]): Cell[][] {
  const sorted = items.filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x)
  const rows: TextItem[][] = []
  for (const it of sorted) {
    const row = rows[rows.length - 1]
    if (row && Math.abs(row[0].y - it.y) < 2.5) row.push(it)
    else rows.push([it])
  }
  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x)
    const cells: Array<Cell & { end: number }> = []
    for (const it of row) {
      const last = cells[cells.length - 1]
      // Kleiner Abstand = gleiches Feld (Wörter), großer Abstand = nächste Spalte
      if (last && it.x - last.end < 8) {
        const gap = it.x - last.end > 1 ? ' ' : ''
        last.text += gap + it.str
        last.end = it.x + it.w
      } else {
        cells.push({ text: it.str, x: it.x, end: it.x + it.w })
      }
    }
    return cells.map((c) => ({ text: c.text.replace(/\s+/g, ' ').trim(), x: c.x })).filter((c) => c.text)
  })
}

/**
 * Parser für den PDF-Export der DKB-App ("Export Umsatzliste").
 * Aufbau je Buchung:
 *   13.11.26   Vinted                                -19,70
 *              IBAN DE96…
 *              VISA Debitkartenumsatz vom 12.11.2026   (ggf. mehrzeilig)
 */
export function parseDkbPdfPages(pages: TextItem[][]): ParseResult {
  let accountName = ''
  let iban = ''
  let expectedCount: number | null = null
  const txs: Array<Omit<ParsedTx, 'matchKey' | 'id'> & { purposeLines: string[] }> = []

  for (const items of pages) {
    const lines = toLines(items)
    let open: (typeof txs)[number] | null = null
    let detailX = Infinity

    for (const cells of lines) {
      const full = cells.map((c) => c.text).join(' ')

      // Kopfdaten
      const cnt = full.match(/Anzahl der Umsätze:\s*(\d+)/i)
      if (cnt) expectedCount = Number(cnt[1])
      if (!iban && cells.length === 1 && IBAN_RE.test(cells[0].text) && !txs.length) iban = cells[0].text.replace(/\s/g, '')

      const first = cells[0]
      const last = cells[cells.length - 1]

      // Neue Buchung: Datum vorne, Betrag hinten
      if (cells.length >= 2 && DATE_RE.test(first.text) && MONEY_RE.test(last.text)) {
        const date = parseGermanDate(first.text)
        const amount = parseMoney(last.text)
        if (date && amount !== null) {
          open = {
            date, valueDate: date, payer: '', payee: '', counterparty: cells.slice(1, -1).map((c) => c.text).join(' '),
            purpose: '', type: amount < 0 ? 'Ausgang' : 'Eingang', iban: '', amount,
            creditorId: '', mandateRef: '', customerRef: '', purposeLines: [],
          }
          if (amount < 0) open.payee = open.counterparty
          else open.payer = open.counterparty
          detailX = cells[1]?.x ?? first.x + 40
          txs.push(open)
          continue
        }
      }

      // Folgezeilen einer Buchung: eingerückt auf Höhe der Spalte "Erläuterung"
      if (open && Math.abs(first.x - detailX) < 12 && cells.length <= 2) {
        const m = full.match(/^IBAN\s+([A-Z]{2}[\dA-Z\s]+)$/)
        if (m && !open.iban) open.iban = m[1].replace(/\s/g, '')
        else open.purposeLines.push(full)
        continue
      }

      // Alles andere (Leerzeile entfällt, Fußzeile, Seitenkopf) beendet die aktuelle Buchung
      open = null

      if (!accountName && /^Export Umsatzliste/i.test(full)) accountName = 'DKB-Konto'
    }
  }

  if (!txs.length) {
    throw new Error('In der PDF wurden keine Buchungen gefunden. Unterstützt wird der PDF-Export „Umsatzliste“ der DKB-App.')
  }

  // ID je Buchung aus allen verfügbaren Feldern (+ laufende Nummer für identische Einträge)
  const occ = new Map<string, number>()
  const transactions = withMatchKeys(
    txs.map(({ purposeLines, ...t }) => {
      const purpose = purposeLines.join(' ').replace(/\s+/g, ' ').trim()
      const key = ['pdf', t.date, t.amount, t.iban, t.counterparty.toLowerCase(), purpose.toLowerCase()].join('|')
      const n = (occ.get(key) ?? 0) + 1
      occ.set(key, n)
      return { ...t, purpose, id: `pdf-${hash(key)}-${n}` }
    }),
  )

  const dates = transactions.map((t) => t.date).sort()
  const warning = expectedCount !== null && expectedCount !== transactions.length
    ? `Laut PDF ${expectedCount} Umsätze, erkannt wurden ${transactions.length}.`
    : undefined

  return {
    accountName, iban,
    periodFrom: dates[0], periodTo: dates[dates.length - 1],
    balance: null,
    transactions,
    pendingCount: 0,
    warning,
  }
}

/** PDF im Browser lesen (pdf.js wird erst bei Bedarf geladen, alles bleibt lokal). */
export async function parseDkbPdf(data: ArrayBuffer): Promise<ParseResult> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const task = pdfjs.getDocument({ data: new Uint8Array(data) })
  const doc = await task.promise
  const pages: TextItem[][] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    pages.push(
      content.items
        .filter((it): it is Extract<typeof it, { str: string }> => 'str' in it)
        .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width })),
    )
  }
  await task.destroy()
  return parseDkbPdfPages(pages)
}
