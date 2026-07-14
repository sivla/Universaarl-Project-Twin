# Mitwirken

Danke für das Interesse am Universaarl Project Twin.

## Arbeitsweise

- Erstelle Änderungen auf einem klar benannten `codex/...`-Arbeitszweig.
- Bewahre die read-only Grenze: keine Rückschreibung in Kundeninstanzen und keine ungeprüften Snapshotdaten.
- Nutzerseitig sichtbare Texte, Fehlermeldungen und Barrierefreiheitstexte werden natürlich deutsch formuliert.
- Verträge, Sicherheitsregeln und größere Vorhaben werden im bestehenden OpenSpec-Ablauf dokumentiert.
- Reiche keine Secrets, realen Kundendaten, Browserprofile, Authentifizierungszustände oder nicht positivgelistete Evidence ein.

## Lokale Prüfung

```sh
npm ci
npm run check
```

Zusätzlich müssen `REVIEW.md` in Arbeitskopie und Commit leer sein. Plattformabhängige Nachweise dürfen nur als bestanden bezeichnet werden, wenn sie auf der jeweiligen Plattform tatsächlich ausgeführt wurden.

## Beiträge

Beschreibe Problem, fachlichen Nutzen, Sicherheitsgrenzen und ausgeführte Prüfungen nachvollziehbar. Ein Beitrag darf keine neue fachliche Kundenwahrheit im Twin erfinden; die Kundeninstanz und ihr validierter Snapshot bleiben Source of Truth.
