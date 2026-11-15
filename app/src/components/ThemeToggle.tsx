import { Monitor, Moon, Sun } from 'lucide-react'
import { setThemePref, useThemePref, type ThemePref } from '../lib/theme'
import { cx } from '../lib/format'

const OPTIONS: Array<[ThemePref, string, typeof Sun]> = [
  ['light', 'Hell', Sun],
  ['system', 'System', Monitor],
  ['dark', 'Dunkel', Moon],
]

/** Umschalter Hell / System / Dunkel. `compact` zeigt nur Symbole. */
export function ThemeToggle({ compact = false, className }: { compact?: boolean; className?: string }) {
  const pref = useThemePref()
  return (
    <div className={cx('seg', className)} role="radiogroup" aria-label="Farbmodus">
      {OPTIONS.map(([value, label, Icon]) => (
        <button
          key={value}
          role="radio"
          aria-checked={pref === value}
          data-active={pref === value}
          title={label}
          onClick={() => setThemePref(value)}
          className={cx('flex flex-1 items-center justify-center gap-1.5', compact && '!px-2')}
        >
          <Icon size={15} />
          {!compact && <span>{label}</span>}
        </button>
      ))}
    </div>
  )
}
