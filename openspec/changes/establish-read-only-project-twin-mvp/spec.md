# Anforderungen an den schreibgeschützten MVP

## Strikte Nur-Lesen-Grenze

Der Projektzwilling MUSS seine Fachdaten ausschließlich aus einem vorhandenen Git-Versionsstand lesen. Er DARF weder Quelldateien noch Git-Referenzen, Index, Arbeitskopie oder externe Systeme verändern.

Akzeptanz: Es existiert keine schreibende Programmierschnittstelle. Nicht unterstützte Methoden werden abgelehnt, und ein Lesevorgang verändert weder Quellenstatus noch Indexfingerabdruck.

## Projekt- und commitgebundene Momentaufnahme

`ProjectContext` MUSS das ausgewählte Projekt eindeutig bestimmen. `SourceSnapshot` MUSS die vollständige 40-stellige Commit-SHA, den Zweig, den Änderungszustand und die Einlesezeit enthalten. Jede dargestellte Momentaufnahme und jede Nachweis-ID MUSS an Projekt, Commit, Quellblob und sicheren internen Pfad gebunden sein.

Akzeptanz: Ein Nachweis eines Projekts oder Versionsstands ist unter einem anderen Projekt oder Versionsstand nicht auflösbar. Verzögerte Antworten eines vorherigen Projektkontexts werden nicht angezeigt.

## Sichere Provenienz und Nachweise

Repository-relative Provenienz MUSS auf ausdrücklich erlaubte Quellwurzeln und Einzelpfade begrenzt sein. Absolute Pfade, URI-Werte, Pfadüberschreitungen, sensible Namen, symbolische Verknüpfungen und nicht reguläre Git-Einträge MÜSSEN abgelehnt werden. Die Benutzeroberfläche DARF keine internen Nachweisdateipfade erhalten.

Akzeptanz: Nur reguläre PNG-Blobs unter `evidence/` werden als Bildnachweise adressiert. Andere unterstützte Blobs werden sicher vorgeprüft, erzeugen jedoch keine Nachweis-ID.

## Sichtbare Lücken ohne erfundene Fachdaten

Fehlende Quellenfamilien, ungelöste strukturierte Referenzen und bekannte Datenlücken MÜSSEN sichtbar bleiben. Der MVP DARF aus freier Prosa keine Chronologie, Manifestbeziehung, Freigabe oder fachliche Wahrheit erfinden.

Akzeptanz: Jira-Typ, Status, Phase, Arbeitsstrom, Aufwand, Abhängigkeiten, explizite Historie, Termine, Liefergegenstände und Abrechnungskennzeichen erscheinen nur, wenn sie strukturiert im positivgelisteten Quellenvertrag belegt sind. Fehlende Werte bleiben `null`, leere Listen oder ein ehrlicher Leerzustand. Die Auswahl einer commitgebundenen Momentaufnahme durch die betreibende Person gilt nicht als menschliche Freigabe.

## Projektgebundener Datenindex

Die Projektbindung für `bc-basic` MUSS ausschließlich über `exports/project-data/v1/index.yaml` erfolgen. Dieser Index MUSS schreibgeschützt, schemavalidiert, an die erwartete fachliche Projekt-ID gebunden und die einzige Einstiegskante zu den positiv referenzierten Jira-, Confluence-, Meeting-, Planungs-, Trainings-, Handbuch-, Budget-, Arbeitsprotokoll- und Nachweisquellen sein.

Akzeptanz: Nicht im Index referenzierte Fachdaten werden für `bc-basic` nicht normalisiert. Der vorhandene Walkthrough-Vertrag wird nicht als Projektindex umgedeutet. Der Twin speichert keine Kopie der fachlichen Projektdaten.

## Offene Freigabe- und Archivgrenze

Menschliche Freigabe und Archivierung bleiben eigenständige, noch nicht abgeschlossene Schritte. Dieser Vertrag DARF ihren Abschluss nicht aus Implementierung, Prüfungen oder einem lokalen Versionsstand ableiten.

Akzeptanz: Die Aufgaben für menschliche Freigabe und Archivierung bleiben offen, bis ein gesonderter belegter Freigabevorgang abgeschlossen ist.
