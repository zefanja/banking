import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { db, type Category, type Group } from './db'
import type { BalanceAnchor } from './store'
import { startBalanceFrom } from './store'

/** Alle Daten live aus IndexedDB – die Datenmengen privater Konten sind klein genug. */
export function useData() {
  const transactions = useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray(), [])
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const groups = useLiveQuery(() => db.groups.orderBy('sort').toArray(), [])
  const assignments = useLiveQuery(() => db.assignments.toArray(), [])
  const rules = useLiveQuery(() => db.rules.toArray(), [])
  const anchorMeta = useLiveQuery(() => db.meta.get('balanceAnchor'), [])

  const ready = !!(transactions && categories && groups && assignments && rules)
  const anchor = (anchorMeta?.value as BalanceAnchor | undefined) ?? null

  const derived = useMemo(() => {
    const cats = categories ?? []
    const catById = new Map<number, Category>(cats.map((c) => [c.id!, c]))
    const groupById = new Map<number, Group>((groups ?? []).map((g) => [g.id!, g]))
    const startBalance = startBalanceFrom(anchor, transactions ?? [])
    const balance = startBalance + (transactions ?? []).reduce((s, t) => s + t.amount, 0)
    return { catById, groupById, startBalance, balance }
  }, [categories, groups, transactions, anchor])

  return {
    ready,
    transactions: transactions ?? [],
    categories: categories ?? [],
    groups: groups ?? [],
    assignments: assignments ?? [],
    rules: rules ?? [],
    anchor,
    ...derived,
  }
}

export type AppData = ReturnType<typeof useData>

/** Kleiner Hash-Router: #/budget, #/buchungen?cat=3 … */
export function useHashRoute() {
  const parse = () => {
    const h = location.hash.replace(/^#\/?/, '')
    const [path, query = ''] = h.split('?')
    return { path: path || 'uebersicht', params: new URLSearchParams(query) }
  }
  const [route, setRoute] = useState(parse)
  useEffect(() => {
    const on = () => setRoute(parse())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export function navigate(path: string, params?: Record<string, string>) {
  const q = params ? '?' + new URLSearchParams(params).toString() : ''
  location.hash = `#/${path}${q}`
}

/** true, solange die Media Query zutrifft (z. B. '(max-width: 639px)' für Handys). */
export function useMediaQuery(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const m = window.matchMedia(query)
    const on = () => setMatch(m.matches)
    on()
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [query])
  return match
}

/** Zustand, der sich im localStorage merkt (z. B. gewählter Monat). */
export function usePersistentState<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    try {
      const s = localStorage.getItem('hb:' + key)
      return s ? (JSON.parse(s) as T) : initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('hb:' + key, JSON.stringify(v))
    } catch {
      /* ignorieren */
    }
  }, [key, v])
  return [v, setV] as const
}
