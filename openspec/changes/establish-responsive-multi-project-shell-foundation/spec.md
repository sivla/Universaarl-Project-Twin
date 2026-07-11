# Anforderungen

## Projektverzeichnis und Projektisolation

Das serverseitige Projektverzeichnis MUSS typisiert, validiert und eindeutig sein und produktiv exakt `universaarl` / `UABC` / `Universaarl` enthalten. Die Benutzeroberfläche DARF nur ID, Schlüssel und Name erhalten.

Akzeptanz: Ungültige, doppelte, unbekannte und pfadüberschreitende Projekt-IDs werden ohne Quellenzugriff abgelehnt; es gibt kein Ausweichverhalten auf Universaarl.

## Projektgebundene schreibgeschützte Programmierschnittstellen

Der Server MUSS ausschließlich `GET /api/projects`, `GET /api/projects/:projectId/state` und `GET /api/projects/:projectId/evidence/:evidenceId` bereitstellen. Fehler MÜSSEN sicher und nicht verfügbare Quelle von nicht gefundenem Projekt unterscheidbar machen.

Akzeptanz: Alte nicht projektgebundene Datenrouten liefern 404; unbekannte Projekte liefern 404 vor Adapterzugriff; `SourceSnapshot` enthält eine vollständige 40-stellige SHA.

## Nachweise und Provenienz

Nachweise MÜSSEN in der Benutzeroberfläche ausschließlich über opake projektgebundene IDs adressiert werden. Repository-relative Provenienz DARF nur innerhalb der vorhandenen sicheren Wurzelverzeichnisse liegen und keine Pfadüberschreitungs-, URI-, Laufwerks-, UNC- oder sensiblen Segmente enthalten.

Akzeptanz: Zustand, DOM und Fehler enthalten keine Quellenwurzel- oder Nachweisdateipfade. Unbekannte Nachweis-IDs und Ausbrüche über symbolische Verknüpfungen werden abgelehnt. Prüfungsschranken bleiben Nachweise.

## Commitgebundene Snapshot-Quellenbindung

Der Twin MUSS für jeden produktiven Lesezugriff eine vollständige 40-stellige erwartete Commit-SHA verlangen und alle unterstützten fachlichen Dateien ausschließlich als Git-Blobs aus genau diesem Commit lesen. Fehlende oder ungültige SHA, ein anderer `HEAD`, falsches Remote, falscher Branch, ein unsauberer Checkout oder eine während des Lesens veränderte Quellenidentität MÜSSEN den Lesezugriff sicher mit einem deutschen Fehlerzustand ablehnen. `GIT_OPTIONAL_LOCKS=0` MUSS für Git-Lesezugriffe gesetzt sein. Ein Pfad, Geschwisterordner, Remote oder Branch allein DARF niemals eine Freigabe bewirken.

Akzeptanz: Deterministische Negativprüfungen belegen fehlende oder ungültige SHA, unvollständige Konfiguration, Remote-/Branch-Abweichung, abweichenden `HEAD`, schmutzigen Checkout, gleiche Porcelain-Ausgabe bei veränderten Inhalten sowie HEAD-, Index- und Inhaltsänderungen während des Lesens. Der Lesezugriff verändert weder Arbeitskopie noch Index oder Git-Referenzen; absolute Pfade erscheinen nicht in UI, DOM, A11y oder dauerhaften Verträgen.

## Navigation und Momentaufnahme-Semantik

Die Anwendungshülle MUSS die sieben kanonischen Routen unter `/projekte/:projektId/:bereich` unterstützen. „Aktueller Stand“ MUSS als Momentaufnahme von `SourceSnapshot` erklärt werden und DARF keine Chronologie oder Wiedergabesemantik zeigen.

Akzeptanz: Direktaufruf, Neuladen, Zurück und Vorwärts funktionieren. Ein unbekanntes Projekt oder ein unbekannter Bereich zeigt einen deutschen sicheren Zustand. `asOf` und `stichtag` lösen keine Filterung aus.

## Anpassungsfähige deutsche Anwendungshülle

Große, mittlere und mobile Ansichten MÜSSEN aktive Projekt- und Bereichskontexte zeigen. Das mobile „Mehr“-Menü MUSS Projektwechsler, Darstellung, alle weiteren Bereiche, Startfokus, Fokusfang, Escape, Schließen und Fokusrückgabe unterstützen.

Akzeptanz: Kein horizontaler Seitenüberlauf, keine abgeschnittenen Hauptaktionen und vollständig deutsche Oberflächen- und Barrierefreiheitstexte bei 390×844, 768×1024, 1280×800 und 1920×1080.

## Darstellung und Barrierefreiheit

Die Anwendungshülle MUSS System, Hell und Dunkel anbieten, die globale Präferenz lokal speichern, Systemänderungen beobachten und reduzierte Bewegung respektieren.

Akzeptanz: Semantische Bereiche, sichtbarer Fokus, kontrastfähige Farbwerte und nicht allein farbcodierte Zustände sind in Hell und Dunkel vorhanden.

## Ehrliche Nicht-Unterstützung

Projektverlauf, Arbeit, Planung, Lieferung und Abrechnung MÜSSEN deutsche Nicht-unterstützt-Zustände ohne Beispieldaten zeigen.

Akzeptanz: Die Ausgangsstand-Chronologie wird nicht dargestellt; keine Vorgänge, Termine, Historien, Zeiten, Preise oder Rechnungen werden erfunden.
