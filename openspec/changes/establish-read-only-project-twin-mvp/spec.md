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

## Source-driven Projekttagebuch und Zeitpunktssicht

Der Twin MUSS fachliche Ereignisse aus explizit datierten Ticketstatushistorien, Kommentaren, Worklogs, Besprechungen, Entscheidungen, Lieferobjekten, Evidence, Dokumentmetadaten und der Project-Story-Timeline zu einem lesbaren Projekttagebuch projizieren. Git-Commits oder Dateibewegungen DÜRFEN nicht als fachliche Ereignisse erscheinen. Ereignisse ohne gültige Quellzeit werden aus der Zeitpunktprojektion ausgeschlossen und mit einer sicheren Diagnose ausgewiesen. Akteur und Rolle bleiben unbekannt, wenn die Quelle sie nicht typisiert.

Die Tagesansicht MUSS stabil chronologisch sortieren und nach Zeitraum, Ereignistyp, Person oder Rolle sowie Objektart filterbar sein. Alle Treffer MÜSSEN vollständig oder über echte Pagination erreichbar bleiben. Eine Zeitpunktssicht DARF einen Objektstatus nur aus expliziten Statusübergängen bis zum gewählten Stichtag ableiten. Frühere Dokument- oder Seiteninhalte und Vorher-/Nachher-Werte DÜRFEN ohne versionierten Quellwert nicht rekonstruiert werden.

Akzeptanz: Vor Projektbeginn bleibt der Zeitpunktstand leer, zwischen zwei Statusübergängen gilt der letzte bis dahin belegte Status und nach dem letzten Ereignis der letzte explizite Status. Gleichzeitige Ereignisse besitzen eine deterministische Reihenfolge. Systemautomation wird von Menschen getrennt; eine systemische Freigabeaussage wird ausdrücklich nicht als menschliche Freigabe dargestellt. Ticketbezogene Tagebuchtexte zeigen keine Geldbeträge und verweisen für Budgetdetails ausschließlich auf den getrennten Budgetbereich.

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

Die Hauptansicht MUSS den aktuellen Projektstand fachlich und quelltreu verdichten. Der aktuelle Scope MUSS In-Scope, Out-of-Scope, Annahmen und Scopeänderungen aus einem typisierten Vertrag darstellen; Angebotsversionen oder Rohartefakte DÜRFEN ihn nicht ersetzen. Fortschritt, Readiness, offene Steuerung, nächste Handlungen sowie Budget und Aufwand MÜSSEN Ebenen der Referenzsimulation und eines realen Projekts ausdrücklich trennen. Technische SHAs, Digests, Spectra-Provenienz und das generische Artefaktverzeichnis MÜSSEN nachgelagert in einer einklappbaren Prüfinfo erscheinen.

Akzeptanz: Fehlen `currentScope`, eine bestätigte `projectControlCoverage`, vollständig typisierte `nextActions` oder `budgetForecast`, zeigt der Twin die jeweilige Aussage als unbekannt und benennt den Producerbedarf. Eine Null wird nur innerhalb der ausdrücklich belegten Abdeckung angezeigt. Nächste Handlungen besitzen Owner, Zieltermin, Status und Zielobjekt; eine Regex- oder Mengensuche über Rohartefakte ist unzulässig. Pending Human-Approval-Artefakte werden ohne Producerklassifikation weder als echtes Kundenhindernis noch als rotes Simulationsgate gewertet.

Akzeptanz: Eine betreibende Person erkennt in der Hauptansicht ohne Öffnen der Prüfinfo Simulationsgrenze, letzten belegten Meilenstein, ausdrücklich offene oder unbekannte Steuerungsfelder und den Status nächster Handlungen. Desktop und Mobil zeigen die Managementsicht ohne horizontales Abschneiden; Tastaturfokus und Sprunglink bleiben nutzbar.

Das commitgebundene Startklar-Paket MUSS innerhalb derselben fünf Fragen auffindbar sein. Verbindliches Angebot und historische Baseline, minimale Kundenvorbereitung, Workshops, Entscheidungsumfang, Datenlieferungen, Entry-Gate, rollenbasierter Lern- und Handoverpfad sowie die nächste Handlung MÜSSEN aus den positivgelisteten Quellen abgeleitet werden. Rein technische Dokumentstatus DÜRFEN dabei nicht als fachlich offene Kundenaufgaben erscheinen.

Der Operator- und Kompetenzstand MUSS ebenfalls innerhalb der fünf Leitfragen verständlich werden. Rollenroutinen, positiver Fall, Fehler, Retest, Kompetenzpass, Eskalationsausgänge, Operator-Smoke-Test und Support-Diagnosepaket MÜSSEN commitgebunden aus Trainings- und Handover-Evidence stammen. Simulierte Kompetenz DARF NICHT als reale Kundensandboxfreigabe erscheinen; Rollen ohne belegte Operatorroutine DÜRFEN kein künstliches Training erhalten.

Der V1-Abschluss MUSS die versionierte Abnahme-Evidence vollständig und fail-closed auswerten. Bei `V1_STANDARDPRODUCT_READY` MÜSSEN Angebot, Entscheidungen, Datenwellen, UAT, Operatorpfade, Cutover, Restart, Hypercare, Lieferobjekte und offene P1/P2 widerspruchsfrei bestätigt sein. Wiederverwendbare Jira-Vorlagen im Status `Backlog` DÜRFEN dann nicht als offene Handlung der abgeschlossenen Referenzsimulation erscheinen; der reale Kundeneinstieg bleibt als separater nächster Schritt am belegten Entry-Gate sichtbar.

## Nachrangige Projektdokumentation

Für Project Twin V1.0 MUSS der kanonische Katalog unter exports/project-data/v1/document-catalog.json aus demselben Commit wie Cockpit, Index und Dokumentblobs gelesen und gegen sein positivgelistetes Draft-2020-12-Schema validiert werden. Indexdefinitionen, Katalogmetadaten, SHA-256-Inhaltswerte, Git-Modus 100644, Hierarchie und Referenzmengen MÜSSEN vollständig übereinstimmen. Fehlende oder manipulierte Katalog-, Schema- oder Dokumentblobs blockieren den Zustand mit HTTP 503 fail-closed.

Der Bereich `projektdokumentation` MUSS alle im Branch-Index positivgelisteten Markdown-Dokumente direkt aus Git-Blobs der einmalig gepinnten Commit-SHA lesbar machen. Suche und Filter nach belegtem Dokumenttyp, Status, Phase und Prozess, Seitenhierarchie, Breadcrumb, Inhaltsverzeichnis, interne Querverweise und Provenienz MÜSSEN ohne eigene Fachinterpretation entstehen. Fehlende Phasen-, Prozess- oder Aktualisierungswerte bleiben ehrlich „Nicht belegt“. Das Cockpit und seine fünf Leitfragen bleiben die primäre Hauptansicht.

Markdown MUSS ohne aktives HTML, Skripte oder unkontrollierte Navigation gerendert werden. Unsichere Links, nicht positivgelistete relative Dokumentziele, fehlende Blobs, ungültige Elternbeziehungen und Commitbewegungen blockieren fail-closed oder bleiben nachweislich nicht klickbar. „In Confluence öffnen“ DARF nur für eine strukturierte kanonische HTTPS-URL innerhalb einer im Snapshot erlaubten Origin und mit stabiler Seitenidentität aktiv sein. Fehlt dieser Producervertrag, zeigt der Twin den Link deaktiviert und benennt die Lücke.

Akzeptanz: Desktop und Mobil zeigen Dokumentnavigation und Inhalt ohne horizontalen Seitenüberlauf; Tastatur, Fokus, Inhaltsverzeichnis, Verlauf, Leerzustand und deaktivierter Confluence-Link sind verständlich deutsch. Commit, Quelldatei, Aktualisierungsstand und Validierungsstatus sind pro Seite nachgelagert sichtbar. Der Twin speichert keine Dokumentkopie und bietet keinen schreibenden oder kommentierenden Pfad.

## Producerdefinierte Wissensräume und Navigation

Der Twin MUSS Wissensräume, Module, Abschnitte, Seitenbäume, Reihenfolgen und initiale Aufklappzustände ausschließlich aus einer streng validierten Präsentationsstruktur übernehmen. Der Consumer DARF weder Space-Reihenfolge noch Kapitel, Elternbeziehungen oder Standardzustände aus Pfaden, Nummern, Titeln oder Kennungen ableiten. Drei getrennte Räume für Kundenprojekt, BC-Basic-Standardprodukt und Consultant-Handbuch MÜSSEN als eigenständige, deutsch bezeichnete Navigation erscheinen. Direkte Links MÜSSEN den notwendigen eingeklappten Pfad öffnen, ohne den producerdefinierten Standard dauerhaft zu verändern.

Akzeptanz: Doppelte Knoten- oder Reihenfolgenkennungen, Zyklen, unbekannte Knotentypen, ungültige Eltern, Referenzen oder Aufklappzustände blockieren mit HTTP 503. Der sitzungsbezogene Zustand ist an Projekt und Commit gebunden, wird beim Quellenwechsel verworfen und erzeugt keinen Schreibpfad. Module und Unterbäume sind mit Tastatur, sichtbarem Fokus, `aria-expanded` sowie deutschen Auf- und Einklappbezeichnungen bedienbar.

## Kanonische Ticketseite und Typkennzeichnung

Ein eigener Hauptpunkt `tickets` MUSS ausschließlich die vom Producer ausdrücklich als kundenlesbare Projektstory klassifizierte Ticketmenge verwenden. Historische oder interne Traceability-Issues DÜRFEN weder Summen, Filter, Board, Liste noch Timeline verfälschen. Boardspalten, kompakte Liste, Gruppen, Filter, sichtbare Felder und initiale Gruppenstände MÜSSEN producerdefiniert sein. Die Hierarchie entsteht ausschließlich aus den strukturierten Typ- und Elternfeldern.

Die erlaubten Tickettypen sind ausschließlich `phase`, `epic`, `story` und `task`. Die Hierarchie MUSS genau Phase → Epic → Story → Aufgabe folgen; der fortlaufende producerdefinierte Nummernkreis wird unverändert angezeigt. Jede Boardkarte, Listenzeile, Suche, jeder Timeline-Verweis und das Ticketdetail MÜSSEN den producerdefinierten Iconschlüssel direkt vor Key und Titel darstellen. Icon, zugänglicher deutscher Typtext und Tooltip tragen gemeinsam die Bedeutung; Status und Priorität bleiben getrennte visuelle Kanäle. Nur Aufgaben DÜRFEN fakturierbare Worklogs liefern. Unbekannte Typen, Iconschlüssel, Hierarchien, Gruppen oder Referenzen blockieren fail-closed und werden niemals aus ID oder Titel geraten.

Akzeptanz: Fixturetests beweisen Phase, Epic, Story und Aufgabe sowie Zyklen, doppelte IDs oder Reihenfolgen, unbekannte Referenzen, ungültige Initialzustände, Iconschlüssel und unzulässige Abrechnung auf Elternvorgängen. Der Browser zeigt Board und hierarchische Liste, Auf- und Einklappen, Filter, Ticketdetail, Timelinekennzeichen und einen echten 503-Fall.

### Ticketfokussierte Darstellung trennt Aufwand und Geld

Die Ticketübersicht und das Ticketdetail MÜSSEN belegte Schätz-, Ist- und Reststunden anzeigen können, DÜRFEN jedoch keine EUR-Beträge oder Ticketkosten darstellen. Typ, Status, Priorität, Verantwortung, Beschreibung, Akzeptanzkriterien, Abhängigkeiten, Historie, Kommentare, Worklogs sowie Dokument- und Evidence-Verweise werden ausschließlich aus dem validierten Quellenvertrag gezeigt. Die separate Abrechnungsansicht MUSS die belegten Budget-, Betrags- und Rollupwerte in EUR sichtbar halten; unbekannte Geldwerte bleiben als nicht belegt gekennzeichnet.

Akzeptanz: Ein echter Browsernachweis zeigt Board, Liste und Ticketdetail ohne EUR-Ausgabe. Ein fokussierter Regressionstest belegt zugleich, dass die Abrechnungsansicht weiterhin EUR-Beträge aus den validierten Finanzdaten ausgibt.

## Dokumentartgerechtes sicheres Markdown

Der Renderer MUSS sichere Markdownüberschriften, interne Links, semantische Tabellen, verschachtelte Listen, Checklisten und Codeblöcke ohne HTML-Injektion darstellen. Die producerdefinierte Dokumentart darf ausschließlich die visuelle Gewichtung vorhandener Struktur beeinflussen; der Twin DARF keine Lernziele, Prozessschritte, Kontrollen, Prüfergebnisse oder Arbeitsanweisungen ergänzen. Unsichere Links und aktive Inhalte blockieren weiterhin fail-closed.

Akzeptanz: Repräsentative Fixtureseiten für Verifikation, Support, Unternehmen, Prozesse, UAT, Cutover/Hypercare, Produktbuch und Consultant-Handbuch bleiben auf Desktop lesbar; ein einfacher Responsive-Smoke verhindert horizontalen Seitenüberlauf.

## Konfigurierter Freigabekanal und letzter gültiger Stand

Der Twin MUSS einen Repositoryalias und einen konfigurierbaren Freigabebranch verwenden. In der aktuellen Multi-Branch-Zuordnung ist ausschließlich `codex/universaarl-projekt` der erlaubte BC-Producerbranch; `main` oder `master` DÜRFEN erst nach einer ausdrücklichen späteren Repositoryzuordnung konfiguriert werden. Bei Serverstart und Request wird seine Spitze je Aktualisierungsversuch genau einmal auf eine vollständige Commit-SHA aufgelöst. Index, Katalog, Allowlist, Blobs, Modi, Digests und Referenzen MÜSSEN vollständig grün sein, bevor dieser Commit atomar zum aktiven Stand wird. Alle Daten eines Lesevorgangs MÜSSEN ausschließlich aus Git-Blobs dieser einen SHA stammen; der Producer-Arbeitsbaum wird weder gelesen noch als Gültigkeitssignal verwendet.

Akzeptanz: Ein fehlender, während des Lesens bewegter oder ungültiger neuer Kandidat verändert den zuletzt gültigen commitgebundenen Stand derselben Serverlaufzeit nicht. Existiert noch kein gültiger Stand, antwortet die API weiterhin mit HTTP 503. Die Oberfläche zeigt neutral Freigabebranch, Aktualität und letzten erfolgreichen Aktualisierungszeitpunkt; SHA und Digest bleiben in nachgelagerten technischen Details. Es gibt keinen festen manuellen Commitfallback im Normalbetrieb.

## Stabiler lokaler Betrieb

Ein repositoryeigener PowerShell-Starter MUSS den Twin mit einem offensichtlichen npm-Befehl ausschließlich auf 127.0.0.1:4173 und dem konfigurierten Freigabebranch starten. Er DARF keine `.env.local` lesen, keinen festen Commit voraussetzen und keine Secrets speichern. PID und Protokolle MÜSSEN in einem ignorierten Laufzeitordner liegen. Erfolg DARF erst nach einer begrenzten Health-Prüfung mit HTTP 200 gemeldet werden.

Akzeptanz: Ein bereits gesunder Twin führt zu einem idempotenten Erfolg. Ein fremder oder ungesunder Dienst auf Port 4173 wird deutsch gemeldet und niemals beendet. Status und Stop verwenden eine eindeutige Laufzeitkennung; Stop beendet ausschließlich den nachweislich durch denselben Starter erzeugten Prozessbaum. Start, Status, Stop und Neustart sind direkt und real nachgewiesen, während die URL ohne Browserautomatisierung prüfbar bleibt.
### Anforderung: Katalogisierte Lieferressourcen

Der Twin DARF Lieferdateien, Nachweise, Screenshots, Klickanleitungen, Schulungsunterlagen, Kundenhandbücher und Transkripte nur aus einem optionalen, im Projektindex positivgelisteten Ressourcenkatalog anzeigen. Jede Ressource MUSS an denselben gepinnten Commit, einen positivgelisteten Git-Blob mit Modus 100644, sichere relative Pfade, Größe, SHA-256, erlaubten Medientyp und bekannte Fachreferenzen gebunden sein. Vorschau und Download MÜSSEN dieselbe Bindungsprüfung wiederholen und bei Vertragsfehlern fail-closed blockieren. Fehlt der Katalog, MUSS die Lieferung einen präzisen Quellenbedarf statt einer erfundenen Datei oder generischen Artefaktmaske anzeigen.
