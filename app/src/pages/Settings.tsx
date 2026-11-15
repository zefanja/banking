import { useRef, useState } from 'react'
import { Download, Upload, Trash2, ShieldCheck, Info } from 'lucide-react'
import type { AppData } from '../lib/hooks'
import { exportBackup, restoreBackup, wipeAll } from '../lib/store'
import { fmtDate, money } from '../lib/format'
import { Dialog, MoneyInput, PageHeader, useToast } from '../components/ui'
import { setMeta } from '../lib/db'
import { ThemeToggle } from '../components/ThemeToggle'

export default function SettingsPage({ data }: { data: AppData }) {
  const toast = useToast()
  const file = useRef<HTMLInputElement>(null)
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [wipeText, setWipeText] = useState('')

  const restore = async (f: File) => {
    if (!confirm('Alle aktuellen Daten werden durch die Sicherung ersetzt. Fortfahren?')) return
    try {
      await restoreBackup(f)
      toast({ text: 'Sicherung wiederhergestellt.' })
    } catch (e) {
      toast({ text: (e as Error).message, tone: 'error' })
    }
  }

  return (
    <>
      <PageHeader title="Einstellungen" subtitle="Datensicherung und Informationen" />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-semibold">Darstellung</div>
              <p className="text-sm text-slate-500">„System“ folgt automatisch der Einstellung deines Geräts.</p>
            </div>
            <ThemeToggle />
          </div>
        </div>
        <div className="card p-5">
          <div className="mb-3 flex items-center gap-2 font-semibold"><ShieldCheck size={18} className="text-emerald-600" /> Datenschutz</div>
          <p className="text-sm leading-relaxed text-slate-600">
            Alle Daten liegen ausschließlich in der lokalen Datenbank (IndexedDB) dieses Browsers. Es gibt keinen Server, kein Konto und
            keine Verbindung ins Internet. Die App lädt auch keine externen Schriften oder Skripte.
          </p>
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
            Wichtig: Löschst du die Browserdaten für <b>{location.host}</b>, sind die Daten weg. Erstelle deshalb regelmäßig eine Sicherung.
            Nutze die App immer im selben Browser und unter derselben Adresse.
          </p>
        </div>

        <div className="card p-5">
          <div className="mb-3 font-semibold">Sicherung</div>
          <p className="mb-4 text-sm text-slate-600">Exportiert alle Buchungen, Kategorien, Regeln und Budgets als JSON-Datei.</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={exportBackup}><Download size={16} /> Sicherung herunterladen</button>
            <button className="btn-outline" onClick={() => file.current?.click()}><Upload size={16} /> Wiederherstellen</button>
            <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = '' }} />
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-3 flex items-center gap-2 font-semibold"><Info size={18} className="text-brand-600" /> Kontostand & Anfangssaldo</div>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-slate-500">Bekannter Kontostand</dt>
            <dd className="num text-right">{data.anchor ? `${money(data.anchor.amount)} (${fmtDate(data.anchor.date)})` : '–'}</dd>
            <dt className="text-slate-500">Anfangssaldo vor 1. Buchung</dt>
            <dd className="num text-right">{money(data.startBalance)}</dd>
            <dt className="text-slate-500">Berechneter Kontostand</dt>
            <dd className="num text-right font-semibold">{money(data.balance)}</dd>
            <dt className="text-slate-500">Buchungen gesamt</dt>
            <dd className="num text-right">{data.transactions.length}</dd>
          </dl>
          <p className="mt-3 text-xs text-slate-500">
            Der Anfangssaldo ergibt sich aus einem bekannten Kontostand abzüglich aller Buchungen bis zu diesem Tag und fließt einmalig in
            „Zu verteilen“ ein. CSV-Dateien liefern den Kontostand automatisch, PDF-Exporte nicht. Trage ihn dann hier ein.
          </p>
          <BalanceEditor data={data} onSaved={() => toast({ text: 'Kontostand gespeichert.' })} />
        </div>

        <div className="card border-rose-200 p-5">
          <div className="mb-3 font-semibold text-rose-700">Gefahrenzone</div>
          <p className="mb-4 text-sm text-slate-600">Löscht alle Daten unwiderruflich aus diesem Browser.</p>
          <button className="btn-danger" onClick={() => setConfirmWipe(true)}><Trash2 size={16} /> Alle Daten löschen</button>
        </div>
      </div>

      <Dialog open={confirmWipe} onClose={() => setConfirmWipe(false)} title="Wirklich alles löschen?"
        footer={<><button className="btn-ghost" onClick={() => setConfirmWipe(false)}>Abbrechen</button><button className="btn-danger" disabled={wipeText !== 'LÖSCHEN'} onClick={wipeAll}>Endgültig löschen</button></>}>
        <p className="mb-3 text-sm text-slate-600">Alle Buchungen, Kategorien, Regeln und Budgets werden gelöscht. Tippe <b>LÖSCHEN</b> zur Bestätigung.</p>
        <input className="input" value={wipeText} onChange={(e) => setWipeText(e.target.value)} autoFocus />
      </Dialog>
    </>
  )
}

/** Kontostand zu einem Stichtag manuell setzen (z. B. aus der Banking-App ablesen). */
function BalanceEditor({ data, onSaved }: { data: AppData; onSaved: () => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(data.anchor?.date ?? data.transactions[0]?.date ?? today)
  const [amount, setAmount] = useState(data.anchor?.amount ?? data.balance)
  return (
    <div className="mt-4 rounded-xl bg-slate-50 p-3">
      <div className="mb-2 text-xs font-medium text-slate-600">Kontostand manuell eintragen</div>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label">Stand am (Ende des Tages)</label>
          <input type="date" className="input py-1.5" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="w-36">
          <label className="label">Betrag</label>
          <MoneyInput value={amount} onCommit={setAmount} />
        </div>
        <button className="btn-primary py-1.5" disabled={!date} onClick={async () => { await setMeta('balanceAnchor', { date, amount }); onSaved() }}>
          Speichern
        </button>
      </div>
    </div>
  )
}
