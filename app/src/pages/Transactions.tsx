import { Fragment, useEffect, useMemo, useState } from 'react'
import { Search, ListOrdered, ChevronDown, Wand2, CheckCircle2, X } from 'lucide-react'
import type { AppData } from '../lib/hooks'
import { db, type Transaction } from '../lib/db'
import { allocatedForTx, isBudgetIncome } from '../lib/budget'
import { applyRules } from '../lib/rules'
import { cx, fmtDate, fmtMonth, money, monthOf, yearOf } from '../lib/format'
import { Amount, CategorySelect, Empty, PageHeader, useToast } from '../components/ui'
import { RuleDialog, suggestPattern, type RuleDraft } from '../components/RuleDialog'
import { AllocateDialog } from '../components/BudgetDialogs'

const PAGE = 150

export default function Transactions({ data, params }: { data: AppData; params: URLSearchParams }) {
  const toast = useToast()
  const [q, setQ] = useState('')
  const [period, setPeriod] = useState(params.get('month') ?? '')
  const [cat, setCat] = useState(params.get('cat') ?? '')
  const [dir, setDir] = useState<'all' | 'in' | 'out'>('all')
  const [limit, setLimit] = useState(PAGE)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<string | null>(null)
  const [ruleDraft, setRuleDraft] = useState<RuleDraft | null>(null)
  const [allocTx, setAllocTx] = useState<Transaction | null>(null)

  useEffect(() => {
    setPeriod(params.get('month') ?? '')
    setCat(params.get('cat') ?? '')
  }, [params])

  const kind = useMemo(() => new Map(data.categories.map((c) => [c.id!, c.kind])), [data.categories])

  const periods = useMemo(() => {
    const years = new Set<string>()
    const months = new Set<string>()
    for (const t of data.transactions) {
      years.add(yearOf(t.date))
      months.add(monthOf(t.date))
    }
    return { years: [...years].sort().reverse(), months: [...months].sort().reverse() }
  }, [data.transactions])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return data.transactions.filter((t) => {
      if (period && !t.date.startsWith(period)) return false
      if (cat === 'none' && t.categoryId != null) return false
      if (cat && cat !== 'none' && t.categoryId !== Number(cat)) return false
      if (dir === 'in' && t.amount < 0) return false
      if (dir === 'out' && t.amount >= 0) return false
      if (needle) {
        const hay = `${t.counterparty} ${t.purpose} ${t.iban} ${t.note} ${money(t.amount)}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [data.transactions, q, period, cat, dir])

  const sumIn = filtered.reduce((s, t) => s + (t.amount > 0 ? t.amount : 0), 0)
  const sumOut = filtered.reduce((s, t) => s + (t.amount < 0 ? t.amount : 0), 0)

  /** Wird eine Einnahme zur Ausgabe/Erstattung umkategorisiert, ihre Verteilung entfernen. */
  const dropAllocationsIfNotIncome = async (ids: string[], categoryId: number | null) => {
    const stillIncome = categoryId == null || kind.get(categoryId) === 'income'
    if (!stillIncome) await db.assignments.where('txId').anyOf(ids).delete()
  }

  const setCategory = async (t: Transaction, categoryId: number | null) => {
    await db.transactions.update(t.id, { categoryId })
    if (t.amount > 0) await dropAllocationsIfNotIncome([t.id], categoryId)
    if (categoryId == null) return
    const c = data.catById.get(categoryId)
    // Gibt es weitere unkategorisierte Buchungen mit derselben Gegenpartei? → Regel anbieten
    const similar = data.transactions.filter((x) => x.id !== t.id && x.categoryId == null && x.counterparty && x.counterparty === t.counterparty).length
    const hasRule = data.rules.some((r) => r.field === 'counterparty' && t.counterparty.toLowerCase().includes(r.pattern.toLowerCase()) && r.categoryId === categoryId)
    if (!hasRule && t.counterparty) {
      toast({
        text: <>„{t.counterparty}“ → {c?.icon} {c?.name}{similar ? ` · ${similar} weitere ohne Kategorie` : ''}</>,
        action: { label: 'Als Regel merken', run: () => setRuleDraft({ field: 'counterparty', pattern: suggestPattern(t.counterparty), categoryId, sign: t.amount < 0 ? -1 : 1 }) },
      })
    }
  }

  const bulkSet = async (categoryId: number | null) => {
    const ids = [...selected]
    await db.transaction('rw', db.transactions, async () => {
      for (const id of ids) await db.transactions.update(id, { categoryId })
    })
    await dropAllocationsIfNotIncome(ids, categoryId)
    toast({ text: `${ids.length} Buchung(en) aktualisiert.` })
    setSelected(new Set())
  }

  const runRules = async () => {
    const n = await applyRules(true)
    toast({ text: n ? `${n} Buchung(en) per Regel kategorisiert.` : 'Keine weiteren Treffer für deine Regeln.' })
  }

  const visible = filtered.slice(0, limit)
  const allSelected = visible.length > 0 && visible.every((t) => selected.has(t.id))
  const uncategorizedTotal = data.transactions.filter((t) => t.categoryId == null).length

  if (!data.transactions.length) {
    return (
      <>
        <PageHeader title="Buchungen" />
        <Empty icon={<ListOrdered size={22} />} title="Noch keine Buchungen">Importiere zuerst einen Kontoauszug.</Empty>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Buchungen" subtitle={`${data.transactions.length} Buchungen · ${uncategorizedTotal} ohne Kategorie`}>
        {data.rules.length > 0 && uncategorizedTotal > 0 && (
          <button className="btn-outline" onClick={runRules}><Wand2 size={16} /> Regeln anwenden</button>
        )}
        {uncategorizedTotal > 0 && cat !== 'none' && (
          <button className="btn-primary" onClick={() => setCat('none')}>Unkategorisierte zeigen</button>
        )}
      </PageHeader>

      {/* Filter */}
      <div className="card mb-4 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-[1fr_180px_220px_auto]">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Suche nach Empfänger, Zweck, Betrag …" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE) }} />
        </div>
        <select className="input" value={period} onChange={(e) => { setPeriod(e.target.value); setLimit(PAGE) }}>
          <option value="">Gesamter Zeitraum</option>
          <optgroup label="Jahre">{periods.years.map((y) => <option key={y} value={y}>{y}</option>)}</optgroup>
          <optgroup label="Monate">{periods.months.map((m) => <option key={m} value={m}>{fmtMonth(m)}</option>)}</optgroup>
        </select>
        <select className="input" value={cat} onChange={(e) => { setCat(e.target.value); setLimit(PAGE) }}>
          <option value="">Alle Kategorien</option>
          <option value="none">❔ Ohne Kategorie</option>
          {data.groups.map((g) => (
            <optgroup key={g.id} label={g.name}>
              {data.categories.filter((c) => c.groupId === g.id).sort((a, b) => a.sort - b.sort).map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <div className="seg">
          {([['all', 'Alle'], ['in', 'Ein'], ['out', 'Aus']] as const).map(([v, l]) => (
            <button key={v} data-active={dir === v} onClick={() => setDir(v)}>{l}</button>
          ))}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 px-1 text-sm text-slate-500">
        <span><b className="text-slate-700">{filtered.length}</b> Treffer</span>
        <span>Einnahmen <Amount value={sumIn} className="font-medium" /></span>
        <span>Ausgaben <Amount value={sumOut} className="font-medium" /></span>
        <span>Saldo <Amount value={sumIn + sumOut} className="font-medium" /></span>
        {(q || period || cat || dir !== 'all') && (
          <button className="ml-auto inline-flex items-center gap-1 text-xs text-brand-700 hover:underline" onClick={() => { setQ(''); setPeriod(''); setCat(''); setDir('all') }}>
            <X size={12} /> Filter zurücksetzen
          </button>
        )}
      </div>

      {selected.size > 0 && (
        <div className="sticky top-[70px] z-30 mb-3 flex flex-wrap items-center gap-3 rounded-2xl bg-ink px-4 py-2.5 text-sm text-white shadow-lg lg:top-2">
          <span><b>{selected.size}</b> ausgewählt</span>
          <div className="w-full text-slate-800 sm:w-64">
            <CategorySelect value={null} onChange={bulkSet} categories={data.categories} groups={data.groups} emptyLabel="Kategorie zuweisen …" />
          </div>
          <button className="ml-auto text-white/70 hover:text-white" onClick={() => setSelected(new Set())}>Auswahl aufheben</button>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm sm:min-w-[720px]">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="w-10 py-3 pl-3 pr-1 sm:px-4">
                  <input type="checkbox" className="accent-brand-600" checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(visible.map((t) => t.id)))} />
                </th>
                <th className="hidden w-28 px-2 py-3 font-medium sm:table-cell">Datum</th>
                <th className="px-2 py-3 font-medium"><span className="sm:hidden">Buchung</span><span className="hidden sm:inline">Empfänger / Zweck</span></th>
                <th className="hidden w-60 px-2 py-3 font-medium sm:table-cell">Kategorie</th>
                <th className="w-px py-3 pl-1 pr-3 text-right font-medium sm:w-32 sm:px-4">Betrag</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => {
                const income = t.amount > 0 && isBudgetIncome(t, kind)
                const open = income ? t.amount - allocatedForTx(t.id, data.assignments) : 0
                const isOpen = expanded === t.id
                return (
                  <Fragment key={t.id}>
                    <tr className={cx('border-b border-slate-50 transition hover:bg-slate-50/70', selected.has(t.id) && 'bg-brand-50/50', t.categoryId == null && 'bg-amber-50/30')}>
                      <td className="py-2.5 pl-3 pr-1 align-top sm:px-4 sm:align-middle">
                        <input type="checkbox" className="accent-brand-600" checked={selected.has(t.id)}
                          onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n })} />
                      </td>
                      <td className="num hidden px-2 py-2.5 text-slate-500 sm:table-cell">{fmtDate(t.date)}</td>
                      <td className="max-w-0 px-2 py-2.5">
                        <button className="flex w-full min-w-0 items-center gap-1.5 text-left" onClick={() => setExpanded(isOpen ? null : t.id)}>
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium text-slate-800">{t.counterparty || '—'}</div>
                            <div className="truncate text-xs text-slate-500"><span className="sm:hidden">{fmtDate(t.date)} · </span>{t.purpose || t.type}{t.note && <span className="text-brand-700"> · 📝 {t.note}</span>}</div>
                          </div>
                          <ChevronDown size={14} className={cx('shrink-0 text-slate-300 transition', isOpen && 'rotate-180')} />
                        </button>
                        <div className="mt-1.5 sm:hidden">
                          <CategorySelect value={t.categoryId} onChange={(id) => setCategory(t, id)} categories={data.categories} groups={data.groups}
                            className={cx('py-1.5', t.categoryId == null && 'border-amber-300 bg-amber-50')} />
                        </div>
                      </td>
                      <td className="hidden px-2 py-2 sm:table-cell">
                        <CategorySelect value={t.categoryId} onChange={(id) => setCategory(t, id)} categories={data.categories} groups={data.groups}
                          className={t.categoryId == null ? 'border-amber-300 bg-amber-50' : ''} />
                      </td>
                      <td className="py-2.5 pl-1 pr-3 text-right align-top sm:px-4 sm:align-middle">
                        <Amount value={t.amount} plus className="whitespace-nowrap font-semibold" />
                        {income && (
                          <button onClick={() => setAllocTx(t)} className={cx('mt-0.5 block w-full whitespace-nowrap text-right text-[11px]', open === 0 ? 'text-emerald-600' : 'font-medium text-amber-700 hover:underline')}>
                            {open === 0 ? <span className="inline-flex items-center gap-0.5"><CheckCircle2 size={11} /> verteilt</span> : `${money(open)} verteilen →`}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isOpen && <DetailRow t={t} onRule={() => setRuleDraft({ field: 'counterparty', pattern: t.counterparty, categoryId: t.categoryId ?? undefined, sign: t.amount < 0 ? -1 : 1 })} />}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > limit && (
          <div className="border-t border-slate-100 p-3 text-center">
            <button className="btn-ghost" onClick={() => setLimit((l) => l + PAGE)}>Weitere {Math.min(PAGE, filtered.length - limit)} anzeigen</button>
          </div>
        )}
        {filtered.length === 0 && <div className="p-10 text-center text-sm text-slate-400">Keine Buchungen für diese Filter.</div>}
      </div>

      <RuleDialog draft={ruleDraft} onClose={() => setRuleDraft(null)} data={data} />
      <AllocateDialog tx={allocTx} onClose={() => setAllocTx(null)} data={data} />
    </>
  )
}

function DetailRow({ t, onRule }: { t: Transaction; onRule: () => void }) {
  const [note, setNote] = useState(t.note)
  const field = (l: string, v: string) => v ? (
    <div><div className="text-[11px] uppercase tracking-wide text-slate-400">{l}</div><div className="break-all text-slate-700">{v}</div></div>
  ) : null
  return (
    <tr className="border-b border-slate-100 bg-slate-50/60">
      <td className="hidden sm:table-cell" />
      <td colSpan={5} className="px-3 py-3 sm:px-2">
        <div className="grid gap-3 text-xs sm:grid-cols-3">
          {field('Zahlungspflichtige*r', t.payer)}
          {field('Zahlungsempfänger*in', t.payee)}
          {field('Verwendungszweck', t.purpose)}
          {field('Umsatztyp', t.type)}
          {field('IBAN', t.iban)}
          {field('Wertstellung', fmtDate(t.valueDate))}
          {field('Gläubiger-ID', t.creditorId)}
          {field('Mandatsreferenz', t.mandateRef)}
          {field('Kundenreferenz', t.customerRef)}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input className="input max-w-sm py-1.5" placeholder="Notiz hinzufügen …" value={note} onChange={(e) => setNote(e.target.value)}
            onBlur={() => note !== t.note && db.transactions.update(t.id, { note })} />
          <button className="btn-outline py-1.5 text-xs" onClick={onRule}><Wand2 size={14} /> Regel aus dieser Buchung</button>
        </div>
      </td>
    </tr>
  )
}
