## ADDED Requirements

### Requirement: Producerdefinierte Wissensräume

Der technische OpenSpec-Schlüssel MUST kennzeichnet diese verbindliche Muss-Anforderung. Der Twin muss Wissensräume, Module, Seiten, Reihenfolgen, Elternbeziehungen und anfängliche Aufklappzustände ausschließlich aus einer streng validierten Präsentationsstruktur übernehmen. Die Struktur muss an Projekt und Commit gebunden bleiben und darf weder aus Pfaden noch aus Titeln abgeleitet werden.

#### Scenario: Drei sichere Wissensräume werden dargestellt

- **WHEN** der validierte Vertrag genau die Räume Kundenprojekt, BC-Basic-Standardprodukt und Consultant-Handbuch mit sicheren Knoten und Dokumentreferenzen bereitstellt
- **THEN** zeigt der Twin die drei getrennten Räume mit Seitenbaum, Brotkrümelnavigation und sitzungsbezogenem Aufklappzustand an

#### Scenario: Eine manipulierte Baumstruktur wird blockiert

- **WHEN** ein Knoten eine doppelte Kennung oder Reihenfolge, einen Zyklus, einen unbekannten Elternknoten oder einen ungültigen Anfangszustand enthält
- **THEN** blockiert der Twin die gesamte Ansicht fail-closed mit HTTP 503

### Requirement: Kanonische Ticketseite

Der technische OpenSpec-Schlüssel MUST kennzeichnet diese verbindliche Muss-Anforderung. Der Twin muss einen eigenen Hauptpunkt für die producerdefinierte kundenlesbare Ticketmenge bereitstellen. Board, hierarchische Liste, Gruppen, Spalten, Filter und sichtbare Felder müssen aus dem validierten Vertrag stammen. Historische oder interne Traceability-Issues dürfen die kanonische Menge nicht verändern.

#### Scenario: Tickettypen sind vor dem Öffnen unterscheidbar

- **WHEN** die kanonische Menge genau Phase, Epic, Story und Aufgabe im fortlaufenden UABC-Nummernkreis enthält
- **THEN** zeigt Board, Liste, Suche, Timeline-Verweis und Ticketdetail jeweils den erlaubten Iconschlüssel zusammen mit dem deutschen Typtext an

#### Scenario: Eine unbekannte Ticketdarstellung wird blockiert

- **WHEN** Typ, Iconschlüssel, Gruppe, Referenz oder Hierarchie nicht dem geschlossenen Vertrag entspricht
- **THEN** blockiert der Twin die Ansicht fail-closed und errät keinen Ersatz aus Kennung oder Titel

#### Scenario: Die source-driven Hierarchie bleibt bedienbar und eindeutig

- **WHEN** der validierte Vertrag Phase, Epic, Story oder Fehler und die jeweils eigenen Aufgaben über Elternreferenzen bindet
- **THEN** zeigt der Twin jede Aufgabe genau unter ihrer Story oder ihrem Fehler, trennt Aufklappen und Detailnavigation tastaturbedienbar und berechnet deren Stundenrollup ausschließlich aus den eigenen Aufgaben

#### Scenario: Ticketdetails zeigen nur typgerechte belegte Inhalte

- **WHEN** ein Phase-, Epic-, Story-, Fehler- oder Aufgabe-Ticket geöffnet wird
- **THEN** zeigt der Twin nur die für diesen Typ belegten Fachsektionen, verknüpft Eltern und Kinder direkt und fasst fehlende Rollen- oder Inhaltsdaten als einen ehrlichen Quellenbedarf zusammen

### Requirement: Sicheres dokumentartgerechtes Markdown

Der technische OpenSpec-Schlüssel MUST kennzeichnet diese verbindliche Muss-Anforderung. Der Twin muss vorhandene Markdownüberschriften, interne Links, Tabellen, verschachtelte Listen, Checklisten sowie Code- und Evidence-Blöcke ohne aktives HTML rendern. Die Dokumentart darf nur die Gewichtung vorhandener Struktur beeinflussen und keine neue Fachwahrheit erzeugen.

#### Scenario: Positivgelistete Dokumentstruktur bleibt lesbar

- **WHEN** eine commitgebundene Dokumentseite ausschließlich erlaubte Markdownstruktur und bekannte interne Ziele enthält
- **THEN** stellt der Twin Inhalt, Inhaltsverzeichnis, Querverweis und deaktivierten externen Link verständlich deutsch dar

#### Scenario: Aktiver oder unbekannter Inhalt bleibt gesperrt

- **WHEN** ein Dokument aktives HTML, Skriptinhalt, ein unsicheres Linkziel oder eine unbekannte Dokumentreferenz enthält
- **THEN** wird der Inhalt gemäß Quellvertrag fail-closed blockiert oder nachweislich nicht klickbar dargestellt

### Requirement: Konfigurierter Freigabekanal mit letztem gültigem Stand

Der technische OpenSpec-Schlüssel MUST kennzeichnet diese verbindliche Muss-Anforderung. Der Twin muss den konfigurierten Freigabebranch bei einem Start genau einmal auflösen und einen neuen Commit erst nach vollständiger Validierung atomar aktivieren. Ein fehlgeschlagener Kandidat darf den zuletzt gültigen Stand nicht verändern.

#### Scenario: Ein gültiger Freigabecommit wird atomar aktiviert

- **WHEN** der konfigurierte Freigabebranch auf einen vollständig validierten Commit zeigt
- **THEN** lesen Cockpit, Tickets und Wissensräume ausschließlich Git-Blobs genau dieses Commits und zeigen den Stand als aktuell an

#### Scenario: Eine fehlgeschlagene Aktualisierung bewahrt den letzten gültigen Stand

- **WHEN** der Freigabebranch fehlt oder sein neuer Commit den Quellvertrag verletzt
- **THEN** bleibt der letzte gültige commitgebundene Stand sichtbar und wird mit einem sicheren deutschen Aktualisierungshinweis als veraltet gekennzeichnet
