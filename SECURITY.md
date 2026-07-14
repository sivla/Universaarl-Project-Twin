# Sicherheitsrichtlinie

## Unterstützte Stände

Sicherheitskorrekturen werden für den aktuellen Stand des Standardzweigs `main` bewertet. Arbeitszweige und historische Versionen erhalten keine eigenständige Zusage.

## Sicherheitslücken melden

Bitte veröffentliche mögliche Sicherheitslücken, Kundendaten oder Zugangsinformationen nicht in einem öffentlichen Issue. Nutze stattdessen die private Sicherheitsmeldung des GitHub-Repositorys. Falls diese Funktion nicht verfügbar ist, kontaktiere den Repositoryinhaber über sein GitHub-Profil und teile zunächst nur eine kurze Beschreibung ohne Geheimnisse oder Kundendaten.

Eine Meldung sollte die betroffene Version, reproduzierbare Schritte, die erwartete Auswirkung und eine sichere Kontaktmöglichkeit enthalten. Der Eingang wird geprüft, bevor Details oder ein Korrekturzeitplan veröffentlicht werden.

## Sicherheitsgrenze des Twin

Project Twin ist strikt read-only. Er darf keine ungeprüften Arbeitsstände, Secrets, Authentifizierungszustände oder direkten BCProjectOS-Zugriffe konsumieren. Snapshot-Identität, relative Pfade, Dateimodi, Digests und Referenzen werden fail-closed validiert.
