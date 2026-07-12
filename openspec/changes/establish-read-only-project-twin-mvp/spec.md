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

## Commitgebundener Branchvertrag

Die produktive Registry MUSS das Kundenprojekt `bc-basic`, das Repository und den Branch `codex/universaarl-projekt` ausdrücklich binden. Der Branch wird bei jedem Serverstart automatisch und genau einmal zu einer vollständigen 40-stelligen Commit-SHA aufgelöst; eine manuelle Commitfreigabe ist nicht erforderlich. Danach liest der Twin ausschließlich Git-Blobs dieser SHA; ein beweglicher Branch-HEAD, Arbeitsbaum, generischer Tree-Scan oder Rückfall auf zuletzt bekannte Werte ist unzulässig.

`exports/project-data/v1/index.yaml` ist im Branchmodus der einzige aktuelle Daten- und Allowlistvertrag. Er MUSS Projektidentität, Vertragsversion, `readOnly`, `contractRole`, `pathSemantics`, `allowedBranch` und `validationStatus` exakt erfüllen. Jeder positivgelistete Pfad wird als Blob mit sicherem Modus, Existenz, Größe, Format, Referenzen und vorhandenem Digest geprüft. Unsichere, doppelte, nicht positivgelistete oder fehlende Pfade blockieren fail-closed. `snapshot-manifest.json`, `producerCommitSha`, Parent-A, A/B-Diff und das alte Snapshot-Schema werden im Branchmodus überhaupt nicht geöffnet, geparst oder kompiliert.

Akzeptanz: Nicht im Index referenzierte Fachdaten werden für `bc-basic` nicht normalisiert. Die commitgebundene Storyquelle darf strukturierte Angebotsversionen, Seiten, Tickets, Timeline, Hypercare, Evidence, Entscheidungen, Risiken und Gates liefern; fehlende Werte bleiben leer. Der Twin speichert keine Kopie der fachlichen Projektdaten.

Die sichtbare Provenienz besteht im Branchmodus aus Projekt-ID, erlaubtem Branch, gepinnter Commit-SHA, Indexstatus und den positivgelisteten Story-/Spectra-Evidence. Eine synthetische Simulation darf bestandene Simulationsgates anzeigen, muss aber klar als Sandbox ohne reale Kunden-, BC-, Steuer- oder Produktivaktivität gekennzeichnet werden. Eine direkte Laufzeitabhängigkeit zu Spectra oder BCProjectOS entsteht nicht.

Akzeptanz: Ein blockierter Branchvertrag benennt Repository-, Branch-, Commit-, Index-, Allowlist-, Referenz- und Digestprüfung, ohne das im Branchmodus abgeschaffte Snapshotmanifest als Voraussetzung darzustellen. Positivgelistete und validierte Spectra-Dokumenttypen werden als unterstützt und natürlich deutsch bezeichnet.

## Offene Freigabe- und Archivgrenze

Menschliche Freigabe und Archivierung bleiben eigenständige, noch nicht abgeschlossene Schritte. Dieser Vertrag DARF ihren Abschluss nicht aus Implementierung, Prüfungen oder einem lokalen Versionsstand ableiten.

Akzeptanz: Die Aufgaben für menschliche Freigabe und Archivierung bleiben offen, bis ein gesonderter belegter Freigabevorgang abgeschlossen ist.

## Spectra-Projektabgleich und Twin-Export

Wenn der Projektindex die Spectra-0.9- oder Spectra-0.10-Artefakte positivlistet, MUSS der Twin Projektabgleich, Adapterprovenienz, Twin-Export, Release-Evidence und Konformität gemeinsam und fail-closed validieren. Für Spectra `0.10.0-alpha.1` MÜSSEN Tag, Releasebindung und genau 110 bestätigte Releasepayloads übereinstimmen. Quellhash vor und nach der Projektion MÜSSEN dem commitgebundenen Indexblob entsprechen. Projektionsdigest, Mappingkennung, Mappingversion und sämtliche Exportartefakte MÜSSEN mit den positivgelisteten Git-Blobs und dem Index übereinstimmen. Unsichere Pfade, fehlende oder zusätzliche Artefakte, Hash- oder Digestabweichungen, Schreibvorgänge, Overwriterechte und eine widersprüchliche Releasebindung MÜSSEN die gesamte Ansicht blockieren.

Akzeptanz: Die deutsche Oberfläche zeigt die historische Baseline, das ausdrücklich synthetische Angebot und Ist, die begründete Abweichung, die Exportanzahl sowie die bestätigte Spectra-Releasebindung. Sie kennzeichnet, dass keine echte Rechnung, Buchung, Zahlung oder produktive Leistung stattgefunden hat. Die Kundeninstanz bleibt Source of Truth; der Twin liest ausschließlich und speichert keine zweite fachliche Wahrheit.

## Handlungsorientierte Hauptansicht

Die Hauptansicht MUSS die Projekterfahrung auf fünf Fragen verdichten: Was ist verkauft, wo steht das Projekt, was ist fertig, was ist offen und was ist als Nächstes zu tun. Angebot, Scope, Phasen, Prozesse, Entscheidungen, Daten und Setup, Tickets, UAT, Cutover und Hypercare MÜSSEN aus belegten Artefakten erreichbar bleiben. Technische SHAs, Digests, Spectra-Provenienz und das generische Artefaktverzeichnis MÜSSEN nachgelagert in einer einklappbaren Prüfinfo erscheinen.

Akzeptanz: Eine betreibende Person erkennt in der Hauptansicht ohne Öffnen der Prüfinfo Simulationsgrenze, Projektstand, ausdrücklich offene Punkte und nächste Handlung. Desktop und Mobil zeigen alle fünf Fragen ohne horizontales Abschneiden; Tastaturfokus und Sprunglink bleiben nutzbar.
