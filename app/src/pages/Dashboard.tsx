import { useMemo } from 'react'
import { ArrowDownRight, ArrowUpRight, PiggyBank, Upload, Wallet, AlertCircle, ChevronRight, Mail } from 'lucide-react'
import type { AppData } from '../lib/hooks'
import { navigate } from '../lib/hooks'
import { aggregate, totalsByCategory } from '../lib/analytics'
import { computeBudget } from '../lib/budget'
import { addMonths, cx, fmtDate, fmtMonth, money, monthOf } from '../lib/format'
import { Amount, CategoryBadge, Empty, PageHeader, Stat } from '../components/ui'
import { COLORS, Donut, IncomeExpenseChart } from '../components/charts'

export default function Dashboard({ data }: { data: AppData }) {
  const { transactions, categories, catById } = data
  const latestMonth = transactions[0] ? monthOf(transactions[0].date) : null

  const view = useMemo(() => {
    if (!latestMonth) return null
    const from = addMonths(latestMonth, -11) + '-01'
    const rows = aggregate(transactions.filter((t) => t.date >= from), categories, 'month', from, latestMonth + '-28')
    const cur = rows[rows.length - 1]
    const prev = rows[rows.length - 2]
    const budget = computeBudget(latestMonth, transactions, categories, data.assignments, data.startBalance)
    const top = totalsByCategory([cur], 'expense').slice(0, 6)
    return { rows, cur, prev, budget, top }
  }, [transactions, categories, data.assignments, data.startBalance, latestMonth])

  if (!view || !latestMonth) {
    return (
      <>
        <PageHeader title="Willkommen 👋" subtitle="Dein persönliches, komplett lokales Haushaltsbuch." />
        <Empty icon={<Upload size={22} />} title="Noch keine Buchungen">
          Importiere deinen ersten Kontoauszug als CSV, um loszulegen.
          <div className="mt-4">
            <button className="btn-primary" onClick={() => navigate('import')}>
              <Upload size={16} /> CSV importieren
            </button>
          </div>
        </Empty>
      </>
    )
  }

  const { rows, cur, prev, budget, top } = view
  const chartData = rows.map((r) => ({ label: r.label, Einnahmen: r.income / 100, Ausgaben: r.expense / 100, Saldo: r.net / 100 }))
  const expenseDelta = prev && prev.expense ? Math.round(((cur.expense - prev.expense) / prev.expense) * 100) : null
  const uncategorized = transactions.filter((t) => t.categoryId == null).length
  const overspent = budget.rows.filter((r) => r.available < 0)

  return (
    <>
      <PageHeader title="Übersicht" subtitle={`Stand: ${fmtMonth(latestMonth)} · letzte Buchung am ${fmtDate(transactions[0].date)}`} />

      {(uncategorized > 0 || budget.readyToAssign !== 0 || overspent.length > 0) && (
        <div className="mb-6 grid gap-3 md:grid-cols-3">
          {budget.readyToAssign !== 0 && (
            <Hint tone={budget.readyToAssign > 0 ? 'brand' : 'rose'} onClick={() => navigate('budget')}
              text={budget.readyToAssign > 0
                ? <><b>{money(budget.readyToAssign)}</b> warten darauf, einen Job zu bekommen.</>
                : <>Du hast <b>{money(-budget.readyToAssign)}</b> mehr verteilt, als du hast.</>} />
          )}
          {overspent.length > 0 && (
            <Hint tone="rose" onClick={() => navigate('budget')}
              text={<><b>{overspent.length}</b> Umschlag{overspent.length > 1 ? 'e sind' : ' ist'} überzogen – jetzt ausgleichen.</>} />
          )}
          {uncategorized > 0 && (
            <Hint tone="amber" onClick={() => navigate('buchungen', { cat: 'none' })}
              text={<><b>{uncategorized}</b> Buchung{uncategorized > 1 ? 'en haben' : ' hat'} noch keine Kategorie.</>} />
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Kontostand" value={money(data.balance)} icon={<Wallet size={16} />} tone="brand" />
        <Stat label={`Einnahmen ${fmtMonth(latestMonth).split(' ')[0]}`} value={<span className="text-emerald-600">{money(cur.income)}</span>} icon={<ArrowUpRight size={16} />} tone="emerald" />
        <Stat label={`Ausgaben ${fmtMonth(latestMonth).split(' ')[0]}`} value={<span className="text-rose-600">{money(cur.expense)}</span>} icon={<ArrowDownRight size={16} />} tone="rose"
          hint={expenseDelta !== null ? <span className={expenseDelta > 0 ? 'text-rose-600' : 'text-emerald-600'}>{expenseDelta > 0 ? '+' : ''}{expenseDelta} % zum Vormonat</span> : undefined} />
        <Stat label="Zu verteilen" value={<span className={budget.readyToAssign < 0 ? 'text-rose-600' : ''}>{money(budget.readyToAssign)}</span>} icon={<PiggyBank size={16} />} tone="amber" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Letzte 12 Monate</h2>
            <button className="btn-ghost text-xs" onClick={() => navigate('auswertung')}>Auswertung <ChevronRight size={14} /></button>
          </div>
          <IncomeExpenseChart data={chartData} height={280} />
        </div>
        <div className="card p-5">
          <h2 className="mb-2 font-semibold">Ausgaben diesen Monat</h2>
          {top.length ? (
            <>
              <Donut
                height={180}
                centerLabel="Gesamt"
                centerValue={money(cur.expense)}
                data={top.map(([id, v]) => ({ name: id == null ? 'Ohne Kategorie' : catById.get(id)?.name ?? '?', value: v / 100, color: id == null ? COLORS.uncategorized : catById.get(id)?.color ?? '#999' }))}
              />
              <ul className="mt-3 space-y-2 text-sm">
                {top.map(([id, v]) => (
                  <li key={String(id)} className="flex items-center justify-between gap-2">
                    <CategoryBadge category={id == null ? null : catById.get(id)} />
                    <span className="num font-medium">{money(v)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : <p className="text-sm text-slate-500">Keine Ausgaben in diesem Monat.</p>}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Letzte Buchungen</h2>
            <button className="btn-ghost text-xs" onClick={() => navigate('buchungen')}>Alle <ChevronRight size={14} /></button>
          </div>
          <ul className="divide-y divide-slate-100">
            {transactions.slice(0, 7).map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-base">
                  {t.categoryId != null ? catById.get(t.categoryId)?.icon : '❔'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{t.counterparty || '—'}</div>
                  <div className="truncate text-xs text-slate-500">{fmtDate(t.date)} · {t.purpose}</div>
                </div>
                <Amount value={t.amount} plus className="text-sm font-medium" />
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Umschläge</h2>
            <button className="btn-ghost text-xs" onClick={() => navigate('budget')}>Budget <ChevronRight size={14} /></button>
          </div>
          {budget.rows.some((r) => r.assigned || r.available || r.activity) ? (
            <ul className="space-y-3">
              {budget.rows
                .filter((r) => r.assigned || r.available || r.activity)
                .sort((a, b) => a.available - b.available)
                .slice(0, 7)
                .map((r) => {
                  const total = r.assigned + Math.max(r.carryover, 0)
                  const spent = -r.activity
                  const pct = total > 0 ? Math.min(100, Math.max(0, (spent / total) * 100)) : spent > 0 ? 100 : 0
                  return (
                    <li key={r.category.id}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span>{r.category.icon} {r.category.name}</span>
                        <span className={cx('num font-medium', r.available < 0 ? 'text-rose-600' : 'text-slate-700')}>{money(r.available)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className={cx('h-full rounded-full', r.available < 0 ? 'bg-rose-500' : 'bg-brand-500')} style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  )
                })}
            </ul>
          ) : (
            <div className="text-sm text-slate-500">
              <Mail className="mb-2 text-slate-300" />
              Noch kein Geld verteilt. Gib im Budget jedem Euro einen Job.
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function Hint({ text, tone, onClick }: { text: React.ReactNode; tone: 'brand' | 'amber' | 'rose'; onClick: () => void }) {
  const tones = {
    brand: 'border-brand-200 bg-brand-50 text-brand-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    rose: 'border-rose-200 bg-rose-50 text-rose-700',
  }
  return (
    <button onClick={onClick} className={cx('flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition hover:shadow-sm', tones[tone])}>
      <AlertCircle size={18} className="shrink-0" />
      <span className="flex-1">{text}</span>
      <ChevronRight size={16} className="shrink-0 opacity-60" />
    </button>
  )
}
