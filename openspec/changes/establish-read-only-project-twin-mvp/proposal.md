# Änderungsvorschlag: MVP des schreibgeschützten Projektzwillings

- Änderung: `establish-read-only-project-twin-mvp`
- Status: `active`
- Umfang: Adapter, normalisiertes Lesemodell, horizontale Benutzeroberfläche, commitgebundener Snapshotvertrag, nachrangige Projektdokumentation, Prüfungen

Der aktuelle Integrationsblock bindet den Twin exakt an den unabhängig validierten BC-Basic-Commit `85870b514ef32b80778b824924707e88dd15dc3d` mit Tree `62954236bdea4c7f2dc1517730a935bd96ab665e`. Alle 135 Indexartefakte, 43 Dokumente, 28 Confluence-Seiten, 31 Navigationsknoten und 50 kundenlesbaren Tickets stammen aus dieser einen SHA. Der Runtimekanal bleibt unverändert `codex/universaarl-projekt`; der Twin zeigt die neue Country-/Company-Evidence nur nach erfolgreicher Commit-, Index-, Digest- und Referenzvalidierung.

Im laufenden Betrieb ist keine feste Commit-SHA zu pflegen. Der konfigurierte BC-Producerbranch `codex/universaarl-projekt` wird bei Start und Aktualisierung genau einmal aufgelöst; erst ein vollständig validierter Kandidat ersetzt atomar den letzten gültigen, weiterhin sichtbaren Stand. Der Delivery-Commit wird ausschließlich im temporären Integrationsmodus exakt geprüft und ändert den Runtimekanal nicht.

## Problem
Der Blueprint ist maßgeblich, lässt sich jedoch nur schwer als zusammenhängende Projektwelt erkunden. Der Projektzwilling muss ihn darstellen, ohne fachliche Wahrheit zu kopieren oder Änderungen zurückzuschreiben.

## Nicht-Ziele
Keine Statusänderungen, Besprechungen, Arbeitsprotokolle, Abrechnung, Spielentscheidungen, Authentifizierungszustände der Quelle, Ablaufspuren, Videos, Mandantenkennungen oder Geheimnisse.
## Vorbereitung der Repository-Trennung

Der bestehende technische Stand bleibt unverändert. Für die spätere Migration aus dem gemeinsam genutzten Repository sivla/FiBu.git wird ausschließlich der folgende Zielvertrag vorgemerkt: Zielrepository Universaarl-Project-Twin, Zielzweig main, Arbeitszweige codex/.... Erhalten werden die aktuelle Commit-SHA 28e9abe6f16a189ba24c6b1a328f1f5726c9ae66, der Parent f7d45dd45b2726aa64602fd74183c41586865f8f und die Tree-SHA 8743e8595841eaa75376b63ba59fd589b2192015.

Der Projekt-Agent darf später ausschließlich den eigenen Arbeitszweig pushen und einen Pull Request eröffnen. Merge, Tag und Release bleiben beim externen Freigabeprozess. In diesem Auftrag werden weder Remote noch GitHub-Repository angelegt oder verändert.
