import { useSyncExternalStore } from 'react'

export type ThemePref = 'system' | 'light' | 'dark'

const KEY = 'hb:theme'
const media = () => window.matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set<() => void>()

function readPref(): ThemePref {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '"system"')
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

function resolve(pref: ThemePref) {
  return pref === 'dark' || (pref === 'system' && media().matches)
}

/** Setzt die Klasse "dark" auf <html>. Wird auch beim Start aufgerufen. */
export function applyTheme() {
  const dark = resolve(readPref())
  document.documentElement.classList.toggle('dark', dark)
  listeners.forEach((l) => l())
}

export function setThemePref(pref: ThemePref) {
  try {
    localStorage.setItem(KEY, JSON.stringify(pref))
  } catch {
    /* ignorieren */
  }
  applyTheme()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  const m = media()
  const onChange = () => applyTheme()
  m.addEventListener('change', onChange)
  return () => {
    listeners.delete(cb)
    m.removeEventListener('change', onChange)
  }
}

export function useThemePref() {
  return useSyncExternalStore(subscribe, readPref)
}

/** true, wenn gerade der dunkle Modus aktiv ist. */
export function useIsDark() {
  return useSyncExternalStore(subscribe, () => document.documentElement.classList.contains('dark'))
}
