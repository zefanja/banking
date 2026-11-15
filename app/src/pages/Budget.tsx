import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ArrowLeftRight, Copy, Target, CheckCircle2, AlertTriangle, Coins, Scale } from 'lucide-react'
import type { AppData } from '../lib/hooks'
import { navigate, usePersistentState } from '../lib/hooks'
import { allocatedForTx, computeBudget, isBudgetIncome } from '../lib/budget'
import { setAssigned } from '../lib/store'
import { addMonths, currentMonth, cx, fmtDate, fmtMonth, money, monthOf } from '../lib/format'
import type { Transaction } from '../lib/db'
import { MoneyInput, PageHeader, useToast } from '../components/ui'
import { AllocateDialog, MoveDialog } from '../components/BudgetDialogs'

export default function Budget({ data }: { data: AppData }) {
  const toast = useToast()
  const latest = data.transactions[0] ? monthOf(data.transactions[0].date) : currentMonth()
  const [month, setMonth] = usePersistentState('budgetMonth', latest)
  const [move, setMove] = useState<{ from?: number | null; to?: number | null; amount?: number } | null>(null)
  const [allocTx, setAllocTx] = useState<Transaction | null>(null)

  const budget = useMemo(
    () => computeBudget(month, data.transactions, data.categories, data.assignments, data.startBalance),
    [month, data.transactions, data.categories, data.assignments, data.startBalance],
  )
  const prevBudget = useMemo(
    () => computeBudget(addMonths(month, -1), data.transactions, data.categories, data.assignments, data.startBalance),
    [month, data.transactions, data.categories, data.assignments, data.startBalance],
  )

  const kind = useMemo(() => new Map(data.categories.map((c) => [c.id!, c.kind])), [data.categories])
  const incomes = data.transactions
    .filter((t) => monthOf(t.date) === month && t.amount > 0 && isBudgetIncome(t, kind))
    .map((t) => ({ t, allocated: allocatedForTx(t.id, data.assignments) }))
  const overspent = budget.rows.filter((r) => r.available < 0)

  const copyPrevious = async () => {
    let n = 0
    for (const r of budget.rows) {
      const prev = prevBudget.rows.find((p) => p.category.id === r.category.id)
      if (prev && prev.assigned && !r.assigned) {
        await setAssigned(month, r.category.id!, prev.assigned)
        n++
      }
    }
    toast({ text: n ? `${n} Umschläge wie im Vormonat befüllt.` : 'Nichts zu übernehmen – alle Umschläge haben schon Werte.' })
  }

  const fillGoals = async () => {
    let n = 0
    for (const r of budget.rows) {
      const goal = r.category.goal
      if (goal > 0 && r.assigned < goal) {
        await setAssigned(month, r.category.id!, goal)
        n++
      }
    }
    toast({ text: n ? `${n} Umschläge auf ihr Monatsziel gesetzt.` : 'Keine offenen Monatsziele. Ziele legst du unter „Kategorien“ fest.' })
  }

  const rta = budget.readyToAssign
  const rtaTone = rta === 0 ? 'ok' : rta > 0 ? 'todo' : 'over'

  return (
    <>
      <PageHeader title="Budget" subtitle="Envelope Budgeting: Gib jedem Euro einen Job.">
        <div className="flex items-center gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200/70">
          <button className="btn-ghost p-1.5" onClick={() => setMonth(addMonths(month, -1))} aria-label="Vormonat"><ChevronLeft size={18} /></button>
          <span className="min-w-36 text-center text-sm font-semibold capitalize">{fmtMonth(month)}</span>
          <button className="btn-ghost p-1.5" onClick={() => setMonth(addMonths(month, 1))} aria-label="Nächster Monat"><ChevronRight size={18} /></button>
        </div>
        {month !== latest && <button className="btn-ghost text-xs" onClick={() => setMonth(latest)}>Aktuell</button>}
      </PageHeader>

      {/* Zu verteilen */}
      <div
        className={cx(
          'mb-6 flex flex-wrap items-center gap-4 rounded-2xl p-5 text-white shadow-md',
          rtaTone === 'ok' && 'bg-gradient-to-br from-emerald-500 to-brand-600 shadow-emerald-600/20',
          rtaTone === 'todo' && 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-amber-500/20',
          rtaTone === 'over' && 'bg-gradient-to-br from-rose-500 to-pink-600 shadow-rose-600/20',
        )}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
          {rtaTone === 'ok' ? <CheckCircle2 /> : rtaTone === 'todo' ? <Coins /> : <AlertTriangle />}
        </div>
        <div className="flex-1">
          <div className="text-sm text-white/85">Zu verteilen</div>
          <div className="num text-3xl font-semibold tracking-tight">{money(rta)}</div>
          <div className="mt-0.5 text-sm text-white/85">
            {rtaTone === 'ok' && 'Perfekt – jeder Euro hat einen Job.'}
            {rtaTone === 'todo' && 'Dieses Geld wartet noch auf einen Job. Weise es Umschlägen zu.'}
            {rtaTone === 'over' && 'Du hast mehr verteilt, als vorhanden ist. Nimm Geld aus Umschlägen zurück.'}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {rta > 0 && (
            <button className="btn bg-white/20 text-white hover:bg-white/30" onClick={() => setMove({ from: null })}>
              <ArrowLeftRight size={16} /> Zuweisen
            </button>
          )}
          {rta < 0 && (
            <button className="btn bg-white/20 text-white hover:bg-white/30" onClick={() => setMove({ to: null, amount: -rta })}>
              <ArrowLeftRight size={16} /> Zurückholen
            </button>
          )}
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <MiniStat label="Einnahmen im Monat" value={money(budget.incomeThisMonth)} tone="text-emerald-600" />
        <MiniStat label="Zugewiesen im Monat" value={money(budget.assignedThisMonth)} />
        <MiniStat label="Ausgaben aus Umschlägen" value={money(budget.activityThisMonth)} tone={budget.activityThisMonth < 0 ? 'text-rose-600' : ''} />
      </div>

      {(overspent.length > 0 || budget.uncategorizedCountThisMonth > 0) && (
        <div className="mb-6 space-y-2">
          {overspent.length > 0 && (
            <div className="card flex flex-wrap items-center gap-3 border-rose-200 bg-rose-50/60 px-4 py-3 text-sm text-rose-800">
              <AlertTriangle size={18} />
              <span className="flex-1">
                Überzogen: {overspent.map((r) => `${r.category.icon} ${r.category.name} (${money(r.available)})`).join(', ')}
              </span>
              <span className="text-xs text-rose-600">Klicke bei einem Umschlag auf „Ausgleichen“.</span>
            </div>
          )}
          {budget.uncategorizedCountThisMonth > 0 && (
            <button onClick={() => navigate('buchungen', { cat: 'none', month })} className="card flex w-full items-center gap-3 border-amber-200 bg-amber-50/60 px-4 py-3 text-left text-sm text-amber-800 hover:shadow">
              <AlertTriangle size={18} />
              <span className="flex-1">{budget.uncategorizedCountThisMonth} Buchung(en) in diesem Monat ohne Kategorie – Ausgaben ohne Umschlag verringern „Zu verteilen“.</span>
              <ChevronRight size={16} />
            </button>
          )}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        {/* Umschläge */}
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <h2 className="font-semibold">Umschläge</h2>
            <div className="flex flex-wrap gap-1">
              <button className="btn-ghost text-xs" onClick={copyPrevious} title="Zuweisungen des Vormonats übernehmen"><Copy size={14} /> Wie Vormonat</button>
              <button className="btn-ghost text-xs" onClick={fillGoals} title="Monatsziele zuweisen"><Target size={14} /> Ziele zuweisen</button>
              <button className="btn-ghost text-xs" onClick={() => setMove({})}><ArrowLeftRight size={14} /> Verschieben</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2 font-medium">Umschlag</th>
                  <th className="w-36 px-2 py-2 text-right font-medium">Zugewiesen</th>
                  <th className="w-32 px-2 py-2 text-right font-medium">Aktivität</th>
                  <th className="w-40 px-4 py-2 text-right font-medium">Verfügbar</th>
                </tr>
              </thead>
              {data.groups.filter((g) => g.kind === 'expense').map((g) => {
                const rows = budget.rows.filter((r) => r.category.groupId === g.id && (!r.category.archived || r.available !== 0)).sort((a, b) => a.category.sort - b.category.sort)
                if (!rows.length) return null
                const sum = (k: 'assigned' | 'activity' | 'available') => rows.reduce((s, r) => s + r[k], 0)
                return (
                  <tbody key={g.id} className="border-t border-slate-100">
                    <tr className="bg-slate-50/70 text-xs font-semibold text-slate-500">
                      <td className="px-4 py-2">{g.name}</td>
                      <td className="num px-2 py-2 text-right">{money(sum('assigned'))}</td>
                      <td className="num px-2 py-2 text-right">{money(sum('activity'))}</td>
                      <td className="num px-4 py-2 text-right">{money(sum('available'))}</td>
                    </tr>
                    {rows.map((r) => {
                      const goal = r.category.goal
                      const progress = goal > 0 ? Math.min(100, (r.assigned / goal) * 100) : null
                      return (
                        <tr key={r.category.id} className="group border-t border-slate-50 hover:bg-slate-50/50">
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <span className="text-base">{r.category.icon}</span>
                              <div className="min-w-0">
                                <button className="truncate font-medium hover:text-brand-700" onClick={() => navigate('buchungen', { cat: String(r.category.id), month })}>
                                  {r.category.name}
                                </button>
                                {progress !== null && (
                                  <div className="mt-1 flex items-center gap-2">
                                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${progress}%` }} />
                                    </div>
                                    <span className="text-[11px] text-slate-400">Ziel {money(goal)}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-1.5">
                            <MoneyInput value={r.assigned} onCommit={(c) => setAssigned(month, r.category.id!, c)} />
                          </td>
                          <td className="num px-2 py-2 text-right text-slate-500">{r.activity ? money(r.activity) : '–'}</td>
                          <td className="px-4 py-2 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {r.available < 0 && (
                                <button
                                  className="hidden rounded-lg px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 sm:inline-flex sm:items-center sm:gap-1"
                                  onClick={() => setMove({ to: r.category.id, amount: -r.available, from: bestSource(budget.rows, r.category.id!) })}
                                >
                                  <Scale size={12} /> Ausgleichen
                                </button>
                              )}
                              <button
                                onClick={() => (r.available < 0
                                  ? setMove({ to: r.category.id, amount: -r.available, from: bestSource(budget.rows, r.category.id!) })
                                  : setMove({ from: r.category.id }))}
                                title={r.available < 0 ? 'Ausgleichen' : 'Geld verschieben'}
                                className={cx(
                                  'num rounded-full px-2.5 py-1 text-xs font-semibold transition hover:ring-2',
                                  r.available < 0 && 'bg-rose-100 text-rose-700 hover:ring-rose-200',
                                  r.available === 0 && 'bg-slate-100 text-slate-500 hover:ring-slate-200',
                                  r.available > 0 && (goal > 0 && r.available < goal ? 'bg-amber-100 text-amber-800 hover:ring-amber-200' : 'bg-emerald-100 text-emerald-700 hover:ring-emerald-200'),
                                )}
                              >
                                {money(r.available)}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                )
              })}
            </table>
          </div>
        </div>

        {/* Einnahmen dieses Monats */}
        <div className="space-y-4">
          <div className="card p-4">
            <h2 className="mb-1 font-semibold">Einnahmen im {fmtMonth(month).split(' ')[0]}</h2>
            <p className="mb-3 text-xs text-slate-500">Jede Einnahme bekommt einen Job: Verteile sie auf deine Umschläge.</p>
            {incomes.length === 0 && <p className="text-sm text-slate-400">Keine Einnahmen in diesem Monat.</p>}
            <ul className="space-y-2">
              {incomes.map(({ t, allocated }) => {
                const open = t.amount - allocated
                return (
                  <li key={t.id} className="rounded-xl border border-slate-100 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{t.counterparty}</div>
                        <div className="truncate text-xs text-slate-500">{fmtDate(t.date)} · {t.purpose || '—'}</div>
                      </div>
                      <span className="num text-sm font-semibold text-emerald-600">{money(t.amount)}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      {open === 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600"><CheckCircle2 size={14} /> verteilt</span>
                      ) : (
                        <span className="text-xs text-amber-700">{allocated ? `${money(open)} offen` : 'noch nicht verteilt'}</span>
                      )}
                      <button className={open === 0 ? 'btn-ghost px-2 py-1 text-xs' : 'btn-primary px-2.5 py-1 text-xs'} onClick={() => setAllocTx(t)}>
                        {open === 0 ? 'Ändern' : 'Verteilen'}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
          {budget.assignedFuture !== 0 && (
            <p className="px-1 text-xs text-slate-500">In künftigen Monaten bereits zugewiesen: <b className="num">{money(budget.assignedFuture)}</b> (schon von „Zu verteilen“ abgezogen).</p>
          )}
          {budget.startBalance !== 0 && (
            <p className="px-1 text-xs text-slate-500">Enthält Anfangssaldo vor der ersten Buchung: <b className="num">{money(budget.startBalance)}</b></p>
          )}
        </div>
      </div>

      <MoveDialog
        open={!!move}
        onClose={() => setMove(null)}
        data={data}
        month={month}
        initialFrom={move?.from}
        initialTo={move?.to}
        initialAmount={move?.amount}
      />
      <AllocateDialog tx={allocTx} onClose={() => setAllocTx(null)} data={data} />
    </>
  )
}

/** Für "Ausgleichen": Umschlag mit dem meisten verfügbaren Geld, sonst "Zu verteilen". */
function bestSource(rows: ReturnType<typeof computeBudget>['rows'], exclude: number) {
  const best = rows.filter((r) => r.category.id !== exclude && r.available > 0).sort((a, b) => b.available - a.available)[0]
  return best?.category.id ?? null
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={cx('num mt-0.5 text-lg font-semibold', tone)}>{value}</div>
    </div>
  )
}
