# Commit- und Publishing-Regel

Dieses Projekt erstellt seine Arbeit lokal und uebergibt sie als Commit an das **Universaarl Kontrollzentrum** unter `C:\Users\kkali\Documents\Universaarl ai`.

## Projekt-Agenten duerfen

- den Project Twin im vereinbarten Scope bearbeiten;
- Tests und Build ausfuehren;
- zusammenhaengende, fertige Arbeit lokal committen;
- einen fertigen Commit mit Branch, vollstaendiger Commit-SHA, Pruefergebnis und sauberem Git-Status uebergeben.

Change-spezifische Freigabegates bleiben verbindlich. Ein Commit darf erst erstellt werden, wenn diese Gates ihn zulassen.

## Commit-Qualitaet

- Nicht jeden kleinen Handgriff, Platzhalter oder unfertigen Zwischenstand einzeln committen.
- Ein Commit soll ein zusammenhaengendes, fachlich sinnvolles Arbeitspaket abschliessen und darf dafuer bewusst zwei bis drei aufeinander aufbauende Umsetzungsschritte enthalten.
- Typische gute Einheit: Implementierung, passende Tests und eine erforderliche Vertrags- oder Dokumentationsanpassung.
- Erst committen, wenn das Arbeitspaket in sich konsistent, pruefbar und verstaendlich reviewbar ist.
- Keine kuenstliche Aufteilung in inhaltsarme Mikro-Commits, aber auch keine sachfremden Aenderungen in einen grossen Sammel-Commit mischen.
- Wenn eine Aufgabe groesser wird, mehrere jeweils eigenstaendige und gruene Commits erstellen.

## Review-Datei nach jedem Commit

- Die verbindliche Review-Warteschlange ist `REVIEW.md` im Projektroot.
- Vor jedem Commit alle Eintraege aus `REVIEW.md` nachvollziehbar bearbeiten und die Datei danach vollstaendig leeren.
- Nach jedem neuen Commit ausdruecklich pruefen, dass sowohl die Arbeitskopie als auch die in `HEAD` enthaltene `REVIEW.md` leer beziehungsweise rein whitespace sind.
- Empfohlene Kontrolle: `git show HEAD:REVIEW.md` darf keinen inhaltlichen Text ausgeben; `git status --short -- REVIEW.md` muss leer bleiben.
- Ist die Review-Datei nach dem Commit nicht leer oder fehlt sie im Commit, ist die Uebergabe ungueltig. Den Zustand korrigieren und erneut sauber committen, bevor das Kontrollzentrum informiert wird.
- Der uebergebene Pruefnachweis nennt ausdruecklich: `REVIEW.md in HEAD: leer`.

## Projekt-Agenten duerfen nicht

- `git push` oder Force-Push ausfuehren;
- Remotes, Push-URLs oder Upstreams anlegen oder veraendern;
- Tags, Releases oder Pull Requests veroeffentlichen;
- unfertige oder fremde Aenderungen in den eigenen Commit aufnehmen.

Nach dem lokalen Commit endet die normale Aufgabe mit der Uebergabe an das Kontrollzentrum. Ausschliesslich das Kontrollzentrum prueft den vorhandenen Commit noch einmal und veroeffentlicht ihn ueber sein zentrales Push-Gate.

Eine Ausnahme benoetigt eine ausdrueckliche Benutzeranweisung, die dieses Projekt und die erlaubte Publishing-Aktion konkret nennt.
