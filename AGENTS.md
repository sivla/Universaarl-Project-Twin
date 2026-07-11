# Regel für Versionsstände und Veröffentlichungen

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
