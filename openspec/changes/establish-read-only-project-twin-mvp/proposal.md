# Änderungsvorschlag: MVP des schreibgeschützten Projektzwillings

- Änderung: `establish-read-only-project-twin-mvp`
- Status: `active`
- Umfang: Adapter, normalisiertes Lesemodell, horizontale Benutzeroberfläche, portabler Release-Snapshotvertrag, nachrangige Projektdokumentation, source-driven Projekttagebuch, Prüfungen

Der aktuelle Integrationsblock liest das BC-Basic-Release `UABC-PORTABLE-PILOT-0003` über dessen portablen Snapshotvertrag. Das unveränderliche Release enthält einen kanonischen Projektindex, 158 unveränderte Projektquellen, einen Knowledge-Payload und ein Katalogfragment. Der Manifestdigest lautet `5710f0c5315ede59f8af1bbe6a154725a180ef9c87c6502a83f1008892eaf863`; die Producer-Commit-SHA `8132f2ce692dfcb8e12a3a4db4a287c643a6376f` ist ausschließlich Provenienz. Die gebundene Spectra-Version `spectra-v1.2.0-alpha.12` besitzt einen echten unveränderlichen Release-Nachweis. Zusätzlich zur Setup-Wave-1-Projektion werden der CORE-FINANCE-Payload, sein Paketmanifest und sein JSON-Schema aus den manifestgeprüften Releasebytes validiert. Sichtbar ist ausschließlich die kontrolliert vorbereitete Definition; sie ist weder in BC angewendet noch kundenseitig abgenommen. W0-01, Zielentscheidung, Resetpunkt, Steuerbestätigung und Schreibfreigabe bleiben offen. Der Twin zeigt den Standard-CRONUS-Ausgangsstand weiterhin ausschließlich als bereitgestellte Projektinformation und übernimmt keine Live-Ausführungsbehauptung.

Ein enger Konsistenz-Guard koppelt aktuelle Company-/Setup-Ausführungsevidence an den typisierten Pilot- und Schreibstatus. Historische Evidence bleibt nur dann nachrangig sichtbar, wenn der Producer sie ausdrücklich mit currentAuthority false kennzeichnet; andernfalls wird ein nicht eingerichteter oder nicht beschriebener Pilot fail-closed abgelehnt. Der aktuelle W0-01-Versuch ist nur gültig, wenn Projektion und Evidence denselben positivgelisteten Pfad, den blockierten Status, fehlende BC-Readback-Autorität, fehlende Feldwerte, fehlenden Screenshot und ausgebliebene Writes belegen.

## Snapshot-Katalog und macOS-Onboarding

Der neue Laufzeitvertrag ersetzt die direkte Git-Arbeitsbaum-, Branch-, Commit- und Tree-Bindung vollständig. Project Twin liest ausschließlich ein explizites Kunden-/Projektregister, dessen Einträge auf einen lokalen Ordnerkatalog oder eine HTTPS-Adresse zeigen. Beide Transporte verwenden denselben Vertrag aus `current.json`, unveränderlichem Release-Manifest, positiver Dateiliste und SHA-256-Digests. Eine Commit-SHA ist nur optionale Manifestprovenienz.

Die Konfiguration liegt außerhalb des Repositorys nach XDG, enthält keine Secrets und kann durch CLI-Argumente übersteuert werden. Ein synthetisches Zwei-Kunden-Szenario beweist die Trennung. Der plattformneutrale Starter erhält Configure und einen katalogbasierten Doctor. Das echte macOS-Runnergate bleibt bis zu einem nachgewiesenen Fresh-Clone-Lauf ausdrücklich offen. Der Producer bindet den echten Spectra-Release `spectra-v1.2.0-alpha.12` samt Commit, Tagobjekt, Manifest und Digests; der Twin übernimmt ausschließlich diese belegte Producerprovenienz und erfindet keine Versions- oder Releasebindung.

Der reale Producervertrag ist ab `UABC-PORTABLE-PILOT-0003` kein vom Twin vorkompilierter `project-state`-Payload. Die Kundeninstanz veröffentlicht stattdessen den kanonischen Projektindex und alle darin positivgelisteten Quellbytes als unveränderliches, digestgebundenes Release. Der Twin validiert Pointer, Release-Manifest, Spectra-Bindung, Projektindex, vollständige Quellenmenge und jeden einzelnen Datei-Digest und normalisiert erst danach im Arbeitsspeicher. Dadurch bleiben Datenhoheit und Ableitungslogik getrennt: BC Basic veröffentlicht fachliche Quellbytes, der Twin erzeugt nur seine lesende Darstellung und benötigt zur Laufzeit weder ein Git-Repository noch das Git-Programm.

## Problem
Der Blueprint ist maßgeblich, lässt sich jedoch nur schwer als zusammenhängende Projektwelt erkunden. Der Projektzwilling muss ihn darstellen, ohne fachliche Wahrheit zu kopieren oder Änderungen zurückzuschreiben.

## Nicht-Ziele
Keine Statusänderungen oder anderen Rückschreibungen, keine erfundene Historie, keine Rekonstruktion früherer Dokumentinhalte ohne versionierte Quelle, keine eigene Abrechnung, keine Authentifizierungszustände der Quelle, Ablaufspuren, Videos, Mandantenkennungen oder Geheimnisse.
## Vorbereitung der Repository-Trennung

Der bestehende technische Stand bleibt unverändert. Für die spätere Migration aus dem gemeinsam genutzten Repository sivla/FiBu.git wird ausschließlich der folgende Zielvertrag vorgemerkt: Zielrepository Universaarl-Project-Twin, Zielzweig main, Arbeitszweige codex/.... Erhalten werden die aktuelle Commit-SHA 28e9abe6f16a189ba24c6b1a328f1f5726c9ae66, der Parent f7d45dd45b2726aa64602fd74183c41586865f8f und die Tree-SHA 8743e8595841eaa75376b63ba59fd589b2192015.

Der Projekt-Agent darf später ausschließlich den eigenen Arbeitszweig pushen und einen Pull Request eröffnen. Merge, Tag und Release bleiben beim externen Freigabeprozess. In diesem Auftrag werden weder Remote noch GitHub-Repository angelegt oder verändert.
