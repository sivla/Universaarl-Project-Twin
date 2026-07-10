# Universaarl Project Twin

Schreibgeschützte Project-Twin-App-Shell mit serverseitiger Projektregistry. Produktiv ist ausschließlich `universaarl` (`UABC`, Anzeigename `Universaarl`) registriert. Der Browser erhält weder den absoluten Quellenpfad noch Dateipfade von Nachweisen.

## Verträge

- Kanonische UI-Routen: `/projekte/:projektId/:bereich`
- Schreibgeschützte APIs: `GET /api/projects`, `GET /api/projects/:projectId/state`, `GET /api/projects/:projectId/evidence/:evidenceId`
- `ProjectContext` bezeichnet das aktive Registry-Projekt.
- `SourceSnapshot` bezeichnet den geladenen vollständigen Git-Commit samt Einlesezeit.
- `ProjectTimeContext` ist für spätere fachliche Replay-/Stichtagsfunktionen reserviert und hier nicht implementiert.

Nachweise werden nur über opake, projektgebundene IDs ausgeliefert. Repository-relative Provenienz bleibt auf die vorhandenen Safe-Roots begrenzt. Es gibt keine Schreib-API.

## Lokal starten

1. `.env.example` nach `.env.local` kopieren und `UABC_SOURCE_REPO` auf eine freigegebene, eingefrorene Blueprint-Momentaufnahme setzen.
2. `npm ci`
3. `npm run check`
4. `npm run dev`
5. `http://127.0.0.1:4173/projekte/universaarl/aktueller-stand` öffnen.

Projektverlauf, historische Wiedergabe, Tafeln, Sprints, Gantt, Kalender und Abrechnung sind bewusste Nicht-Ziele dieser Änderung und erscheinen als ehrliche deutsche Nicht-unterstützt-Zustände.
