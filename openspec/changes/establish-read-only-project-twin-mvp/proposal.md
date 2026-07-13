# Änderungsvorschlag: MVP des schreibgeschützten Projektzwillings

- Änderung: `establish-read-only-project-twin-mvp`
- Status: `active`
- Umfang: Adapter, normalisiertes Lesemodell, horizontale Benutzeroberfläche, commitgebundener Snapshotvertrag, nachrangige Projektdokumentation, source-driven Projekttagebuch, Prüfungen

Der aktuelle Integrationsblock bindet den Twin exakt an den unabhängig validierten BC-Basic-Commit `e3b2fb7f13d2e2ba722a5f841edf659a3e731933` mit Tree `0c330f03d50cc5b65bd21977318747712d4782e7`. Die Allowlist enthält 139 Artefakte sowie genau eine Setup-Wave-1-Projektion, ihr Schema und den positivgelisteten W0-01-Readbackversuch. Der Twin zeigt den Standard-CRONUS-Ausgangsstand ausschließlich als bereitgestellte Projektinformation und weist Firmenname, interne Company-ID, Firmendaten, Country/Region und CRONUS-Indizien ohne BC-Readback-Autorität ausdrücklich als nicht verifiziert aus. Browsername und URL-Parameter sind kein Feldnachweis. Historische Referenzevidence bleibt nachrangige Provenienz und fließt nicht in aktuelle Ticket-, Budget- oder Tagebuchrollups ein.

Ein enger Konsistenz-Guard koppelt aktuelle Company-/Setup-Ausführungsevidence an den typisierten Pilot- und Schreibstatus. Historische Evidence bleibt nur dann nachrangig sichtbar, wenn der Producer sie ausdrücklich mit currentAuthority false kennzeichnet; andernfalls wird ein nicht eingerichteter oder nicht beschriebener Pilot fail-closed abgelehnt. Der aktuelle W0-01-Versuch ist nur gültig, wenn Projektion und Evidence denselben positivgelisteten Pfad, den blockierten Status, fehlende BC-Readback-Autorität, fehlende Feldwerte, fehlenden Screenshot und ausgebliebene Writes belegen.

Im laufenden Betrieb ist keine feste Commit-SHA zu pflegen. Der konfigurierte BC-Producerbranch `codex/universaarl-projekt` wird bei Start und Aktualisierung genau einmal aufgelöst; erst ein vollständig validierter Kandidat ersetzt atomar den letzten gültigen, weiterhin sichtbaren Stand. Der Delivery-Commit wird ausschließlich im temporären Integrationsmodus exakt geprüft und ändert den Runtimekanal nicht.

## Problem
Der Blueprint ist maßgeblich, lässt sich jedoch nur schwer als zusammenhängende Projektwelt erkunden. Der Projektzwilling muss ihn darstellen, ohne fachliche Wahrheit zu kopieren oder Änderungen zurückzuschreiben.

## Nicht-Ziele
Keine Statusänderungen oder anderen Rückschreibungen, keine erfundene Historie, keine Rekonstruktion früherer Dokumentinhalte ohne versionierte Quelle, keine eigene Abrechnung, keine Authentifizierungszustände der Quelle, Ablaufspuren, Videos, Mandantenkennungen oder Geheimnisse.
## Vorbereitung der Repository-Trennung

Der bestehende technische Stand bleibt unverändert. Für die spätere Migration aus dem gemeinsam genutzten Repository sivla/FiBu.git wird ausschließlich der folgende Zielvertrag vorgemerkt: Zielrepository Universaarl-Project-Twin, Zielzweig main, Arbeitszweige codex/.... Erhalten werden die aktuelle Commit-SHA 28e9abe6f16a189ba24c6b1a328f1f5726c9ae66, der Parent f7d45dd45b2726aa64602fd74183c41586865f8f und die Tree-SHA 8743e8595841eaa75376b63ba59fd589b2192015.

Der Projekt-Agent darf später ausschließlich den eigenen Arbeitszweig pushen und einen Pull Request eröffnen. Merge, Tag und Release bleiben beim externen Freigabeprozess. In diesem Auftrag werden weder Remote noch GitHub-Repository angelegt oder verändert.
