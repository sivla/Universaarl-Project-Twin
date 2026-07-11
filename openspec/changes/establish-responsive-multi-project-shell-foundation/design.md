# Entwurf

`ProjectContext` enthält ausschließlich Verzeichnis-ID, Schlüssel und Namen. `SourceSnapshot` enthält Zweig, vollständige Commit-SHA, Änderungszustand und Einlesezeit. Ein zukünftiger `ProjectTimeContext` bleibt ein separater, noch nicht implementierter Vertrag.

Das Projektverzeichnis löst die Projekt-ID ausschließlich serverseitig auf eine konfigurierte Quellenwurzel auf. Die Programmierschnittstellenverteilung validiert die Projekt-ID vor Adapter- oder Dateisystemzugriff. Nachweispfade bleiben serverintern; opake IDs werden deterministisch aus sicheren relativen PNG-Pfaden gebildet und erneut durch Grenzen für reale Pfadauflösung, symbolische Verknüpfungen, Größen, sichere Wurzeln und sensible Namen geprüft. Es wird keine Manifestbeziehung aus freiem Text abgeleitet.

Die React-Anwendungshülle verwendet kanonische Routen der Verlaufsschnittstelle und bricht Anfragen bei Kontextwechsel ab. Projektbezogene Oberflächendaten und Fehler werden beim Wechsel geleert. Der aktuelle Stand zeigt belegte Artefakte, Prüfnachweise, Datenlücken und sichere Provenienz, aber keine Historie. Fachbereiche außerhalb der Änderung zeigen Nicht-unterstützt-Zustände.

Zentrale semantische CSS-Werte bilden Graphit, dunkles Türkis, Türkis, helles Türkis, Weiß, Nebelgrau und Liniengrau ab. Die große Ansicht nutzt eine Seitenleiste, die mittlere Ansicht eine kompakte Navigation und die Mobilansicht eine untere Navigation mit modalem „Mehr“-Menü.
