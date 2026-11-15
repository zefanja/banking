import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from 'recharts'
import { money, moneyShort } from '../lib/format'
import { useIsDark } from '../lib/theme'

export const COLORS = {
  income: '#10b981',
  expense: '#f43f5e',
  net: '#0f766e',
  grid: '#e2e8f0',
  axis: '#94a3b8',
  uncategorized: '#cbd5e1',
}

const axisProps = {
  tick: { fill: COLORS.axis, fontSize: 12 },
  axisLine: false,
  tickLine: false,
} as const

/** Rasterlinien, Hover-Fläche und Saldo-Linie passend zum Farbmodus. */
function useChartTheme() {
  const dark = useIsDark()
  return dark
    ? { grid: '#263246', cursor: '#1e293b', net: '#2dd4bf', legend: '#cbd5e1' }
    : { grid: COLORS.grid, cursor: '#f1f5f9', net: COLORS.net, legend: '#475569' }
}

function TooltipBox({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-slate-200 bg-surface/95 px-3 py-2 text-sm shadow-lg backdrop-blur">
      {label && <div className="mb-1 font-medium text-slate-700">{label}</div>}
      {payload.filter((p) => p.value !== 0).map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-2 text-slate-500">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="num font-medium text-slate-800">{money(p.value * 100)}</span>
        </div>
      ))}
    </div>
  )
}

/** Einnahmen vs. Ausgaben als Balken, Saldo als Linie. Werte in Euro (nicht Cent). */
export function IncomeExpenseChart({ data, height = 300 }: { data: Array<{ label: string; Einnahmen: number; Ausgaben: number; Saldo: number }>; height?: number }) {
  const t = useChartTheme()
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }} barGap={2}>
        <CartesianGrid stroke={t.grid} vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" {...axisProps} minTickGap={8} />
        <YAxis {...axisProps} width={64} tickFormatter={(v) => moneyShort(v * 100)} />
        <Tooltip content={<TooltipBox />} cursor={{ fill: t.cursor }} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        <Bar dataKey="Einnahmen" fill={COLORS.income} radius={[6, 6, 0, 0]} maxBarSize={28} animationDuration={500} />
        <Bar dataKey="Ausgaben" fill={COLORS.expense} radius={[6, 6, 0, 0]} maxBarSize={28} animationDuration={500} />
        <Line dataKey="Saldo" type="monotone" stroke={t.net} strokeWidth={2.5} dot={false} animationDuration={500} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/** Gestapelte Balken je Kategorie. */
export function StackedCategoryChart({
  data, series, height = 320,
}: {
  data: Array<Record<string, number | string>>
  series: Array<{ key: string; name: string; color: string }>
  height?: number
}) {
  const t = useChartTheme()
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={t.grid} vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" {...axisProps} minTickGap={8} />
        <YAxis {...axisProps} width={64} tickFormatter={(v) => moneyShort(v * 100)} />
        <Tooltip content={<TooltipBox />} cursor={{ fill: t.cursor }} />
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} stackId="a" fill={s.color} maxBarSize={36} animationDuration={500}
            radius={i === series.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

export function Donut({ data, height = 260, centerLabel, centerValue }: { data: Array<{ name: string; value: number; color: string }>; height?: number; centerLabel?: string; centerValue?: string }) {
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip content={<TooltipBox />} />
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={2} stroke="none" cornerRadius={4} isAnimationActive={false}>
            {data.map((d) => <Cell key={d.name} fill={d.color} />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {centerValue && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-xs text-slate-500">{centerLabel}</div>
          <div className="num text-lg font-semibold">{centerValue}</div>
        </div>
      )}
    </div>
  )
}
