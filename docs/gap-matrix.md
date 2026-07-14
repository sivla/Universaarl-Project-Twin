# Gap-Matrix der vollständigen Projektdarstellung

Diese Matrix beschreibt die vom Project Twin erwarteten fachlichen Bereiche. Die Oberfläche zeigt den Status ausschließlich aus dem validierten Snapshot. Sie erzeugt keine Kundenwerte, ersetzt keine Producer-Evidence und behauptet keinen produktiven Abschluss.

| Bereich | Vollständiger Nachweis | Statusregel im Twin | Offener Übergabepunkt |
| --- | --- | --- | --- |
| Angebot, Auftrag, Budget und Wochenrechnungen | Versioniertes Angebot, Auftrag, Budget und datierte Worklogs oder Rechnungsnachweise | Angebot/Budget und Worklogs sind nur teilweise; Rechnungen bleiben separat | Im BC-Basic-Producer typisieren und digestgebunden veröffentlichen |
| Drei-Phasen-Plan und Meilensteine | Drei kanonische Phasen, Meilensteine und belastbare Termine | Phase-Tickets und Timeline werden getrennt bewertet | Fehlende Phasen, Termine und Entscheidungen belegen |
| Phase → Epic → Story → Task, Meetings und Schulungen | Vollständige Hierarchie sowie typisierte Meetings und Trainings | Ticketstruktur kann belegt sein; Meetings/Training müssen eigene Quellen besitzen | Meetings und Schulungen als Quellenfamilien liefern |
| Historien, Akzeptanz, Deliverables, Transkripte, Kommentare, Worklogs und Evidence | Statushistorien, Kriterien, Lieferregister, Referenzen und Evidence | Nur vorhandene typisierte Felder werden gezählt | Fehlende Nachweisfamilien ergänzen |
| Confluence-Kundenspace, BC-Basic-Produktspace, Consultant-Handbuch | Drei producerdefinierte Spaces, Seitenbaum und stabile Seitenidentitäten | Drei Spaces und Dokumentkatalog müssen validiert sein | Finalen Seitenkatalog übergeben |
| Playthroughs, SIT, UAT, Training, Cutover, GO_SIMULATION, Go-live-Simulation, Hypercare, Restart, Monatsabschluss, UStVA-Vorschau, Abschluss und Supportübergabe | Je Prozessschritt strukturierte Evidence mit Status und Quellenklasse | Setup/Hypercare sind höchstens teilweise; Readback/Writes bleiben getrennt | Finalen BC-Basic-Snapshot mit realer Evidence abwarten |
| Gates und Quellenklassifikation | Manifest, Digest, Release-ID und klare synthetisch/produktiv-Grenze | Nur validiertes Release ist belegt; Simulation ist nicht Produktion | Exakten finalen Snapshot- und Producer-Commit binden |

## Erwarteter Übergabevertrag

Für die abschließende Bindung benötigt der Twin einen validierten Release-Pointer mit Kunden-ID, `projectId`, Release-ID, Manifestdigest, vollständiger Producer-Commit-SHA, kanonischem Index, positiver Dateiliste und Inhaltsdigests. Der Producerstand muss sauber und commitgebunden sein. Erst danach werden vollständige Tests, Build, Deutschgate sowie Desktop-, Mobile- und negative Browser-Evidence gegen genau diesen Stand ausgeführt.

Der aktuelle `UABC-PORTABLE-PILOT-0005` bleibt ein Zwischenstand. Vorbereitete oder synthetisch abgeschlossene Inhalte werden sichtbar getrennt; eine produktive Kundenrealisierung, Abnahme oder Supportübergabe wird daraus nicht abgeleitet.
