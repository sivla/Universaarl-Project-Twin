# Design

`ProjectContext` enthält ausschließlich Registry-ID, Key und Namen. `SourceSnapshot` enthält Branch, vollständigen Commit, Dirty-Status und Einlesezeit. Ein zukünftiger `ProjectTimeContext` bleibt ein separater, noch nicht implementierter Vertrag.

Die Registry löst Projekt-ID ausschließlich serverseitig auf eine konfigurierte Quellenwurzel auf. Die API-Verteilung validiert die Projekt-ID vor Adapter- oder Dateisystemzugriff. Nachweispfade bleiben serverintern; opake IDs werden deterministisch aus sicheren relativen PNG-Pfaden gebildet und erneut durch Realpath-, Symlink-, Größen-, Safe-Root- und Sensitive-Name-Grenzen geprüft. Es wird keine Manifestbeziehung aus freiem Text abgeleitet.

Die React-Shell verwendet kanonische Routen der Browser-History-API und bricht Anfragen bei Kontextwechsel ab. Projektbezogene Oberflächendaten und Fehler werden beim Wechsel geleert. Der aktuelle Stand zeigt aktuelle belegte Artefakte, Verification-Nachweise, Datenlücken und sichere Provenienz, aber keine Historie. Fachbereiche außerhalb der Änderung zeigen Nicht-unterstützt-Zustände.

Zentrale semantische CSS-Tokens bilden Graphit, dunkles Türkis, Türkis, helles Türkis, Weiß, Nebelgrau und Liniengrau ab. Desktop nutzt Sidebar, Tablet eine kompakte Navigation und Mobile eine Bottom-Navigation mit modalem „Mehr“-Menü.
