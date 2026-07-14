# Anforderungen an den schreibgeschützten MVP

## Strikte Nur-Lesen-Grenze

Der Projektzwilling MUSS seine Fachdaten ausschließlich aus einem validierten, unveränderlichen Snapshot-Release über Filesystem oder HTTPS lesen. Er DARF weder Quelldateien, Pointer, Release, Git-Referenzen, Index, Arbeitskopie noch externe Systeme verändern.

Akzeptanz: Es existiert keine schreibende Programmierschnittstelle. Nicht unterstützte Methoden werden abgelehnt, und ein Lesevorgang verändert weder Quellenstatus noch Indexfingerabdruck.

## Projekt- und releasegebundene Momentaufnahme

`ProjectContext` MUSS das ausgewählte Projekt eindeutig bestimmen. `SourceSnapshot` MUSS Kunden-ID, Projekt-ID, Release-ID, Manifestdigest, Einlesezeit und die optionale vollständige 40-stellige Producer-Commit-SHA enthalten. Jede dargestellte Momentaufnahme und jede Nachweis-ID MUSS an Projekt, Release, manifestgeprüfte Quellbytes und eine opake interne Ressourcen-ID gebunden sein.

Akzeptanz: Ein Nachweis eines Projekts oder Versionsstands ist unter einem anderen Projekt oder Versionsstand nicht auflösbar. Verzögerte Antworten eines vorherigen Projektkontexts werden nicht angezeigt.

## Sichere Provenienz und Nachweise

Release-relative Provenienz MUSS auf die im Manifest ausdrücklich erlaubten Einzelpfade begrenzt sein. Absolute Pfade, unzulässige URI-Werte, Pfadüberschreitungen, sensible Namen, symbolische Verknüpfungen, Junctions und nicht reguläre Dateien MÜSSEN abgelehnt werden. Die Benutzeroberfläche DARF keine internen Nachweisdateipfade erhalten.

Akzeptanz: Nur manifestgeprüfte, unterstützte Ressourcen erhalten opake Twin-IDs. Vorschau und Download lösen niemals einen vom Client gelieferten Dateipfad auf.

## Sichtbare Lücken ohne erfundene Fachdaten

Fehlende Quellenfamilien, ungelöste strukturierte Referenzen und bekannte Datenlücken MÜSSEN sichtbar bleiben. Der MVP DARF aus freier Prosa keine Chronologie, Manifestbeziehung, Freigabe oder fachliche Wahrheit erfinden.

Akzeptanz: Jira-Typ, Status, Phase, Arbeitsstrom, Aufwand, Abhängigkeiten, explizite Historie, Termine, Liefergegenstände und Abrechnungskennzeichen erscheinen nur, wenn sie strukturiert im positivgelisteten Quellenvertrag belegt sind. Fehlende Werte bleiben `null`, leere Listen oder ein ehrlicher Leerzustand. Die Auswahl einer releasegebundenen Momentaufnahme durch die betreibende Person gilt nicht als menschliche Freigabe.

## Source-driven Projekttagebuch und Zeitpunktssicht

Der Twin MUSS fachliche Ereignisse aus explizit datierten Ticketstatushistorien, Kommentaren, Worklogs, Besprechungen, Entscheidungen, Lieferobjekten, Evidence, Dokumentmetadaten und der Project-Story-Timeline zu einem lesbaren Projekttagebuch projizieren. Git-Commits oder Dateibewegungen DÜRFEN nicht als fachliche Ereignisse erscheinen. Ereignisse ohne gültige Quellzeit werden aus der Zeitpunktprojektion ausgeschlossen und mit einer sicheren Diagnose ausgewiesen. Akteur und Rolle bleiben unbekannt, wenn die Quelle sie nicht typisiert.

Die Tagesansicht MUSS stabil chronologisch sortieren und nach Zeitraum, Ereignistyp, Person oder Rolle sowie Objektart filterbar sein. Alle Treffer MÜSSEN vollständig oder über echte Pagination erreichbar bleiben. Eine Zeitpunktssicht DARF einen Objektstatus nur aus expliziten Statusübergängen bis zum gewählten Stichtag ableiten. Frühere Dokument- oder Seiteninhalte und Vorher-/Nachher-Werte DÜRFEN ohne versionierten Quellwert nicht rekonstruiert werden.

Akzeptanz: Vor Projektbeginn bleibt der Zeitpunktstand leer, zwischen zwei Statusübergängen gilt der letzte bis dahin belegte Status und nach dem letzten Ereignis der letzte explizite Status. Gleichzeitige Ereignisse besitzen eine deterministische Reihenfolge. Systemautomation wird von Menschen getrennt; eine systemische Freigabeaussage wird ausdrücklich nicht als menschliche Freigabe dargestellt. Ticketbezogene Tagebuchtexte zeigen keine Geldbeträge und verweisen für Budgetdetails ausschließlich auf den getrennten Budgetbereich.

## Validierter Snapshot-Katalog

Die produktive Registry MUSS jedes sichtbare Projekt über eine explizite Katalogkennung, den Transport `filesystem` oder `https`, die erwartete Kunden-ID und die erwartete Projekt-ID binden. Beide Transporte MÜSSEN denselben Bytevertrag aus `current.json`, unveränderlichem Release-Manifest und positivgelisteten Payloads verwenden. Der produktive Ladepfad DARF weder ein Git-Repository noch Branch, Arbeitsbaum, Commitresolver, Verzeichnisscan oder zuletzt bekannte Fachwerte als Quelle verwenden.

`current.json` MUSS genau ein unveränderliches Release auswählen. Manifest, Snapshot-Schema, Kunden- und Projektidentität, sichere relative Pfade, Größen und SHA-256-Digests MÜSSEN vor jeder Projektion vollständig übereinstimmen. Unsichere, doppelte, nicht positivgelistete, fehlende oder während des Lesens veränderte Ressourcen blockieren fail-closed. Eine Commit-SHA DARF ausschließlich als optionale Manifestprovenienz erscheinen und begründet keine Laufzeitbindung.

Akzeptanz: Nicht im Release-Manifest referenzierte Fachdaten werden nicht normalisiert. Ein validierter Payload darf strukturierte Angebotsversionen, Seiten, Tickets, Timeline, Hypercare, Evidence, Entscheidungen, Risiken und Gates liefern; fehlende Werte bleiben leer. Der Twin speichert keine Kopie der fachlichen Projektdaten.

Die sichtbare Provenienz besteht aus Kunden-ID, Projekt-ID, Release-ID, Katalogtyp, Aktualisierungszeitpunkt, Manifestdigest und optionaler Commitprovenienz. Eine direkte Laufzeitabhängigkeit zu Git, Spectra oder BCProjectOS entsteht nicht.

Akzeptanz: Filesystem und HTTPS liefern für identische Bytes denselben Projektzustand. Cross-Customer-Leakage, Traversal, Symlink oder Junction, falsche Groß-/Kleinschreibung auf einem case-sensitiven Dateisystem, fehlende Releases, Digestabweichung, Pointerwechsel, Verzeichnisscan, Git-Fallback und Writeversuch werden deterministisch blockiert.

Der Producer DARF die Fachprojektion nicht als Twin-spezifischen `project-state` vorkompilieren müssen. Für den Vertrag `uabc-portable-snapshot-release-v1` MUSS das Release genau den kanonischen Projektindex sowie alle dort positivgelisteten Projektquellen als unveränderte Bytes enthalten. Der Twin MUSS Pointer, Release- und Spectra-Eignung, Manifest, Projektindex, vollständige Quellenmenge, Pfadabbildung, Größen und SHA-256-Digests validieren, bevor er daraus ausschließlich im Arbeitsspeicher den Projektzustand normalisiert.

Akzeptanz: `UABC-PORTABLE-PILOT-0004` aus der Kundeninstanz wird über Filesystem und denselben simulierten HTTPS-Bytevertrag identisch dargestellt. `UABC-PORTABLE-PILOT-0003` bleibt ausschließlich historische Evidence. Ein fehlender Indexeintrag, eine zusätzliche oder fehlende Projektquelle, eine abweichende `sourcePath`/`path`-Abbildung, ein manipuliertes Quellbyte, eine nicht freigegebene Spectra-Bindung oder ein nicht verbraucherfähiger Pointer blockiert deterministisch. Der produktive Aufruf bleibt auch ohne verfügbares Git-Programm grün und ruft keinen Git-Befehl auf.

## Offene Freigabe- und Archivgrenze

Menschliche Freigabe und Archivierung bleiben eigenständige, noch nicht abgeschlossene Schritte. Dieser Vertrag DARF ihren Abschluss nicht aus Implementierung, Prüfungen oder einem lokalen Versionsstand ableiten.

Akzeptanz: Die Aufgaben für menschliche Freigabe und Archivierung bleiben offen, bis ein gesonderter belegter Freigabevorgang abgeschlossen ist.

## Spectra-Projektabgleich und Twin-Export

Wenn der Projektindex die historischen Spectra-0.9- oder Spectra-0.10-Artefakte positivlistet, MUSS der Twin Projektabgleich, Adapterprovenienz, Twin-Export, Release-Evidence und Konformität gemeinsam und fail-closed validieren. Für Spectra `0.10.0-alpha.1` MÜSSEN Tag, Releasebindung und genau 110 bestätigte Releasepayloads übereinstimmen. Quellhash vor und nach der Projektion MÜSSEN den manifestgeprüften Indexbytes entsprechen. Projektionsdigest, Mappingkennung, Mappingversion und sämtliche Exportartefakte MÜSSEN mit den positivgelisteten Releasebytes und dem Index übereinstimmen. Unsichere Pfade, fehlende oder zusätzliche Artefakte, Hash- oder Digestabweichungen, Schreibvorgänge, Overwriterechte und eine widersprüchliche Releasebindung MÜSSEN die gesamte Ansicht blockieren.

Akzeptanz: Die deutsche Oberfläche zeigt die historische Baseline, das ausdrücklich synthetische Angebot und Ist, die begründete Abweichung, die Exportanzahl sowie die bestätigte Spectra-Releasebindung. Sie kennzeichnet, dass keine echte Rechnung, Buchung, Zahlung oder produktive Leistung stattgefunden hat. Die Kundeninstanz bleibt Source of Truth; der Twin liest ausschließlich und speichert keine zweite fachliche Wahrheit.

## Handlungsorientierte Hauptansicht

Die Hauptansicht MUSS den aktuellen Projektstand fachlich und quelltreu verdichten. Der aktuelle Scope MUSS In-Scope, Out-of-Scope, Annahmen und Scopeänderungen aus einem typisierten Vertrag darstellen; Angebotsversionen oder Rohartefakte DÜRFEN ihn nicht ersetzen. Fortschritt, Readiness, offene Steuerung, nächste Handlungen sowie Budget und Aufwand MÜSSEN Ebenen der Referenzsimulation und eines realen Projekts ausdrücklich trennen. Technische SHAs, Digests, Spectra-Provenienz und das generische Artefaktverzeichnis MÜSSEN nachgelagert in einer einklappbaren Prüfinfo erscheinen.

Akzeptanz: Fehlen `currentScope`, eine bestätigte `projectControlCoverage`, vollständig typisierte `nextActions` oder `budgetForecast`, zeigt der Twin die jeweilige Aussage als unbekannt und benennt den Producerbedarf. Eine Null wird nur innerhalb der ausdrücklich belegten Abdeckung angezeigt. Nächste Handlungen besitzen Owner, Zieltermin, Status und Zielobjekt; eine Regex- oder Mengensuche über Rohartefakte ist unzulässig. Pending Human-Approval-Artefakte werden ohne Producerklassifikation weder als echtes Kundenhindernis noch als rotes Simulationsgate gewertet.

Akzeptanz: Eine betreibende Person erkennt in der Hauptansicht ohne Öffnen der Prüfinfo Simulationsgrenze, letzten belegten Meilenstein, ausdrücklich offene oder unbekannte Steuerungsfelder und den Status nächster Handlungen. Desktop und Mobil zeigen die Managementsicht ohne horizontales Abschneiden; Tastaturfokus und Sprunglink bleiben nutzbar.

Das releasegebundene Startklar-Paket MUSS innerhalb derselben fünf Fragen auffindbar sein. Verbindliches Angebot und historische Baseline, minimale Kundenvorbereitung, Workshops, Entscheidungsumfang, Datenlieferungen, Entry-Gate, rollenbasierter Lern- und Handoverpfad sowie die nächste Handlung MÜSSEN aus den positivgelisteten Quellen abgeleitet werden. Rein technische Dokumentstatus DÜRFEN dabei nicht als fachlich offene Kundenaufgaben erscheinen.

Der Operator- und Kompetenzstand MUSS ebenfalls innerhalb der fünf Leitfragen verständlich werden. Rollenroutinen, positiver Fall, Fehler, Retest, Kompetenzpass, Eskalationsausgänge, Operator-Smoke-Test und Support-Diagnosepaket MÜSSEN releasegebunden aus Trainings- und Handover-Evidence stammen. Simulierte Kompetenz DARF NICHT als reale Kundensandboxfreigabe erscheinen; Rollen ohne belegte Operatorroutine DÜRFEN kein künstliches Training erhalten.

Der V1-Abschluss MUSS die versionierte Abnahme-Evidence vollständig und fail-closed auswerten. Bei `V1_STANDARDPRODUCT_READY` MÜSSEN Angebot, Entscheidungen, Datenwellen, UAT, Operatorpfade, Cutover, Restart, Hypercare, Lieferobjekte und offene P1/P2 widerspruchsfrei bestätigt sein. Wiederverwendbare Jira-Vorlagen im Status `Backlog` DÜRFEN dann nicht als offene Handlung der abgeschlossenen Referenzsimulation erscheinen; der reale Kundeneinstieg bleibt als separater nächster Schritt am belegten Entry-Gate sichtbar.

## Nachrangige Projektdokumentation

Für Project Twin V1.0 MUSS der kanonische Katalog unter `exports/project-data/v1/document-catalog.json` aus demselben unveränderlichen Release wie Cockpit, Index und Dokumentbytes gelesen und gegen sein positivgelistetes Draft-2020-12-Schema validiert werden. Indexdefinitionen, Katalogmetadaten, SHA-256-Inhaltswerte, Hierarchie und Referenzmengen MÜSSEN vollständig übereinstimmen. Fehlende oder manipulierte Katalog-, Schema- oder Dokumentbytes blockieren den Zustand mit HTTP 503 fail-closed.

Der Bereich `projektdokumentation` MUSS alle im Projektindex positivgelisteten Markdown-Dokumente direkt aus den manifestgeprüften Releasebytes lesbar machen. Suche und Filter nach belegtem Dokumenttyp, Status, Phase und Prozess, Seitenhierarchie, Breadcrumb, Inhaltsverzeichnis, interne Querverweise und Provenienz MÜSSEN ohne eigene Fachinterpretation entstehen. Fehlende Phasen-, Prozess- oder Aktualisierungswerte bleiben ehrlich „Nicht belegt“. Das Cockpit und seine fünf Leitfragen bleiben die primäre Hauptansicht.

Markdown MUSS ohne aktives HTML, Skripte oder unkontrollierte Navigation gerendert werden. Unsichere Links, nicht positivgelistete relative Dokumentziele, fehlende Releasebytes, ungültige Elternbeziehungen und Pointerbewegungen blockieren fail-closed oder bleiben nachweislich nicht klickbar. „In Confluence öffnen“ DARF nur für eine strukturierte kanonische HTTPS-URL innerhalb einer im Snapshot erlaubten Origin und mit stabiler Seitenidentität aktiv sein. Fehlt dieser Producervertrag, zeigt der Twin den Link deaktiviert und benennt die Lücke.

Akzeptanz: Desktop und Mobil zeigen Dokumentnavigation und Inhalt ohne horizontalen Seitenüberlauf; Tastatur, Fokus, Inhaltsverzeichnis, Verlauf, Leerzustand und deaktivierter Confluence-Link sind verständlich deutsch. Commit, Quelldatei, Aktualisierungsstand und Validierungsstatus sind pro Seite nachgelagert sichtbar. Der Twin speichert keine Dokumentkopie und bietet keinen schreibenden oder kommentierenden Pfad.

## Producerdefinierte Wissensräume und Navigation

Der Twin MUSS Wissensräume, Module, Abschnitte, Seitenbäume, Reihenfolgen und initiale Aufklappzustände ausschließlich aus einer streng validierten Präsentationsstruktur übernehmen. Der Consumer DARF weder Space-Reihenfolge noch Kapitel, Elternbeziehungen oder Standardzustände aus Pfaden, Nummern, Titeln oder Kennungen ableiten. Drei getrennte Räume für Kundenprojekt, BC-Basic-Standardprodukt und Consultant-Handbuch MÜSSEN als eigenständige, deutsch bezeichnete Navigation erscheinen. Direkte Links MÜSSEN den notwendigen eingeklappten Pfad öffnen, ohne den producerdefinierten Standard dauerhaft zu verändern.

Akzeptanz: Doppelte Knoten- oder Reihenfolgenkennungen, Zyklen, unbekannte Knotentypen, ungültige Eltern, Referenzen oder Aufklappzustände blockieren mit HTTP 503. Der sitzungsbezogene Zustand ist an Projekt und Release gebunden, wird beim Quellenwechsel verworfen und erzeugt keinen Schreibpfad. Module und Unterbäume sind mit Tastatur, sichtbarem Fokus, `aria-expanded` sowie deutschen Auf- und Einklappbezeichnungen bedienbar.

## Kanonische Ticketseite und Typkennzeichnung

Ein eigener Hauptpunkt `tickets` MUSS ausschließlich die vom Producer ausdrücklich als kundenlesbare Projektstory klassifizierte Ticketmenge verwenden. Historische oder interne Traceability-Issues DÜRFEN weder Summen, Filter, Board, Liste noch Timeline verfälschen. Boardspalten, kompakte Liste, Gruppen, Filter, sichtbare Felder und initiale Gruppenstände MÜSSEN producerdefiniert sein. Die Hierarchie entsteht ausschließlich aus den strukturierten Typ- und Elternfeldern.

Die erlaubten Tickettypen sind ausschließlich `phase`, `epic`, `story` und `task`. Die Hierarchie MUSS genau Phase → Epic → Story → Aufgabe folgen; der fortlaufende producerdefinierte Nummernkreis wird unverändert angezeigt. Jede Boardkarte, Listenzeile, Suche, jeder Timeline-Verweis und das Ticketdetail MÜSSEN den producerdefinierten Iconschlüssel direkt vor Key und Titel darstellen. Icon, zugänglicher deutscher Typtext und Tooltip tragen gemeinsam die Bedeutung; Status und Priorität bleiben getrennte visuelle Kanäle. Nur Aufgaben DÜRFEN fakturierbare Worklogs liefern. Unbekannte Typen, Iconschlüssel, Hierarchien, Gruppen oder Referenzen blockieren fail-closed und werden niemals aus ID oder Titel geraten.

Akzeptanz: Fixturetests beweisen Phase, Epic, Story und Aufgabe sowie Zyklen, doppelte IDs oder Reihenfolgen, unbekannte Referenzen, ungültige Initialzustände, Iconschlüssel und unzulässige Abrechnung auf Elternvorgängen. Der Browser zeigt Board und hierarchische Liste, Auf- und Einklappen, Filter, Ticketdetail, Timelinekennzeichen und einen echten 503-Fall.

Jede sichtbare Referenz auf ein kanonisches Ticket MUSS als zugängliche Navigation zum typgerechten Ticketdetail angeboten werden. Das gilt auch für Cockpit, Projekttagebuch, Stichtagsstatus, Projektverlauf, Planung, Lieferung, Abhängigkeiten und Dokumentinhalte. Nur IDs aus der validierten Ticketmenge werden verlinkt; ähnlich aussehender Freitext oder unbekannte Kennungen bleiben unverändert und erzeugen keine Navigation.

Akzeptanz: Ein fokussierter Vertragstest belegt exakte, überlappungsfreie Erkennung bekannter Ticket-IDs und lässt unbekannte beziehungsweise verlängerte Kennungen unberührt. Der Browser öffnet aus einem Tagebucheintrag wie „UABC-1: In Arbeit“ das Ticketdetail über den Link `UABC-1`.

### Ticketfokussierte Darstellung trennt Aufwand und Geld

Die Ticketübersicht und das Ticketdetail MÜSSEN belegte Schätz-, Ist- und Reststunden anzeigen können, DÜRFEN jedoch keine EUR-Beträge oder Ticketkosten darstellen. Typ, Status, Priorität, Verantwortung, Beschreibung, Akzeptanzkriterien, Abhängigkeiten, Historie, Kommentare, Worklogs sowie Dokument- und Evidence-Verweise werden ausschließlich aus dem validierten Quellenvertrag gezeigt. Die separate Abrechnungsansicht MUSS die belegten Budget-, Betrags- und Rollupwerte in EUR sichtbar halten; unbekannte Geldwerte bleiben als nicht belegt gekennzeichnet.

Akzeptanz: Ein echter Browsernachweis zeigt Board, Liste und Ticketdetail ohne EUR-Ausgabe. Ein fokussierter Regressionstest belegt zugleich, dass die Abrechnungsansicht weiterhin EUR-Beträge aus den validierten Finanzdaten ausgibt.

## Dokumentartgerechtes sicheres Markdown

Der Renderer MUSS sichere Markdownüberschriften, interne Links, semantische Tabellen, verschachtelte Listen, Checklisten und Codeblöcke ohne HTML-Injektion darstellen. Die producerdefinierte Dokumentart darf ausschließlich die visuelle Gewichtung vorhandener Struktur beeinflussen; der Twin DARF keine Lernziele, Prozessschritte, Kontrollen, Prüfergebnisse oder Arbeitsanweisungen ergänzen. Unsichere Links und aktive Inhalte blockieren weiterhin fail-closed.

Akzeptanz: Repräsentative Fixtureseiten für Verifikation, Support, Unternehmen, Prozesse, UAT, Cutover/Hypercare, Produktbuch und Consultant-Handbuch bleiben auf Desktop lesbar; ein einfacher Responsive-Smoke verhindert horizontalen Seitenüberlauf.

## Source-driven Projektplan in Phasen

Der Projektverlauf und die Planung MÜSSEN die kanonischen Phase-Tickets als gemeinsamen Projektplan anzeigen. Reihenfolge, Status, Planstunden, Iststunden und zugeordnete Epics stammen ausschließlich aus dem validierten Snapshot. Ein altes `project-plan`-Dokument oder vollständige Datumswerte DÜRFEN keine Voraussetzung für die sichtbare Phasenstruktur sein. Eine Gantt-Zeitachse erscheint nur, wenn Beginn und Ende ausdrücklich belegt sind; fehlende Termine werden nicht ergänzt.

Akzeptanz: Ein Snapshot mit kanonischen Phase-Tickets, aber ohne alten Projektplan und ohne vollständige Termine zeigt alle Phasen im Projektverlauf und in der Planung. Ein fokussierter Test belegt Reihenfolge und Epic-Zuordnung; der echte Browsernachweis bleibt bis zu einem erreichbaren validierten Runtimekatalog offen.

## Explizites Katalogregister und Projektwechsel

Der Twin MUSS Kunden- und Projektwechsel ausschließlich aus einem expliziten lokalen Katalogregister ausführen. Die Konfiguration enthält nur Katalogtyp, Katalogadresse, erwartete Kunden-ID, erwartete Projekt-ID und optional einen Anzeigenamen. Sie liegt außerhalb des Repositorys nach XDG-Konvention; Kommandozeilenargumente dürfen sie für einen Lauf sicher überschreiben. `.env`-Dateien, Secrets, Git-Repositories und Kundendirectory-Scans DÜRFEN nicht verwendet werden.

Akzeptanz: Der Wechsel zwischen zwei synthetischen Kundenprojekten mischt weder Payloads noch Diagnosen. Eine fremde Kunden-ID oder Projekt-ID blockiert mit HTTP 503. Der Twin speichert keine Fachdaten dauerhaft und schreibt weder in Katalog noch Release.

## Stabiler lokaler Betrieb

Ein repositoryeigener Node-Starter MUSS den Twin nach `npm ci` mit offensichtlichen npm-Befehlen auf Windows und macOS ausschließlich lokal starten, konfigurieren, diagnostizieren, abfragen und stoppen. Die bestehenden PowerShell-Befehle bleiben kompatible Wrapper, sind aber keine Laufzeitvoraussetzung. Der Starter DARF keine `.env`-Datei lesen, keinen Commit voraussetzen und keine Secrets speichern. PID und Protokolle MÜSSEN in einem ignorierten Laufzeitordner liegen. Erfolg DARF erst nach einer begrenzten Health-Prüfung mit HTTP 200 gemeldet werden.

Akzeptanz: Ein bereits gesunder Twin führt zu einem idempotenten Erfolg. Ein fremder oder ungesunder Dienst auf Port 4173 wird deutsch gemeldet und niemals beendet. Status und Stop verwenden eine eindeutige Laufzeitkennung; Stop beendet ausschließlich den nachweislich durch denselben Starter erzeugten Prozessbaum. Eine CI-Matrix führt den Ablauf auf `windows-latest` und `macos-14` mit synthetischen Katalogen aus. Ein nicht wirklich ausgeführtes macOS-Gate bleibt `PENDING` und wird niemals als PASS ausgegeben.
## Dreistufige Betriebsbereitschaft und Operator-Lebenszyklus

Der Twin MUSS Plattformbereitschaft, Onboardingbereitschaft und Kunden-Go-live-Bereitschaft getrennt ausweisen. Plattform und Onboarding DÜRFEN lokale technische Evidence verwenden. Kunden-Go-live MUSS ausschließlich aus dem validierten Producerstand abgeleitet werden und bleibt ohne expliziten Nachweis source-dependent. Ein lokaler Operator DARF registrierte Kataloge wechseln, die fachinhaltsfreie Konfiguration sichern und wiederherstellen sowie einen digestgeprüften Release nach Kompatibilitätsprüfung atomar aktivieren oder auf den unmittelbar vorherigen validierten Release zurückrollen.

Akzeptanz: Der maschinenlesbare Vertrag bindet sichere Text-Evidence aus demselben Versionsstand. Fehlende Evidence, unsichere Pfade, Downgrades, veränderte Releasebytes und unbekannte Kataloge blockieren. Diagnoseausgaben enthalten keine lokalen Pfade, Adressen oder Fachinhalte. Der Dienst bleibt auf `127.0.0.1` und erklärt LAN, Mehrbenutzer, Authentifizierung und TLS-Terminierung ausdrücklich als nicht unterstützt. Ohne menschliche Lizenzentscheidung bleibt die Distribution `internal-only`.

### Anforderung: Katalogisierte Lieferressourcen

Der Twin DARF Lieferdateien, Nachweise, Screenshots, Klickanleitungen, Schulungsunterlagen, Kundenhandbücher und Transkripte nur aus dem im unveränderlichen Release-Manifest positivgelisteten Ressourcenkatalog anzeigen. Jede Ressource MUSS an dieselbe Release-ID, einen positivgelisteten Payload, einen sicheren relativen Pfad, Größe, SHA-256, erlaubten Medientyp und bekannte Fachreferenzen gebunden sein. Vorschau und Download MÜSSEN dieselbe Bindungsprüfung wiederholen und bei Vertragsfehlern fail-closed blockieren. Fehlt der Katalog, MUSS die Lieferung einen präzisen Quellenbedarf statt einer erfundenen Datei oder generischen Artefaktmaske anzeigen.
# PM-orientierte Projektsteuerung

## Anforderung: Jede Hauptansicht beantwortet eine fachliche Steuerungsfrage

Der Twin MUSS die Hauptnavigation und die Einleitung jeder Ansicht so ordnen, dass Projektleitung, Beratung und Solution Architecture den Zweck der Oberfläche unmittelbar erkennen. Die Ticket- und Dokumentationsansichten bleiben fachlich führend; eine zusätzliche Arbeitsliste darf kein zweites Backlog erzeugen.

## Anforderung: Projektplan ohne erfundene Termine

Der Twin MUSS die source-driven Phasen mit Status, geplantem Aufwand, Istaufwand und verbleibendem Aufwand sichtbar darstellen. Ein Datums-Gantt DARF nur Start- und Endtermine aus dem validierten Snapshot verwenden. Fehlt ein Endtermin, MUSS die Oberfläche die Terminlücke ausdrücklich nennen und DARF einen Aufwandsbalken nicht als Zeitplan ausgeben.

## Anforderung: Grafische Budgetsteuerung

Der Twin MUSS geplantes Budget, verbrauchten Betrag, verfügbaren Rest und prozentualen Verbrauch grafisch darstellen. Die Monatsansicht MUSS aus datierten Worklogs abrechenbarer Aufgaben entstehen. Phasen- und Epicwerte MÜSSEN als Summe aus untergeordneten Aufgaben gekennzeichnet sein und DÜRFEN nicht zusätzlich abgerechnet werden. Fehlt eine Monatsbudgetierung, MUSS dies sichtbar bleiben.
