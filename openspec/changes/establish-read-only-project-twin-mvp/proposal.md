# Änderungsvorschlag: MVP des schreibgeschützten Projektzwillings

- Änderung: `establish-read-only-project-twin-mvp`
- Status: `active`
- Umfang: Adapter, normalisiertes Lesemodell, horizontale Benutzeroberfläche, commitgebundener Snapshotvertrag, nachrangige Projektdokumentation, source-driven Projekttagebuch, Prüfungen

Der aktuelle Integrationsblock bindet den Twin exakt an den unabhängig validierten BC-Basic-Commit `5f2d5dccb56dff7cec26885edf098f46ecbeee61` mit Tree `b5763702f2c8b0fe9da37f52b54797e1cb715da7`. Die Allowlist enthält 138 Artefakte sowie genau eine Setup-Wave-1-Projektion samt Schema. Der Twin liest ausschließlich diese Projektion und zeigt den nur-lesenden Standard-CRONUS-Ausgangs- und offenen Pilotvorbereitungsstand kompakt im Projektcockpit; interne Matrix-, Blueprint- und Evidence-Dateien werden nicht direkt gelesen. Index- und Projektionsdigest stimmen mit der commitgebundenen Adapterprovenienz überein. Historische Referenzevidence bleibt nachrangige Provenienz und fließt nicht in aktuelle Ticket-, Budget- oder Tagebuchrollups ein.

Ein enger Konsistenz-Guard koppelt aktuelle Company-/Setup-Ausführungsevidence an den typisierten Pilot- und Schreibstatus. Historische Evidence bleibt nur dann nachrangig sichtbar, wenn der Producer sie ausdrücklich mit currentAuthority false kennzeichnet; andernfalls wird ein nicht eingerichteter oder nicht beschriebener Pilot fail-closed abgelehnt.

Im laufenden Betrieb ist keine feste Commit-SHA zu pflegen. Der konfigurierte BC-Producerbranch `codex/universaarl-projekt` wird bei Start und Aktualisierung genau einmal aufgelöst; erst ein vollständig validierter Kandidat ersetzt atomar den letzten gültigen, weiterhin sichtbaren Stand. Der Delivery-Commit wird ausschließlich im temporären Integrationsmodus exakt geprüft und ändert den Runtimekanal nicht.

## Problem
Der Blueprint ist maßgeblich, lässt sich jedoch nur schwer als zusammenhängende Projektwelt erkunden. Der Projektzwilling muss ihn darstellen, ohne fachliche Wahrheit zu kopieren oder Änderungen zurückzuschreiben.

## Nicht-Ziele
Keine Statusänderungen oder anderen Rückschreibungen, keine erfundene Historie, keine Rekonstruktion früherer Dokumentinhalte ohne versionierte Quelle, keine eigene Abrechnung, keine Authentifizierungszustände der Quelle, Ablaufspuren, Videos, Mandantenkennungen oder Geheimnisse.
## Vorbereitung der Repository-Trennung

Der bestehende technische Stand bleibt unverändert. Für die spätere Migration aus dem gemeinsam genutzten Repository sivla/FiBu.git wird ausschließlich der folgende Zielvertrag vorgemerkt: Zielrepository Universaarl-Project-Twin, Zielzweig main, Arbeitszweige codex/.... Erhalten werden die aktuelle Commit-SHA 28e9abe6f16a189ba24c6b1a328f1f5726c9ae66, der Parent f7d45dd45b2726aa64602fd74183c41586865f8f und die Tree-SHA 8743e8595841eaa75376b63ba59fd589b2192015.

Der Projekt-Agent darf später ausschließlich den eigenen Arbeitszweig pushen und einen Pull Request eröffnen. Merge, Tag und Release bleiben beim externen Freigabeprozess. In diesem Auftrag werden weder Remote noch GitHub-Repository angelegt oder verändert.
