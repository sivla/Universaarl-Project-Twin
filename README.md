# Universaarl-Projektzwilling

Schreibgeschützte Anwendungshülle des Projektzwillings mit serverseitigem Projektverzeichnis. Produktiv sind die bestehende Blueprint-Sicht `universaarl` (`UABC`) und das Projekt `bc-basic` (`BCB`) registriert. Beide Einträge sind an dasselbe Blueprint-Repository gebunden; `bc-basic` löst Fachdaten ausschließlich über den technischen Vertrag `exports/project-data/v1/index.yaml` auf. Die Benutzeroberfläche erhält weder den absoluten Quellenpfad noch Dateipfade von Nachweisen.

## Verträge

- Kanonische Oberflächenrouten: `/projekte/:projektId/:bereich`
- Schreibgeschützte Programmierschnittstellen: `GET /api/projects`, `GET /api/projects/:projectId/state`, `GET /api/projects/:projectId/evidence/:evidenceId`
- `ProjectContext` bezeichnet das aktive Projekt des serverseitigen Verzeichnisses.
- `SourceSnapshot` bezeichnet die geladene vollständige Git-Commit-SHA samt Einlesezeit.
- `ProjectTimeContext` ist für spätere fachliche Wiedergabe- und Stichtagsfunktionen reserviert und hier nicht implementiert.
- Die Route `Arbeit` zeigt ausschließlich normalisierte Jira-Artefakte mit belegtem Typ, Status, Phase, Arbeitsstrom, Aufwand und Abhängigkeiten.
- Projektverlauf, Planung, Lieferung und Abrechnung zeigen nur Felder und Artefakte, die der jeweilige Projektvertrag ausdrücklich referenziert. Fehlende Quellen erscheinen als ehrlicher Leerzustand.

Nachweise werden nur über opake, projekt- und commitgebundene IDs ausgeliefert. Repository-relative Provenienz bleibt auf die ausdrücklich erlaubten sicheren Wurzelverzeichnisse begrenzt. Es gibt keine schreibende Programmierschnittstelle und keine historische Wiedergabe.

Die dargestellte Quelle ist eine durch die betreibende Person ausgewählte, commitgebundene Momentaufnahme. Ihre Auswahl allein bedeutet keine Freigabe. Solange keine erwartete Freigabe-SHA gebunden und geprüft ist, behauptet der Projektzwilling keinen freigegebenen Zustand.

## Lokal starten

1. `.env.example` nach `.env.local` kopieren und `UABC_SOURCE_REPO` auf eine durch die betreibende Person ausgewählte, commitgebundene und schreibgeschützte Blueprint-Momentaufnahme setzen.
2. `npm ci`
3. `npm --silent run test:german`
4. `npm run check`
5. `npm run dev`
6. `http://127.0.0.1:4173/projekte/universaarl/aktueller-stand` öffnen.

Die neue Arbeitsansicht ist unter `http://127.0.0.1:4173/projekte/bc-basic/arbeit` erreichbar. Der Projekt-Twin berechnet weder Termine noch Aufwand oder Rechnungen und besitzt keine schreibende Route. Nicht im Quellenvertrag belegte Meeting-, Planungs-, Dokumentations- oder Abrechnungsdaten werden nicht ergänzt.
