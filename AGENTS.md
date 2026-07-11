# Regel für Versionsstände und Veröffentlichungen

## Universaarl-Gesamtarchitektur

Die gemeinsame Architektur trennt Produktvertrag, Kundenwahrheit, Prüfung und Visualisierung verbindlich:

- **BCProjectOS** ist der wiederverwendbare, kundenunabhängige Produktvertrag. Er definiert generische Schemas, IDs, Relationen, Statusmodelle, Ticketstrukturen, Generatoren, Validatoren und allgemeines Business-Central-Wissen; ungefiltertes Kundenwissen, Kundendaten, Kunden-Evidence und konkrete Universaarl-Projektentscheidungen gehören nicht hinein. Eine Bindung ist ausschließlich über einen echten, unveränderlichen Release-Tag mit Commit und Digest zulässig. Ohne solchen Release bleibt der Status ehrlich `PENDING_BCPROJECTOS_RELEASE`; weder eine Version noch ein Arbeitsstand darf erfunden werden.
- **Universaarl Projekt BC Basic** ist die fachliche Kundeninstanz und Source of Truth. Nur dort liegen Unternehmenswissen, Prozesse, Anforderungen, Epics, Stories, Tasks, Meetings, Tests, UAT, Evidence, kundenspezifische Abweichungen und konkrete Umsetzung. Bestehende fachliche IDs ändern sich nur mit ausdrücklicher Migrationsentscheidung. Wiederverwendbare Erkenntnisse dürfen ausschließlich anonymisiert, fachlich geprüft und zunächst als nicht übernommene `blueprint-candidates` zu BCProjectOS zurückfließen.
- **Universaarl Kontrollzentrum** steht außerhalb der fachlichen Datenkette. Es ist keine Kundeninstanz, enthält keine fachliche Kundenwahrheit und installiert kein BCProjectOS in einem Zielprojekt. Es liest und prüft Versionsbindung, Integrität, Projektzustand, Snapshot-Vertrag und Veröffentlichungsreife.
- **Universaarl Project Twin** liest ausschließlich einen validierten, versionierten Snapshot aus der Kundeninstanz und visualisiert ihn lesend. Die fachliche Datenkette verläuft von BCProjectOS über die Universaarl-Kundeninstanz und einen validierten Snapshot zum Project Twin. Project Twin ist niemals Source of Truth, schreibt niemals in die Kundeninstanz zurück, liest keine ungeprüften Arbeitsstände und hat keine direkte fachliche Abhängigkeit von BCProjectOS.

Absolute lokale Pfade dürfen nicht als dauerhafte fachliche oder technische Laufzeitbindung gespeichert werden. Änderungen und Veröffentlichungen bleiben zusätzlich den projektspezifischen Git-, Prüf- und Übergaberegeln unterworfen.

## Rollenspezifische Grenze: Universaarl Project Twin

Dieses Projekt ist ausschließlich die lesende Visualisierung eines validierten, versionierten Snapshots aus **Universaarl Projekt BC Basic**. Änderungen hier betreffen nur die Darstellung, den lokalen Snapshot-Vertrag und die zugehörigen Prüfungen; sie begründen weder fachliche Kundenwahrheit noch eine Rückschreibberechtigung. Das Projekt darf keinen ungeprüften Kundenarbeitsstand konsumieren, keine fachlichen Daten in die Kundeninstanz oder nach BCProjectOS zurückschreiben und keine direkte Laufzeitbindung zu BCProjectOS herstellen. Die Validierung und Versionierung des Snapshots erfolgen vor seiner Bereitstellung für Project Twin; das Kontrollzentrum prüft diese Grenze unabhängig.

## Arbeitsort und Git-Grenzen

- Schreibarbeit für dieses Projekt erfolgt ausschließlich in `C:\Users\kkali\Documents\Universaarl-Project-Twin` auf `codex/universaarl-projekt-twin`. Diese Pfadnennung beschreibt nur die aktuelle lokale Arbeitsraumzuordnung und ist keine Laufzeitbindung.
- Keine zusätzlichen Arbeits-Worktrees, Ausweichordner, technischen Nebencheckouts oder temporären Schreibkopien für Universaarl-Arbeit anlegen. Bereinigte commitgebundene Prüfkopien bleiben reine Wegwerf-Prüfquellen und werden nie bearbeitet.
- Vor Beginn jeder Änderung tatsächlichen Projektpfad, Zweig, volle HEAD-SHA und `git status --short` prüfen. Lesende Git-Abfragen verwenden `GIT_OPTIONAL_LOCKS=0`.
- Bereits vorhandene lokale oder fremde Änderungen bleiben erhalten. Sie werden weder zurückgesetzt noch ungeprüft gestaged, umsortiert oder in den eigenen Versionsstand aufgenommen.

## OpenSpec ist verbindlich

- Koordinierte Vorhaben, neue oder geänderte Verträge, Schemas, Sicherheitsregeln, Snapshot-Schnittstellen, Publish-Gates und projektübergreifende Arbeit beginnen als OpenSpec-Änderung.
- Es darf höchstens eine nicht archivierte Änderung unter `openspec/changes/` aktiv sein. Bestehen mehrere aktive Änderungen, wird keine weitere begonnen; zuerst werden sie fachlich geordnet und nacheinander abgeschlossen oder nach ausdrücklicher Entscheidung archiviert.
- `proposal.md`, die betroffenen Spezifikationen, bei Bedarf `design.md` und eine eindeutige `tasks.md` werden vor der Umsetzung konsistent angelegt beziehungsweise aktualisiert. OpenSpec erweitert keine Benutzerfreigabe und keinen Projektscope.
- Aufgaben werden erst als erledigt markiert, wenn Umsetzung und geforderter Nachweis tatsächlich vorliegen. Nicht ausgeführt, unbekannt, nur geplant oder lediglich lokal beobachtet gilt nicht als bestanden.
- Archivierung erfolgt erst, wenn alle Aufgaben und Änderungs-Gates erfüllt sind und eine erforderliche menschliche Freigabe tatsächlich vorliegt. Freigaben werden niemals erfunden.

## Snapshot- und Lesegrenze

- Der Twin konsumiert ausschließlich einen validierten, versionierten Snapshot der Kundeninstanz. Eine lokale Projektwurzel oder Umgebungsvariable darf die Quelle technisch auswählen, begründet aber weder fachliche Identität noch Freigabe.
- Jeder unterstützte Lesevorgang ist fail-closed an die erwartete Projekt-ID, eine vollständige 40-stellige Quell-Commit-SHA, Snapshot-Schema, BCProjectOS-Bindung, Digest, positivgelistete relative Pfade und verbindliche Selektoren gebunden.
- Eine fehlende, unsaubere, veränderte, nicht commitgebundene oder widersprüchliche Quelle wird abgelehnt. Es gibt keinen Fallback auf ungeprüfte Arbeitskopien, erfundene Daten, zuletzt bekannte Werte oder eine direkte BCProjectOS-Abhängigkeit.
- Dauerhafte Verträge speichern keine maschinenspezifischen absoluten Pfade. Lokale Auflösung erfolgt nur über ausdrücklich definierte Konfiguration, Pfad-Aliase oder Umgebungsvariablen; die fachliche Identität bleibt versioniert.
- Nicht unterstützte oder fehlende Quelldaten bleiben sichtbar leer beziehungsweise werden als belegte Datenlücke ausgewiesen. Der Twin interpretiert technische Vorlagen nicht eigenständig als fachliche Wahrheit.
- Datei- und Nachweiszugriffe bleiben innerhalb sicher aufgelöster Wurzeln, verwenden positive Pfadlisten und blockieren Traversal, symbolische Verknüpfungen, Junctions, sensible Namen, unerlaubte Dateitypen und nicht validierte Medien.

## Prüf- und Nachweispflicht

- OpenSpec-Aufgaben zu Sicherheit, Darstellung oder Barrierefreiheit werden erst nach deterministischen Negativtests und dem jeweils verlangten echten Browsernachweis geschlossen.
- Der Browsernachweis deckt die vereinbarten Anzeigegrößen in Hell und Dunkel, sichtbare deutsche Inhalte, DOM-/A11y-Texte, Tastaturfokus, Dialog-/Fokusfang, Verlaufsnavigation und relevante Fehlerzustände ab. Geforderte Screenshots liegen unter `output/playwright/`.
- Ein grüner Einzeltest oder Build ersetzt weder Deutsch-, Snapshot-, Sicherheits-, Browser- noch Cross-Contract-Gate. Ergebnisse einer unsauberen Arbeitskopie sind kein Veröffentlichungsnachweis.
- Nutzerseitig sichtbare eigene Inhalte sind professionell deutsch. Unveränderliche technische IDs, SHAs, Pfade, API-Felder und externe Quellwerte bleiben korrekt; nicht freigegebene fremdsprachige Quelltitel werden nicht als sichtbarer oder für Barrierefreiheit erreichbarer Eigeninhalt ausgegeben.

## Übergabe an das Kontrollzentrum

Jede Übergabe nennt mindestens **projectId=project-twin**, den kanonischen Zweig, die vollständige Commit-SHA, ausgeführte Prüfungen, den commitgebundenen Deutsch-Nachweis, den OpenSpec-Stand, den Snapshot-/Quellbindungsstatus, den Browsernachweis, einen sauberen Arbeitsbaum sowie **REVIEW.md in Arbeitskopie: leer** und **REVIEW.md in HEAD: leer**. Ein offenes Commit-, Freigabe- oder Publish-Gate bleibt offen ausgewiesen.

Dieses Projekt erstellt seine Arbeit ausschließlich lokal als Git-Commit und übergibt diesen fertigen Commit an das **Universaarl Kontrollzentrum** unter `C:\Users\kkali\Documents\Universaarl ai`.

## Verbindliche Sprachregel

- Ganze Sätze, Überschriften, Inhalte der Benutzeroberfläche, Dokumentation, Fehlermeldungen, Barrierefreiheitstexte und Prüftitel sind natürlich deutsch formuliert.
- Etablierte Fachsprache und gebräuchliches Denglisch wie Workshop, Support, Go-live, Hypercare, Commit, read-only, Registry, API oder Worktree sind in einem deutschen Satz ausdrücklich erlaubt.
- Technische Kennungen, Typnamen, Pfade, API-Routen, Statuswerte, Befehle und echte Produktnamen bleiben unverändert, soweit ihre Übersetzung den Vertrag verfälschen würde.
- Das Sprachgate erkennt englische Sätze und Überschriften. Es betreibt keine Wortreinheit und sperrt keine Fachbegriffe allein wegen ihrer Herkunft.
- Vor jeder Übergabe muss das maschinenlesbare Deutschgate gegen die neue vollständige SHA des Versionsstands bestanden sein.

## Projekt-Agenten dürfen

- den Projektzwilling im ausdrücklich vereinbarten Umfang bearbeiten;
- Prüfungen und Erstellungsläufe ausführen;
- ein zusammenhängendes, fertiges Arbeitspaket als lokalen Git-Commit erstellen;
- den fertigen Stand mit Zweig, vollständiger SHA, Prüfergebnis und sauberem Git-Status übergeben.

Änderungsspezifische Freigabeschranken bleiben verbindlich. Ein Versionsstand darf erst erstellt werden, wenn diese Schranken ihn zulassen.

## Qualität des Versionsstands

- Nicht jeden kleinen Handgriff, Platzhalter oder unfertigen Zwischenstand einzeln festschreiben.
- Ein fachlich zusammenhängendes und nachvollziehbar prüfbares Paket darf bewusst zwei bis drei notwendige Umsetzungsschritte enthalten und wird dennoch als genau ein kohärenter Versionsstand übergeben.
- Eine gute Einheit verbindet beispielsweise Implementierung, passende Prüfungen und die notwendige Vertrags- oder Dokumentationsanpassung.
- Erst festschreiben, wenn das Paket in sich konsistent, prüfbar und verständlich begutachtbar ist.
- Keine inhaltsarmen Mikrostände und keine sachfremden Änderungen in einem Sammelstand.
- Wird eine Aufgabe größer, entstehen mehrere jeweils eigenständige und grüne Versionsstände.

## Prüfwarteschlange nach jedem Versionsstand

- Die verbindliche Prüfwarteschlange ist `REVIEW.md` im Projektwurzelverzeichnis.
- Vor dem Festschreiben alle Einträge nachvollziehbar bearbeiten und die Datei vollständig leeren.
- Nach jedem neuen Versionsstand ausdrücklich prüfen, dass `REVIEW.md` sowohl in der Arbeitskopie als auch in `HEAD` leer oder reiner Leerraum ist.
- `git show HEAD:REVIEW.md` darf keinen Inhalt ausgeben; `git status --short -- REVIEW.md` muss leer bleiben.
- Anschließend `UNIVERSAARL_PROJECT_ID=project-twin` und `UNIVERSAARL_EXPECTED_COMMIT=<vollständige-neue-sha>` setzen und `npm --silent run test:german` ausführen.
- Ist eine dieser Prüfungen rot, ist die Übergabe ungültig. Der Prüfnachweis nennt ausdrücklich: `REVIEW.md in HEAD: leer` und `Deutschgate: bestanden`.

## Rollen- und Veröffentlichungsgrenze

- Der Projekt-Agent erstellt ausschließlich lokale Git-Commits. Nur das Kontrollzentrum führt den zentral geprüften Push aus; der Projekt-Agent führt niemals `git push` oder eine erzwungene Übertragung aus.
- Er legt keine entfernten Repositories, Übertragungsadressen, Nachverfolgungszweige, Git-Marken, Freigaben oder Zusammenführungsanfragen an und verändert sie nicht.
- Unfertige oder fremde Änderungen dürfen nicht in den eigenen Versionsstand gelangen.
- Nach der lokalen Commit-Übergabe prüft ausschließlich das Kontrollzentrum den vorhandenen Commit erneut und überträgt ihn über seine zentrale Veröffentlichungsschranke.

Eine Ausnahme benötigt eine ausdrückliche Benutzeranweisung, die dieses Projekt und die konkret erlaubte Veröffentlichungsaktion nennt.
