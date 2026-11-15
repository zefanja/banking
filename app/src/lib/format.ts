import { format, parseISO, startOfISOWeek, getISOWeek, getISOWeekYear } from 'date-fns'
import { de } from 'date-fns/locale'
import type { Cents } from './db'

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const eurShort = new Intl.NumberFormat('de-DE', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
})

export const money = (c: Cents) => eur.format(c / 100)
export const moneyShort = (c: Cents) => eurShort.format(c / 100)

/** "12,50" / "-3" / "1.234,5" → Cent */
export function parseMoney(input: string): Cents | null {
  const s = input.trim().replace(/[€\s ]/g, '')
  if (!s) return null
  // Deutsches Format: Tausenderpunkte entfernen, Komma als Dezimaltrenner
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
  const n = Number(normalized)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

/** Cent → "12,50" für Eingabefelder */
export const centsToInput = (c: Cents) => (c / 100).toFixed(2).replace('.', ',')

export const fmtDate = (iso: string) => format(parseISO(iso), 'dd.MM.yyyy')
export const fmtMonth = (ym: string) => format(parseISO(ym + '-01'), 'MMMM yyyy', { locale: de })
export const fmtMonthShort = (ym: string) => format(parseISO(ym + '-01'), 'MMM yy', { locale: de })

export const monthOf = (iso: string) => iso.slice(0, 7)
export const yearOf = (iso: string) => iso.slice(0, 4)
export function weekOf(iso: string) {
  const d = parseISO(iso)
  return `${getISOWeekYear(d)}-W${String(getISOWeek(d)).padStart(2, '0')}`
}
export function weekStart(iso: string) {
  return format(startOfISOWeek(parseISO(iso)), 'yyyy-MM-dd')
}

export function currentMonth() {
  return format(new Date(), 'yyyy-MM')
}

export function addMonths(ym: string, delta: number) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}
