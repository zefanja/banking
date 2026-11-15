import { useMemo, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import type { AppData } from '../lib/hooks'
import { navigate, usePersistentState } from '../lib/hooks'
import { aggregate, periodLabel, totalsByCategory, type Granularity } from '../lib/analytics'
import { cx, money, yearOf } from '../lib/format'
import { Amount, Empty, PageHeader, Segmented, Stat } from '../components/ui'
import { COLORS, Donut, IncomeExpenseChart, StackedCategoryChart } from '../components/charts'

const TOP_N = 8

export default function Analysis({ data }: { data: AppData }) {
  const { transactions, categories, catById } = data
  const [g, setG] = usePersistentState<Granularity>('anaGran', 'month')
  const years = useMemo(() => [...new Set(transactions.map((t) => yearOf(t.date)))].sort().reverse(), [transactions])
  const [year, setYear] = usePersistentState<string>('anaYear', years[0] ?? '')
  const [which, setWhich] = useState<'expense' | 'income'>('expense')

  const view = useMemo(() => {
    const txs = year ? transactions.filter((t) => t.date.startsWith(year)) : transactions
    if (!txs.length) return null
    const rows = aggregate(txs, categories, g, year ? `${year}-01-01` : undefined, year ? lastDate(txs, year) : undefined)
    const income = rows.reduce((s, r) => s + r.income, 0)
    const expense = rows.reduce((s, r) => s + r.expense, 0)
    return { rows, income, expense }
  }, [transactions, categories, g, year])

  if (!transactions.length) {
    return (
      <>
        <PageHeader title="Auswertung" />
        <Empty icon={<BarChart3 size={22} />} title="Noch keine Daten">Importiere einen Kontoauszug, um Auswertungen zu sehen.</Empty>
      </>
    )
  }

  const controls = (
    <>
      <Segmented value={g} onChange={setG} options={[['week', 'Woche'], ['month', 'Monat'], ['year', 'Jahr']]} />
      <select className="input w-auto" value={year} onChange={(e) => setYear(e.target.value)}>
        <option value="">Alle Jahre</option>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </>
  )

  if (!view) {
    return <><PageHeader title="Auswertung">{controls}</PageHeader><Empty icon={<BarChart3 size={22} />} title="Keine Buchungen im gewählten Zeitraum" /></>
  }

  const { rows, income, expense } = view
  const n = rows.length || 1
  const unit = { week: 'Woche', month: 'Monat', year: 'Jahr' }[g]
  const savingsRate = income > 0 ? Math.round(((income - expense) / income) * 100) : null

  const chartData = rows.map((r) => ({ label: r.label, Einnahmen: r.income / 100, Ausgaben: r.expense / 100, Saldo: r.net / 100 }))

  // Kategorien
  const totals = totalsByCategory(rows, which)
  const catName = (id: number | null) => (id == null ? 'Ohne Kategorie' : catById.get(id)?.name ?? '?')
  const catColor = (id: number | null) => (id == null ? COLORS.uncategorized : catById.get(id)?.color ?? '#999')
  const top = totals.slice(0, TOP_N)
  const restIds = new Set(totals.slice(TOP_N).map(([id]) => id))
  const series = [
    ...top.map(([id]) => ({ key: String(id), name: catName(id), color: catColor(id) })),
    ...(restIds.size ? [{ key: 'rest', name: 'Sonstige', color: '#94a3b8' }] : []),
  ]
  const stacked = rows.map((r) => {
    const src = which === 'expense' ? r.byCategory : r.incomeByCategory
    const o: Record<string, number | string> = { label: r.label }
    for (const [id] of top) o[String(id)] = (src.get(id) ?? 0) / 100
    if (restIds.size) o.rest = [...src.entries()].filter(([id]) => restIds.has(id)).reduce((s, [, v]) => s + v, 0) / 100
    return o
  })
  const catTotal = totals.reduce((s, [, v]) => s + v, 0)

  let cumulative = 0
  const tableRows = rows.map((r) => ({ ...r, cumulative: (cumulative += r.net) }))

  return (
    <>
      <PageHeader title="Auswertung" subtitle={year ? `Jahr ${year}` : 'Alle Jahre'}>{controls}</PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Einnahmen" value={<span className="text-emerald-600">{money(income)}</span>} hint={`Ø ${money(Math.round(income / n))} pro ${unit}`} />
        <Stat label="Ausgaben" value={<span className="text-rose-600">{money(expense)}</span>} hint={`Ø ${money(Math.round(expense / n))} pro ${unit}`} />
        <Stat label="Saldo" value={<Amount value={income - expense} plus />} hint={`${rows.filter((r) => r.net >= 0).length} von ${rows.length} Perioden im Plus`} />
        <Stat label="Sparquote" value={savingsRate === null ? '–' : `${savingsRate} %`} hint="Anteil der Einnahmen, der übrig bleibt" />
      </div>

      <div className="card mt-6 p-5">
        <h2 className="mb-2 font-semibold">Einnahmen & Ausgaben pro {unit}</h2>
        <IncomeExpenseChart data={chartData} height={320} />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Nach Kategorien</h2>
        <Segmented value={which} onChange={setWhich} options={[['expense', 'Ausgaben'], ['income', 'Einnahmen']]} />
      </div>

      <div className="mt-3 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="card p-5">
          <h3 className="mb-2 text-sm font-medium text-slate-500">{which === 'expense' ? 'Ausgaben' : 'Einnahmen'} pro {unit} nach Kategorie</h3>
          <StackedCategoryChart data={stacked} series={series} height={300} />
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-600">
            {series.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.name}</span>
            ))}
          </div>
        </div>
        <div className="card p-5">
          <h3 className="mb-2 text-sm font-medium text-slate-500">Verteilung</h3>
          <Donut height={240} centerLabel="Gesamt" centerValue={money(catTotal)}
            data={totals.filter(([, v]) => v > 0).map(([id, v]) => ({ name: catName(id), value: v / 100, color: catColor(id) }))} />
        </div>
      </div>

      <div className="card mt-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3 font-medium">Kategorie</th>
                <th className="px-4 py-3 text-right font-medium">Summe</th>
                <th className="px-4 py-3 text-right font-medium">Ø pro {unit}</th>
                <th className="w-48 px-4 py-3 font-medium">Anteil</th>
              </tr>
            </thead>
            <tbody>
              {totals.map(([id, v]) => {
                const c = id == null ? null : catById.get(id)
                const pct = catTotal ? (v / catTotal) * 100 : 0
                return (
                  <tr key={String(id)} className="cursor-pointer border-b border-slate-50 hover:bg-slate-50/70"
                    onClick={() => navigate('buchungen', { cat: id == null ? 'none' : String(id), ...(year ? { month: year } : {}) })}>
                    <td className="px-4 py-2.5">
                      <span className="mr-2">{c?.icon ?? '❔'}</span>
                      <span className="font-medium">{catName(id)}</span>
                    </td>
                    <td className="num px-4 py-2.5 text-right font-medium">{money(v)}</td>
                    <td className="num px-4 py-2.5 text-right text-slate-500">{money(Math.round(v / n))}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full" style={{ width: `${Math.max(0, pct)}%`, background: catColor(id) }} />
                        </div>
                        <span className="num w-10 text-right text-xs text-slate-500">{Math.round(pct)} %</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {totals.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-slate-400">Keine Daten.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Verlauf als Tabelle</h2>
      <div className="card overflow-hidden">
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3 font-medium">{unit}</th>
                <th className="px-4 py-3 text-right font-medium">Einnahmen</th>
                <th className="px-4 py-3 text-right font-medium">Ausgaben</th>
                <th className="px-4 py-3 text-right font-medium">Saldo</th>
                <th className="px-4 py-3 text-right font-medium">Kumuliert</th>
              </tr>
            </thead>
            <tbody>
              {[...tableRows].reverse().map((r) => (
                <tr key={r.key} className={cx('border-b border-slate-50 hover:bg-slate-50/70', !r.income && !r.expense && 'text-slate-300')}>
                  <td className="px-4 py-2.5 font-medium capitalize">{periodLabel(r.key, g, true)}</td>
                  <td className="num px-4 py-2.5 text-right text-emerald-600">{r.income ? money(r.income) : '–'}</td>
                  <td className="num px-4 py-2.5 text-right text-rose-600">{r.expense ? money(r.expense) : '–'}</td>
                  <td className="px-4 py-2.5 text-right"><Amount value={r.net} plus /></td>
                  <td className="px-4 py-2.5 text-right"><Amount value={r.cumulative} plus className="text-xs" /></td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 bg-slate-50 font-semibold">
              <tr>
                <td className="px-4 py-3">Gesamt</td>
                <td className="num px-4 py-3 text-right text-emerald-600">{money(income)}</td>
                <td className="num px-4 py-3 text-right text-rose-600">{money(expense)}</td>
                <td className="px-4 py-3 text-right"><Amount value={income - expense} plus /></td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  )
}

/** Für ein ausgewähltes Jahr: Ende = 31.12. bzw. letzte Buchung, falls das Jahr noch läuft. */
function lastDate(txs: { date: string }[], year: string) {
  const max = txs.reduce((m, t) => (t.date > m ? t.date : m), `${year}-01-01`)
  return max
}
