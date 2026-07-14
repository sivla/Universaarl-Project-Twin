# Änderungsvorschlag: MVP des schreibgeschützten Projektzwillings

- Änderung: `establish-read-only-project-twin-mvp`
- Status: `active`
- Umfang: Adapter, normalisiertes Lesemodell, horizontale Benutzeroberfläche, commitgebundener Snapshotvertrag, nachrangige Projektdokumentation, source-driven Projekttagebuch, Prüfungen

Der aktuelle Integrationsblock bindet den Twin exakt an den unabhängig validierten BC-Basic-Commit `5f3aa2e2bffa847430c7ded2a1b3b8b740fe5bc1` mit Tree `707141acbe7f144b984a87411540f4a8e8078dad`. Die Allowlist enthält 145 Artefakte. Zusätzlich zur Setup-Wave-1-Projektion werden der CORE-FINANCE-Payload, sein Paketmanifest und sein JSON-Schema commit- und digestgebunden validiert. Sichtbar ist ausschließlich die kontrolliert vorbereitete Definition mit 19 Pakettabellen und 51 Datensätzen sowie sieben manuellen Tabellen mit 18 Werten; sie ist weder in BC angewendet noch kundenseitig abgenommen. W0-01, Zielentscheidung, Resetpunkt, Steuerbestätigung und Schreibfreigabe bleiben offen. Der Twin zeigt den Standard-CRONUS-Ausgangsstand weiterhin ausschließlich als bereitgestellte Projektinformation und übernimmt keine Live-Ausführungsbehauptung.

Ein enger Konsistenz-Guard koppelt aktuelle Company-/Setup-Ausführungsevidence an den typisierten Pilot- und Schreibstatus. Historische Evidence bleibt nur dann nachrangig sichtbar, wenn der Producer sie ausdrücklich mit currentAuthority false kennzeichnet; andernfalls wird ein nicht eingerichteter oder nicht beschriebener Pilot fail-closed abgelehnt. Der aktuelle W0-01-Versuch ist nur gültig, wenn Projektion und Evidence denselben positivgelisteten Pfad, den blockierten Status, fehlende BC-Readback-Autorität, fehlende Feldwerte, fehlenden Screenshot und ausgebliebene Writes belegen.

## Snapshot-Katalog und macOS-Onboarding

Der neue Laufzeitvertrag ersetzt die direkte Git-Arbeitsbaum-, Branch-, Commit- und Tree-Bindung vollständig. Project Twin liest ausschließlich ein explizites Kunden-/Projektregister, dessen Einträge auf einen lokalen Ordnerkatalog oder eine HTTPS-Adresse zeigen. Beide Transporte verwenden denselben Vertrag aus `current.json`, unveränderlichem Release-Manifest, positiver Dateiliste und SHA-256-Digests. Eine Commit-SHA ist nur optionale Manifestprovenienz.

Die Konfiguration liegt außerhalb des Repositorys nach XDG, enthält keine Secrets und kann durch CLI-Argumente übersteuert werden. Ein synthetisches Zwei-Kunden-Szenario beweist die Trennung. Der plattformneutrale Starter erhält Configure und einen katalogbasierten Doctor. Das echte macOS-Runnergate bleibt bis zu einem nachgewiesenen Fresh-Clone-Lauf ausdrücklich offen. Der fachlich grüne, aber noch nicht veröffentlichte Spectra-Vertrag bleibt `PENDING_BCPROJECTOS_RELEASE`; es wird keine Versions- oder Releasebindung erfunden.

## Problem
Der Blueprint ist maßgeblich, lässt sich jedoch nur schwer als zusammenhängende Projektwelt erkunden. Der Projektzwilling muss ihn darstellen, ohne fachliche Wahrheit zu kopieren oder Änderungen zurückzuschreiben.

## Nicht-Ziele
Keine Statusänderungen oder anderen Rückschreibungen, keine erfundene Historie, keine Rekonstruktion früherer Dokumentinhalte ohne versionierte Quelle, keine eigene Abrechnung, keine Authentifizierungszustände der Quelle, Ablaufspuren, Videos, Mandantenkennungen oder Geheimnisse.
## Vorbereitung der Repository-Trennung

Der bestehende technische Stand bleibt unverändert. Für die spätere Migration aus dem gemeinsam genutzten Repository sivla/FiBu.git wird ausschließlich der folgende Zielvertrag vorgemerkt: Zielrepository Universaarl-Project-Twin, Zielzweig main, Arbeitszweige codex/.... Erhalten werden die aktuelle Commit-SHA 28e9abe6f16a189ba24c6b1a328f1f5726c9ae66, der Parent f7d45dd45b2726aa64602fd74183c41586865f8f und die Tree-SHA 8743e8595841eaa75376b63ba59fd589b2192015.

Der Projekt-Agent darf später ausschließlich den eigenen Arbeitszweig pushen und einen Pull Request eröffnen. Merge, Tag und Release bleiben beim externen Freigabeprozess. In diesem Auftrag werden weder Remote noch GitHub-Repository angelegt oder verändert.
