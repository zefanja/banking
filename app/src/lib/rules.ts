import { db, type Rule, type Transaction } from './db'

export function ruleMatches(rule: Rule, t: Pick<Transaction, 'counterparty' | 'purpose' | 'iban' | 'amount'>) {
  if (rule.sign === -1 && t.amount >= 0) return false
  if (rule.sign === 1 && t.amount < 0) return false
  const p = rule.pattern.trim().toLowerCase()
  if (!p) return false
  const hay = {
    counterparty: t.counterparty,
    purpose: t.purpose,
    iban: t.iban,
    any: `${t.counterparty} ${t.purpose} ${t.iban}`,
  }[rule.field].toLowerCase()
  return hay.includes(p)
}

/** Erste passende Regel (neueste zuerst – spezifischere Regeln werden meist später angelegt). */
export function findCategory(rules: Rule[], t: Pick<Transaction, 'counterparty' | 'purpose' | 'iban' | 'amount'>) {
  const sorted = [...rules].sort((a, b) => b.createdAt - a.createdAt)
  return sorted.find((r) => ruleMatches(r, t))?.categoryId ?? null
}

/** Regeln auf alle (bzw. nur unkategorisierte) Buchungen anwenden. Gibt die Anzahl Änderungen zurück. */
export async function applyRules(onlyUncategorized = true) {
  const rules = await db.rules.toArray()
  if (!rules.length) return 0
  const sorted = [...rules].sort((a, b) => b.createdAt - a.createdAt)
  return db.transaction('rw', db.transactions, async () => {
    const all = await db.transactions.toArray()
    const updates: Array<{ key: string; changes: { categoryId: number } }> = []
    for (const t of all) {
      if (onlyUncategorized && t.categoryId != null) continue
      const cat = sorted.find((r) => ruleMatches(r, t))?.categoryId ?? null
      if (cat != null && cat !== t.categoryId) updates.push({ key: t.id, changes: { categoryId: cat } })
    }
    // Eine Massenänderung statt vieler Einzel-Updates (sonst friert die Oberfläche ein)
    if (updates.length) await db.transactions.bulkUpdate(updates)
    return updates.length
  })
}
