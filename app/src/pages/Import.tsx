import { useRef, useState } from 'react'
import { Upload, FileText, CheckCircle2, Copy, Clock, Undo2, ShieldCheck } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { AppData } from '../lib/hooks'
import { navigate } from '../lib/hooks'
import { db } from '../lib/db'
import { parseBankCsv, type ParseResult } from '../lib/csv'
import { importParsed } from '../lib/store'
import { cx, fmtDate, money } from '../lib/format'
import { Dialog, PageHeader, useToast } from '../components/ui'

interface Preview {
  fileName: string
  parsed: ParseResult
  duplicates: number
}

export default function ImportPage({ data }: { data: AppData }) {
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const [previews, setPreviews] = useState<Preview[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [undoId, setUndoId] = useState<number | null>(null)
  const imports = useLiveQuery(() => db.imports.orderBy('importedAt').reverse().toArray(), []) ?? []

  const readFiles = async (files: FileList | File[]) => {
    setError(null)
    const out: Preview[] = []
    for (const f of Array.from(files)) {
      try {
        const buf = await f.arrayBuffer()
        // DKB liefert UTF-8; ältere Exporte sind teils ISO-8859-1
        let text = new TextDecoder('utf-8').decode(buf)
        if (text.includes('�')) text = new TextDecoder('iso-8859-1').decode(buf)
        const parsed = parseBankCsv(text)
        const existing = await db.transactions.bulkGet(parsed.transactions.map((t) => t.id))
        out.push({ fileName: f.name, parsed, duplicates: existing.filter(Boolean).length })
      } catch (e) {
        setError(`${f.name}: ${(e as Error).message}`)
      }
    }
    setPreviews(out)
  }

  const confirmImport = async () => {
    setBusy(true)
    try {
      let added = 0, skipped = 0, auto = 0
      for (const p of previews) {
        const r = await importParsed(p.parsed, p.fileName)
        added += r.added
        skipped += r.skipped
        auto += r.autoCategorized
      }
      toast({
        text: `${added} neue Buchung(en) importiert${skipped ? `, ${skipped} Duplikate übersprungen` : ''}${auto ? `, ${auto} automatisch kategorisiert` : ''}.`,
        action: added - auto > 0 ? { label: 'Kategorisieren', run: () => navigate('buchungen', { cat: 'none' }) } : undefined,
      })
      setPreviews([])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const undoImport = async (id: number) => {
    await db.transaction('rw', [db.transactions, db.assignments, db.imports], async () => {
      const ids = await db.transactions.where('importId').equals(id).primaryKeys()
      await db.assignments.where('txId').anyOf(ids).delete()
      await db.transactions.bulkDelete(ids)
      await db.imports.delete(id)
    })
    toast({ text: 'Import rückgängig gemacht.' })
    setUndoId(null)
  }

  return (
    <>
      <PageHeader title="Import" subtitle="Kontoauszüge als CSV einlesen. Doppelte Buchungen werden automatisch erkannt." />

      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); readFiles(e.dataTransfer.files) }}
        onClick={() => input.current?.click()}
        className={cx(
          'card flex cursor-pointer flex-col items-center justify-center border-2 border-dashed px-6 py-14 text-center transition',
          drag ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-brand-300 hover:bg-brand-50/30',
        )}
      >
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/20">
          <Upload size={24} />
        </div>
        <div className="font-semibold">CSV-Datei hierher ziehen oder klicken</div>
        <div className="mt-1 text-sm text-slate-500">DKB-Umsatzliste (z. B. „Umsatzliste_Girokonto…csv“) · mehrere Dateien möglich</div>
        <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
          <ShieldCheck size={14} /> Die Datei wird nur in deinem Browser verarbeitet
        </div>
        <input ref={input} type="file" accept=".csv,text/csv" multiple hidden onChange={(e) => { if (e.target.files) readFiles(e.target.files); e.target.value = '' }} />
      </div>

      {error && <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {previews.length > 0 && (
        <div className="card mt-6 p-5">
          <h2 className="mb-4 font-semibold">Vorschau</h2>
          <div className="space-y-3">
            {previews.map((p) => {
              const fresh = p.parsed.transactions.length - p.duplicates
              const sumIn = p.parsed.transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
              const sumOut = p.parsed.transactions.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0)
              return (
                <div key={p.fileName} className="rounded-2xl border border-slate-100 p-4">
                  <div className="flex items-start gap-3">
                    <FileText className="mt-0.5 shrink-0 text-brand-600" size={20} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{p.fileName}</div>
                      <div className="text-xs text-slate-500">
                        {p.parsed.accountName && `${p.parsed.accountName} · `}
                        {p.parsed.periodFrom && `${fmtDate(p.parsed.periodFrom)} – ${fmtDate(p.parsed.periodTo)}`}
                        {p.parsed.balance && ` · Kontostand ${money(p.parsed.balance.amount)}`}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                    <Pill icon={<CheckCircle2 size={14} />} tone="emerald" label="Neu" value={fresh} />
                    <Pill icon={<Copy size={14} />} tone="slate" label="Schon vorhanden" value={p.duplicates} />
                    <Pill icon={<Clock size={14} />} tone="amber" label="Vorgemerkt (übersprungen)" value={p.parsed.pendingCount} />
                    <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs">
                      <div className="num text-emerald-600">+{money(sumIn)}</div>
                      <div className="num text-rose-600">{money(sumOut)}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {previews.some((p) => p.parsed.pendingCount > 0) && (
            <p className="mt-3 text-xs text-slate-500">Vorgemerkte Umsätze können sich noch ändern und werden erst importiert, wenn sie gebucht sind (beim nächsten Import).</p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setPreviews([])}>Abbrechen</button>
            <button className="btn-primary" disabled={busy || previews.every((p) => p.parsed.transactions.length === p.duplicates)} onClick={confirmImport}>
              {busy ? 'Importiere …' : `${previews.reduce((s, p) => s + p.parsed.transactions.length - p.duplicates, 0)} Buchungen importieren`}
            </button>
          </div>
        </div>
      )}

      <h2 className="mb-3 mt-8 font-semibold">Bisherige Importe</h2>
      {imports.length === 0 ? (
        <p className="text-sm text-slate-500">Noch nichts importiert.</p>
      ) : (
        <div className="card divide-y divide-slate-50">
          {imports.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <FileText size={18} className="text-slate-400" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{i.fileName}</div>
                <div className="text-xs text-slate-500">
                  {new Date(i.importedAt).toLocaleString('de-DE')} · {i.added} neu · {i.skipped} Duplikate
                  {i.periodFrom && ` · ${fmtDate(i.periodFrom)} – ${fmtDate(i.periodTo)}`}
                </div>
              </div>
              {i.added > 0 && (
                <button className="btn-ghost text-xs" onClick={() => setUndoId(i.id!)}><Undo2 size={14} /> Rückgängig</button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 rounded-2xl bg-slate-100/70 p-4 text-xs leading-relaxed text-slate-500">
        <b className="text-slate-600">So funktioniert die Duplikaterkennung:</b> Aus Datum, Wertstellung, Betrag, Zahler, Empfänger,
        Verwendungszweck, IBAN und Referenzen wird ein Fingerabdruck berechnet. Kommt eine Buchung mehrfach identisch vor (z. B. zweimal
        5 € am selben Tag beim selben Laden), werden diese durchnummeriert und bleiben erhalten. Du kannst also beliebig oft ganze Jahre
        importieren: Bereits bekannte Buchungen werden übersprungen. Aktueller Bestand: {data.transactions.length} Buchungen.
      </div>

      <Dialog open={undoId != null} onClose={() => setUndoId(null)} title="Import rückgängig machen?"
        footer={<><button className="btn-ghost" onClick={() => setUndoId(null)}>Abbrechen</button><button className="btn-danger" onClick={() => undoImport(undoId!)}>Rückgängig machen</button></>}>
        <p className="text-sm text-slate-600">Alle mit diesem Import hinzugefügten Buchungen werden gelöscht, inklusive ihrer Kategorisierung und der Verteilung von Einnahmen.</p>
      </Dialog>
    </>
  )
}

function Pill({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: 'emerald' | 'slate' | 'amber' }) {
  const tones = { emerald: 'bg-emerald-50 text-emerald-700', slate: 'bg-slate-50 text-slate-600', amber: 'bg-amber-50 text-amber-700' }
  return (
    <div className={cx('rounded-xl px-3 py-2', tones[tone])}>
      <div className="flex items-center gap-1.5 text-xs">{icon}{label}</div>
      <div className="num text-lg font-semibold">{value}</div>
    </div>
  )
}
