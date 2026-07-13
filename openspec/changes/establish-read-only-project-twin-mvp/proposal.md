# Änderungsvorschlag: MVP des schreibgeschützten Projektzwillings

- Änderung: `establish-read-only-project-twin-mvp`
- Status: `active`
- Umfang: Adapter, normalisiertes Lesemodell, horizontale Benutzeroberfläche, commitgebundener Snapshotvertrag, nachrangige Projektdokumentation, source-driven Projekttagebuch, Prüfungen

Der aktuelle Integrationsblock bindet den Twin exakt an den unabhängig validierten BC-Basic-Commit `700e897f883c5e286f26629c077110290511dbff` mit Tree `9d940e970162c7743413fa4b38828ee24a9f4e81`. Die Allowlist enthält 140 Artefakte sowie genau eine Setup-Wave-1-Projektion samt Schema. Der Twin liest ausschließlich diese Projektion und zeigt den nur-lesenden Standard-CRONUS-Ausgangs- und offenen Pilotvorbereitungsstand kompakt im Projektcockpit; interne Matrix-, Blueprint- und Evidence-Dateien werden nicht direkt gelesen. Index- und Projektionsdigest stimmen mit der commitgebundenen Adapterprovenienz überein. Historische Referenzevidence bleibt nachrangige Provenienz und fließt nicht in aktuelle Ticket-, Budget- oder Tagebuchrollups ein.

Im laufenden Betrieb ist keine feste Commit-SHA zu pflegen. Der konfigurierte BC-Producerbranch `codex/universaarl-projekt` wird bei Start und Aktualisierung genau einmal aufgelöst; erst ein vollständig validierter Kandidat ersetzt atomar den letzten gültigen, weiterhin sichtbaren Stand. Der Delivery-Commit wird ausschließlich im temporären Integrationsmodus exakt geprüft und ändert den Runtimekanal nicht.

## Problem
Der Blueprint ist maßgeblich, lässt sich jedoch nur schwer als zusammenhängende Projektwelt erkunden. Der Projektzwilling muss ihn darstellen, ohne fachliche Wahrheit zu kopieren oder Änderungen zurückzuschreiben.

## Nicht-Ziele
Keine Statusänderungen oder anderen Rückschreibungen, keine erfundene Historie, keine Rekonstruktion früherer Dokumentinhalte ohne versionierte Quelle, keine eigene Abrechnung, keine Authentifizierungszustände der Quelle, Ablaufspuren, Videos, Mandantenkennungen oder Geheimnisse.
## Vorbereitung der Repository-Trennung

Der bestehende technische Stand bleibt unverändert. Für die spätere Migration aus dem gemeinsam genutzten Repository sivla/FiBu.git wird ausschließlich der folgende Zielvertrag vorgemerkt: Zielrepository Universaarl-Project-Twin, Zielzweig main, Arbeitszweige codex/.... Erhalten werden die aktuelle Commit-SHA 28e9abe6f16a189ba24c6b1a328f1f5726c9ae66, der Parent f7d45dd45b2726aa64602fd74183c41586865f8f und die Tree-SHA 8743e8595841eaa75376b63ba59fd589b2192015.

Der Projekt-Agent darf später ausschließlich den eigenen Arbeitszweig pushen und einen Pull Request eröffnen. Merge, Tag und Release bleiben beim externen Freigabeprozess. In diesem Auftrag werden weder Remote noch GitHub-Repository angelegt oder verändert.
