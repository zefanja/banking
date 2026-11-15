# Haushaltsbuch

Lokale Web-App zur Auswertung und Kategorisierung von Kontoauszügen (DKB-CSV) mit Envelope Budgeting nach YNAB-Art.
Alle Daten bleiben im Browser (IndexedDB). Es gibt keinen Server und keine Internetverbindung.

## Starten

```bash
pnpm install     # einmalig
pnpm start       # baut die App und öffnet sie unter http://localhost:5199
# oder für die Entwicklung:
pnpm dev
```

**Wichtig:** Die Daten hängen an der Adresse `http://localhost:5199` und am Browser. Nutze also immer denselben Browser
und denselben Port. Unter *Einstellungen → Sicherung* kannst du regelmäßig ein JSON-Backup herunterladen.

## Hosting auf GitHub Pages

Der Workflow `.github/workflows/deploy.yml` baut die App bei jedem Push auf `main` und veröffentlicht sie auf GitHub Pages.
Einmalig nötig: *Settings → Pages → Build and deployment → Source: **GitHub Actions***.

Auch die gehostete Version verarbeitet alles nur im Browser. Es werden nur die Programmdateien ausgeliefert, deine Buchungen
verlassen nie dein Gerät. Die Daten unter `github.io` sind aber getrennt von denen unter `localhost:5199`. Zum Umziehen nutzt du
*Einstellungen → Sicherung herunterladen* und dort dann *Wiederherstellen*.

CSV-Dateien und Backups sind per `.gitignore` vom Commit ausgeschlossen.

## Als App installieren (PWA)

Die App ist eine Progressive Web App: Sie lässt sich auf dem Startbildschirm installieren und startet danach auch offline.

- **iPhone/iPad (Safari):** Teilen → *Zum Home-Bildschirm*
- **Android (Chrome):** Menü → *App installieren*
- **Desktop (Chrome/Edge):** Installations-Symbol in der Adressleiste

Der Service Worker (`sw.js`) wird beim Build erzeugt und speichert alle Programmdateien vorab. Updates kommen beim nächsten
Start mit Internetverbindung automatisch an. Die Icons liegen unter `public/icons/` (Vorlage: `public/icons/icon.svg`).

## Funktionen

- **Import** von DKB-Umsatzlisten als CSV (Online-Banking) oder als PDF-Export aus der DKB-App, auch mehrere Dateien gleichzeitig.
  Bereits importierte Buchungen werden über Buchungsdatum, Betrag, IBAN und Gegenseite erkannt und übersprungen, auch wenn sie
  zuvor im jeweils anderen Format importiert wurden. Die PDF enthält keinen Kontostand. Den trägst du dann einmalig unter
  *Einstellungen* ein. Vorgemerkte Umsätze werden erst nach der Buchung übernommen. Jeder Import lässt sich
  rückgängig machen.
- **Kategorien** in Gruppen, mit Emoji, Farbe und optionalem Monatsziel. Ausgaben-Kategorien sind die Budget-Umschläge.
- **Regeln** („Empfänger enthält ROSSMANN → Drogerie“) werden bei jedem Import automatisch angewendet. Wenn du eine Buchung
  kategorisierst, schlägt die App vor, daraus eine Regel zu machen.
- **Budget (YNAB-Prinzip):** Einnahmen landen in „Zu verteilen“. Jede Einnahme lässt sich gezielt auf Umschläge verteilen.
  Reste und Überzüge werden in den Folgemonat übertragen. Geld lässt sich zwischen Umschlägen verschieben, überzogene Umschläge
  gleichst du per Klick aus. Außerdem gibt es „Wie Vormonat“ und „Ziele zuweisen“.
- **Auswertung** nach Woche, Monat oder Jahr: Einnahmen, Ausgaben, Saldo und Sparquote, gestapelt nach Kategorien,
  Verteilung als Donut sowie Tabellen.

## Technik

Vite, React, TypeScript, Tailwind CSS v4, Dexie (IndexedDB) und Recharts.

- `src/lib/csv.ts`: CSV-Parser und Duplikat-Fingerabdruck
- `src/lib/pdf.ts`: PDF-Parser (pdf.js, lokal eingebunden)
- `src/lib/budget.ts`: Budgetberechnung (Zu verteilen, Übertrag, Verfügbar)
- `src/lib/store.ts`: Import, Zuweisungen, Backup
