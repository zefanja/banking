import { useState } from 'react'
import { Plus, Pencil, Trash2, Archive, ArchiveRestore, Wand2, ArrowUp, ArrowDown, FolderPlus } from 'lucide-react'
import type { AppData } from '../lib/hooks'
import { db, type Category, type CategoryKind, type Group } from '../lib/db'
import { applyRules } from '../lib/rules'
import { cx, money } from '../lib/format'
import { CategoryBadge, Dialog, MoneyInput, PageHeader, useToast } from '../components/ui'
import { FIELD_LABEL, RuleDialog, type RuleDraft } from '../components/RuleDialog'

const PALETTE = ['#0d9488', '#10b981', '#22c55e', '#84cc16', '#eab308', '#f59e0b', '#f97316', '#ef4444', '#f43f5e', '#ec4899', '#d946ef', '#a855f7', '#8b5cf6', '#6366f1', '#3b82f6', '#0ea5e9', '#06b6d4', '#64748b']
const EMOJIS = ['🛒', '🧴', '🚆', '🚗', '⛽', '🏠', '💡', '📱', '🛡️', '🔁', '🍕', '☕', '🎨', '🎮', '📚', '🎓', '👕', '💇', '💊', '🏋️', '🏖️', '✈️', '🎁', '🎀', '🐶', '👶', '🐷', '🎯', '💼', '🪙', '✨', '💰', '🏦', '🧾', '🔧', '❤️']

export default function Categories({ data }: { data: AppData }) {
  const toast = useToast()
  const [editCat, setEditCat] = useState<Partial<Category> | null>(null)
  const [editGroup, setEditGroup] = useState<Partial<Group> | null>(null)
  const [ruleDraft, setRuleDraft] = useState<RuleDraft | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const usage = new Map<number, number>()
  for (const t of data.transactions) if (t.categoryId != null) usage.set(t.categoryId, (usage.get(t.categoryId) ?? 0) + 1)

  const move = async (list: Array<{ id?: number; sort: number }>, idx: number, dir: -1 | 1, table: 'groups' | 'categories') => {
    const j = idx + dir
    if (j < 0 || j >= list.length) return
    await db.transaction('rw', db.table(table), async () => {
      // Sortierung neu durchnummerieren, damit Tauschen immer funktioniert
      for (let i = 0; i < list.length; i++) {
        const sort = i === idx ? j : i === j ? idx : i
        await db.table(table).update(list[i].id!, { sort })
      }
    })
  }

  const deleteCategory = async (c: Category) => {
    const n = usage.get(c.id!) ?? 0
    if (!confirm(`Kategorie „${c.name}“ löschen?${n ? `\n${n} Buchung(en) verlieren ihre Kategorie.` : ''}\nZuweisungen und Regeln dieser Kategorie werden ebenfalls entfernt.`)) return
    await db.transaction('rw', [db.categories, db.transactions, db.assignments, db.rules], async () => {
      await db.transactions.where('categoryId').equals(c.id!).modify({ categoryId: null })
      await db.assignments.where('categoryId').equals(c.id!).delete()
      await db.rules.where('categoryId').equals(c.id!).delete()
      await db.categories.delete(c.id!)
    })
    toast({ text: 'Kategorie gelöscht.' })
  }

  const deleteGroup = async (g: Group) => {
    if (data.categories.some((c) => c.groupId === g.id)) {
      toast({ text: 'Die Gruppe enthält noch Kategorien. Verschiebe oder lösche sie zuerst.', tone: 'error' })
      return
    }
    await db.groups.delete(g.id!)
  }

  const section = (kind: CategoryKind) => {
    const groups = data.groups.filter((g) => g.kind === kind).sort((a, b) => a.sort - b.sort)
    return (
      <div className="space-y-4">
        {groups.map((g, gi) => {
          const cats = data.categories
            .filter((c) => c.groupId === g.id && (showArchived || !c.archived))
            .sort((a, b) => a.sort - b.sort)
          return (
            <div key={g.id} className="card overflow-hidden">
              <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
                <h3 className="flex-1 text-sm font-semibold text-slate-700">{g.name}</h3>
                <IconBtn title="Nach oben" onClick={() => move(groups, gi, -1, 'groups')}><ArrowUp size={14} /></IconBtn>
                <IconBtn title="Nach unten" onClick={() => move(groups, gi, 1, 'groups')}><ArrowDown size={14} /></IconBtn>
                <IconBtn title="Gruppe umbenennen" onClick={() => setEditGroup(g)}><Pencil size={14} /></IconBtn>
                <IconBtn title="Gruppe löschen" onClick={() => deleteGroup(g)}><Trash2 size={14} /></IconBtn>
              </div>
              <ul className="divide-y divide-slate-50">
                {cats.map((c, ci) => (
                  <li key={c.id} className={cx('flex items-center gap-3 px-4 py-2', c.archived && 'opacity-50')}>
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl text-base" style={{ backgroundColor: c.color + '22' }}>{c.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{c.name}</div>
                      <div className="text-xs text-slate-400">
                        {usage.get(c.id!) ?? 0} Buchungen
                        {c.goal > 0 && ` · Monatsziel ${money(c.goal)}`}
                        {c.archived && ' · archiviert'}
                      </div>
                    </div>
                    <IconBtn title="Nach oben" onClick={() => move(cats, ci, -1, 'categories')}><ArrowUp size={14} /></IconBtn>
                    <IconBtn title="Nach unten" onClick={() => move(cats, ci, 1, 'categories')}><ArrowDown size={14} /></IconBtn>
                    <IconBtn title="Bearbeiten" onClick={() => setEditCat(c)}><Pencil size={14} /></IconBtn>
                    <IconBtn title={c.archived ? 'Wiederherstellen' : 'Archivieren'} onClick={() => db.categories.update(c.id!, { archived: !c.archived })}>
                      {c.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                    </IconBtn>
                    <IconBtn title="Löschen" onClick={() => deleteCategory(c)}><Trash2 size={14} /></IconBtn>
                  </li>
                ))}
                <li>
                  <button
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-brand-700 hover:bg-brand-50/50"
                    onClick={() => setEditCat({ groupId: g.id, kind, color: PALETTE[(cats.length * 5) % PALETTE.length], icon: kind === 'income' ? '💰' : '🧾', goal: 0, archived: false, sort: cats.length })}
                  >
                    <Plus size={16} /> Kategorie hinzufügen
                  </button>
                </li>
              </ul>
            </div>
          )
        })}
        <button className="btn-outline w-full border-dashed" onClick={() => setEditGroup({ kind, sort: groups.length, name: '' })}>
          <FolderPlus size={16} /> Neue Gruppe ({kind === 'income' ? 'Einnahmen' : 'Ausgaben'})
        </button>
      </div>
    )
  }

  return (
    <>
      <PageHeader title="Kategorien & Regeln" subtitle="Ausgaben-Kategorien sind deine Budget-Umschläge. Einnahmen-Kategorien dienen der Auswertung.">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" className="accent-brand-600" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Archivierte zeigen
        </label>
      </PageHeader>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Ausgaben · Umschläge</h2>
          {section('expense')}
        </section>
        <section className="space-y-8">
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Einnahmen</h2>
            {section('income')}
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Automatische Regeln</h2>
              <div className="flex gap-2">
                {data.rules.length > 0 && (
                  <button className="btn-ghost text-xs" onClick={async () => {
                    const n = await applyRules(true)
                    toast({ text: n ? `${n} Buchung(en) kategorisiert.` : 'Keine neuen Treffer.' })
                  }}><Wand2 size={14} /> Jetzt anwenden</button>
                )}
                <button className="btn-primary py-1.5 text-xs" onClick={() => setRuleDraft({})}><Plus size={14} /> Regel</button>
              </div>
            </div>
            <div className="card overflow-hidden">
              {data.rules.length === 0 ? (
                <p className="p-5 text-sm text-slate-500">
                  Noch keine Regeln. Tipp: Wenn du in „Buchungen“ eine Kategorie wählst, bietet dir die App an, daraus eine Regel zu machen.
                  Regeln werden bei jedem Import automatisch angewendet.
                </p>
              ) : (
                <ul className="divide-y divide-slate-50">
                  {[...data.rules].sort((a, b) => b.createdAt - a.createdAt).map((r) => (
                    <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <div className="min-w-0 flex-1">
                        <span className="text-slate-500">{FIELD_LABEL[r.field]} enthält </span>
                        <b className="break-all">„{r.pattern}“</b>
                        {r.sign !== 0 && <span className="text-slate-400"> ({r.sign < 0 ? 'nur Ausgaben' : 'nur Einnahmen'})</span>}
                      </div>
                      <CategoryBadge category={data.catById.get(r.categoryId)} />
                      <IconBtn title="Bearbeiten" onClick={() => setRuleDraft(r)}><Pencil size={14} /></IconBtn>
                      <IconBtn title="Löschen" onClick={() => db.rules.delete(r.id!)}><Trash2 size={14} /></IconBtn>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="mt-2 px-1 text-xs text-slate-400">Bei mehreren Treffern gewinnt die neueste Regel.</p>
          </div>
        </section>
      </div>

      <CategoryDialog cat={editCat} onClose={() => setEditCat(null)} data={data} />
      <GroupDialog group={editGroup} onClose={() => setEditGroup(null)} />
      <RuleDialog draft={ruleDraft} onClose={() => setRuleDraft(null)} data={data} />
    </>
  )
}

function IconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button title={title} aria-label={title} onClick={onClick} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
      {children}
    </button>
  )
}

function CategoryDialog({ cat, onClose, data }: { cat: Partial<Category> | null; onClose: () => void; data: AppData }) {
  const [c, setC] = useState<Partial<Category>>({})
  const [prev, setPrev] = useState<Partial<Category> | null>(null)
  if (cat !== prev) {
    setPrev(cat)
    if (cat) setC(cat)
  }
  if (!cat) return null
  const groups = data.groups.filter((g) => g.kind === c.kind)
  const save = async () => {
    if (!c.name?.trim()) return
    const row = { ...c, name: c.name.trim() } as Category
    if (row.id) await db.categories.update(row.id, row)
    else await db.categories.add(row)
    onClose()
  }
  return (
    <Dialog open onClose={onClose} title={c.id ? 'Kategorie bearbeiten' : 'Neue Kategorie'}
      footer={<><button className="btn-ghost" onClick={onClose}>Abbrechen</button><button className="btn-primary" onClick={save} disabled={!c.name?.trim()}>Speichern</button></>}>
      <div className="space-y-4">
        <div className="flex items-end gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl" style={{ backgroundColor: (c.color ?? '#999') + '22' }}>{c.icon}</span>
          <div className="flex-1">
            <label className="label">Name</label>
            <input className="input" value={c.name ?? ''} onChange={(e) => setC({ ...c, name: e.target.value })} autoFocus onKeyDown={(e) => e.key === 'Enter' && save()} />
          </div>
        </div>
        <div>
          <label className="label">Gruppe</label>
          <select className="input" value={c.groupId} onChange={(e) => setC({ ...c, groupId: Number(e.target.value) })}>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Symbol</label>
          <div className="flex flex-wrap gap-1">
            {EMOJIS.map((e) => (
              <button key={e} onClick={() => setC({ ...c, icon: e })} className={cx('h-9 w-9 rounded-lg text-lg transition hover:bg-slate-100', c.icon === e && 'bg-brand-50 ring-2 ring-brand-500')}>{e}</button>
            ))}
            <input className="input h-9 w-16 text-center" value={c.icon ?? ''} onChange={(e) => setC({ ...c, icon: e.target.value })} title="Eigenes Emoji" />
          </div>
        </div>
        <div>
          <label className="label">Farbe</label>
          <div className="flex flex-wrap gap-1.5">
            {PALETTE.map((p) => (
              <button key={p} onClick={() => setC({ ...c, color: p })} className={cx('h-7 w-7 rounded-full transition', c.color === p && 'ring-2 ring-slate-800 ring-offset-2')} style={{ backgroundColor: p }} aria-label={p} />
            ))}
          </div>
        </div>
        {c.kind === 'expense' && (
          <div>
            <label className="label">Monatsziel (optional)</label>
            <MoneyInput value={c.goal ?? 0} onCommit={(v) => setC({ ...c, goal: v })} />
            <p className="mt-1 text-xs text-slate-400">Wie viel soll jeden Monat in diesen Umschlag? Wird für „Ziele zuweisen“ genutzt.</p>
          </div>
        )}
      </div>
    </Dialog>
  )
}

function GroupDialog({ group, onClose }: { group: Partial<Group> | null; onClose: () => void }) {
  const [name, setName] = useState('')
  const [prev, setPrev] = useState<Partial<Group> | null>(null)
  if (group !== prev) {
    setPrev(group)
    setName(group?.name ?? '')
  }
  if (!group) return null
  const save = async () => {
    if (!name.trim()) return
    if (group.id) await db.groups.update(group.id, { name: name.trim() })
    else await db.groups.add({ name: name.trim(), kind: group.kind!, sort: group.sort ?? 99 })
    onClose()
  }
  return (
    <Dialog open onClose={onClose} title={group.id ? 'Gruppe umbenennen' : 'Neue Gruppe'}
      footer={<><button className="btn-ghost" onClick={onClose}>Abbrechen</button><button className="btn-primary" onClick={save} disabled={!name.trim()}>Speichern</button></>}>
      <label className="label">Name</label>
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && save()} />
    </Dialog>
  )
}
