# Anforderungen

## Registry und Projektisolation

Die serverseitige Registry MUSS typisiert, validiert und eindeutig sein und produktiv exakt `universaarl` / `UABC` / `Universaarl` enthalten. Der Client DARF nur ID, Key und Name erhalten.

Akzeptanz: Ungültige, doppelte, unbekannte und traversalartige Projekt-IDs werden ohne Quellenzugriff abgelehnt; es gibt keinen Universaarl-Fallback.

## Projektgebundene schreibgeschützte APIs

Der Server MUSS ausschließlich `GET /api/projects`, `GET /api/projects/:projectId/state` und `GET /api/projects/:projectId/evidence/:evidenceId` bereitstellen. Fehler MÜSSEN sicher und nicht verfügbare Quelle von nicht gefundenem Projekt unterscheidbar machen.

Akzeptanz: Alte ungescopte Datenrouten liefern 404; unbekannte Projekte liefern 404 vor Adapterzugriff; der SourceSnapshot enthält eine vollständige 40-stellige SHA.

## Nachweise und Provenienz

Nachweise MÜSSEN im Client ausschließlich über opake projektgebundene IDs adressiert werden. Repository-relative Provenienz DARF nur innerhalb der vorhandenen Safe-Roots liegen und keine Traversal-, URI-, Laufwerks-, UNC- oder sensitiven Segmente enthalten.

Akzeptanz: Zustand, DOM und Fehler enthalten keine Quellenwurzel- oder Nachweisdateipfade. Unbekannte Nachweis-IDs und Symlink-Ausbrüche werden abgelehnt. Verification-Gates bleiben Nachweise.

## Navigation und Momentaufnahme-Semantik

Die Shell MUSS die sieben kanonischen Routen unter `/projekte/:projektId/:bereich` unterstützen. „Aktueller Stand“ MUSS als Momentaufnahme des SourceSnapshot erklärt werden und DARF keine Chronologie oder Replay-Semantik zeigen.

Akzeptanz: Direktaufruf, Reload, Zurück und Vorwärts funktionieren. Unbekanntes Projekt oder Bereich zeigt einen deutschen sicheren Zustand. `asOf` und `stichtag` lösen keine Filterung aus.

## Responsive deutsche Shell

Desktop, Tablet und Mobilansicht MÜSSEN aktive Projekt- und Bereichskontexte zeigen. Das mobile „Mehr“-Menü MUSS Projektwechsler, Darstellung, alle weiteren Bereiche, Startfokus, Fokusfang, Escape, Schließen und Fokusrückgabe unterstützen.

Akzeptanz: Kein Body-Overflow, keine abgeschnittenen Hauptaktionen und vollständig deutsche UI- und Accessibility-Texte bei 390×844, 768×1024, 1280×800 und 1920×1080.

## Darstellung und Barrierefreiheit

Die Shell MUSS System, Hell und Dunkel anbieten, die globale Präferenz lokal speichern, Systemänderungen beobachten und Reduced Motion respektieren.

Akzeptanz: Semantische Landmarks, sichtbarer Fokus, kontrastfähige Tokens und nicht allein farbcodierte Zustände sind in Hell und Dunkel vorhanden.

## Ehrliche Nicht-Unterstützung

Projektverlauf, Arbeit, Planung, Lieferung und Abrechnung MÜSSEN deutsche Nicht-unterstützt-Zustände ohne Beispieldaten zeigen.

Akzeptanz: Die Baseline-Chronologie wird nicht gerendert; keine Tickets, Termine, Historien, Zeiten, Preise oder Rechnungen werden erfunden.
