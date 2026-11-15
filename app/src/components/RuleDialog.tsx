import { useEffect, useMemo, useState } from 'react'
import { db, type Rule, type RuleField } from '../lib/db'
import type { AppData } from '../lib/hooks'
import { ruleMatches } from '../lib/rules'
import { Dialog, CategorySelect, useToast } from './ui'

export type RuleDraft = Partial<Rule>

export const FIELD_LABEL: Record<RuleField, string> = {
  counterparty: 'Empfänger / Zahler',
  purpose: 'Verwendungszweck',
  iban: 'IBAN',
  any: 'Beliebiges Feld',
}

export function RuleDialog({ draft, onClose, data }: { draft: RuleDraft | null; onClose: () => void; data: AppData }) {
  const toast = useToast()
  const [rule, setRule] = useState<RuleDraft>({})
  const [applyExisting, setApplyExisting] = useState(true)

  useEffect(() => {
    if (draft) setRule({ field: 'counterparty', sign: 0, pattern: '', ...draft })
  }, [draft])

  const matches = useMemo(() => {
    if (!rule.pattern?.trim() || !rule.field) return []
    return data.transactions.filter((t) => ruleMatches({ ...(rule as Rule), sign: rule.sign ?? 0 }, t))
  }, [rule, data.transactions])
  const toChange = matches.filter((t) => t.categoryId == null)

  const valid = !!rule.pattern?.trim() && rule.categoryId != null && rule.field

  const save = async () => {
    if (!valid) return
    const r: Rule = {
      field: rule.field!, pattern: rule.pattern!.trim(), sign: rule.sign ?? 0, categoryId: rule.categoryId!,
      createdAt: rule.createdAt ?? Date.now(),
    }
    if (rule.id) await db.rules.update(rule.id, r)
    else await db.rules.add(r)
    let n = 0
    if (applyExisting && toChange.length) {
      await db.transaction('rw', db.transactions, async () => {
        for (const t of toChange) await db.transactions.update(t.id, { categoryId: r.categoryId })
      })
      n = toChange.length
    }
    toast({ text: `Regel gespeichert${n ? ` · ${n} Buchung(en) kategorisiert` : ''}.` })
    onClose()
  }

  return (
    <Dialog
      open={!!draft}
      onClose={onClose}
      title={rule.id ? 'Regel bearbeiten' : 'Neue Regel'}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary" onClick={save} disabled={!valid}>Speichern</button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Wenn …</label>
            <select className="input" value={rule.field} onChange={(e) => setRule({ ...rule, field: e.target.value as RuleField })}>
              {Object.entries(FIELD_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="label">… enthält</label>
            <input className="input" value={rule.pattern ?? ''} onChange={(e) => setRule({ ...rule, pattern: e.target.value })} placeholder="z. B. ROSSMANN" autoFocus />
          </div>
        </div>
        <div>
          <label className="label">Gilt für</label>
          <select className="input" value={rule.sign ?? 0} onChange={(e) => setRule({ ...rule, sign: Number(e.target.value) as -1 | 0 | 1 })}>
            <option value={0}>Einnahmen und Ausgaben</option>
            <option value={-1}>Nur Ausgaben</option>
            <option value={1}>Nur Einnahmen</option>
          </select>
        </div>
        <div>
          <label className="label">Dann Kategorie</label>
          <CategorySelect value={rule.categoryId ?? null} onChange={(id) => setRule({ ...rule, categoryId: id ?? undefined })} categories={data.categories} groups={data.groups} emptyLabel="Bitte wählen …" />
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
          Passt auf <b>{matches.length}</b> Buchung(en), davon <b>{toChange.length}</b> ohne Kategorie.
          {toChange.length > 0 && (
            <label className="mt-2 flex items-center gap-2">
              <input type="checkbox" checked={applyExisting} onChange={(e) => setApplyExisting(e.target.checked)} className="accent-brand-600" />
              Diese jetzt kategorisieren
            </label>
          )}
          <div className="mt-1 text-xs text-slate-400">Bereits kategorisierte Buchungen bleiben unverändert.</div>
        </div>
      </div>
    </Dialog>
  )
}

/** Sinnvolles Suchmuster aus einer Gegenpartei ableiten ("VISA ROSSMANN 1234" → "ROSSMANN"). */
export function suggestPattern(counterparty: string) {
  return counterparty.trim()
}
