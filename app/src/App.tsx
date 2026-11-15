import { useState } from 'react'
import {
  LayoutDashboard, Mail, ListOrdered, BarChart3, Tags, Upload, Settings, Menu, X, Wallet,
} from 'lucide-react'
import { useData, useHashRoute } from './lib/hooks'
import { cx, money } from './lib/format'
import { ThemeToggle } from './components/ThemeToggle'
import Dashboard from './pages/Dashboard'
import Budget from './pages/Budget'
import Transactions from './pages/Transactions'
import Analysis from './pages/Analysis'
import Categories from './pages/Categories'
import ImportPage from './pages/Import'
import SettingsPage from './pages/Settings'

const NAV = [
  { path: 'uebersicht', label: 'Übersicht', icon: LayoutDashboard },
  { path: 'budget', label: 'Budget', icon: Mail },
  { path: 'buchungen', label: 'Buchungen', icon: ListOrdered },
  { path: 'auswertung', label: 'Auswertung', icon: BarChart3 },
  { path: 'kategorien', label: 'Kategorien & Regeln', icon: Tags },
  { path: 'import', label: 'Import', icon: Upload },
  { path: 'einstellungen', label: 'Einstellungen', icon: Settings },
]

export default function App() {
  const data = useData()
  const route = useHashRoute()
  const [mobileOpen, setMobileOpen] = useState(false)
  const uncategorized = data.transactions.filter((t) => t.categoryId == null).length

  const page = (() => {
    if (!data.ready) return <div className="p-10 text-slate-400">Lade Daten …</div>
    switch (route.path) {
      case 'budget': return <Budget data={data} />
      case 'buchungen': return <Transactions data={data} params={route.params} />
      case 'auswertung': return <Analysis data={data} />
      case 'kategorien': return <Categories data={data} />
      case 'import': return <ImportPage data={data} />
      case 'einstellungen': return <SettingsPage data={data} />
      default: return <Dashboard data={data} />
    }
  })()

  const nav = (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ path, label, icon: Icon }) => {
        const active = route.path === path
        return (
          <a
            key={path}
            href={`#/${path}`}
            onClick={() => setMobileOpen(false)}
            className={cx(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
              active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
            )}
          >
            <Icon size={18} className={active ? 'text-brand-600' : 'text-slate-400'} />
            <span className="flex-1">{label}</span>
            {path === 'buchungen' && uncategorized > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">{uncategorized}</span>
            )}
          </a>
        )
      })}
    </nav>
  )

  const brand = (
    <div className="flex items-center gap-3 px-2">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#14b8a6] to-[#0f766e] text-white shadow-md shadow-brand-600/20">
        <Wallet size={20} />
      </div>
      <div>
        <div className="font-semibold leading-tight text-slate-900">Haushaltsbuch</div>
        <div className="text-xs text-slate-500">100 % lokal</div>
      </div>
    </div>
  )

  return (
    <div className="flex h-full">
      {/* Sidebar Desktop */}
      <aside className="hidden w-64 shrink-0 flex-col gap-8 border-r border-slate-200/70 bg-surface/70 p-4 backdrop-blur lg:flex">
        {brand}
        {nav}
        <ThemeToggle compact className="mt-auto flex" />
        <div className="-mt-5 rounded-2xl bg-gradient-to-br from-brand-50 to-emerald-50 p-4">
          <div className="text-xs font-medium text-brand-700">Kontostand</div>
          <div className="num mt-1 text-xl font-semibold text-slate-900">{money(data.balance)}</div>
          <div className="mt-1 text-xs text-slate-500">laut importierten Buchungen</div>
        </div>
      </aside>

      {/* Mobile */}
      <div className="fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-surface/90 px-4 py-3 backdrop-blur lg:hidden">
        {brand}
        <button className="btn-ghost p-2" onClick={() => setMobileOpen((v) => !v)} aria-label="Menü">
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {mobileOpen && (
        <div className="fixed inset-x-0 top-[65px] z-40 border-b border-slate-200 bg-surface p-3 shadow-lg lg:hidden">
          {nav}
          <ThemeToggle className="mt-3 flex" />
        </div>
      )}

      <main className="flex-1 overflow-y-auto pt-[65px] lg:pt-0">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{page}</div>
      </main>
    </div>
  )
}
