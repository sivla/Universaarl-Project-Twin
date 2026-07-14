# Änderungsvorschlag: MVP des schreibgeschützten Projektzwillings

- Änderung: `establish-read-only-project-twin-mvp`
- Status: `active`
- Umfang: Adapter, normalisiertes Lesemodell, horizontale Benutzeroberfläche, portabler Release-Snapshotvertrag, nachrangige Projektdokumentation, source-driven Projekttagebuch, Prüfungen

Der aktuelle Integrationsblock liest das BC-Basic-Release `UABC-PORTABLE-PILOT-0004` über dessen portablen Snapshotvertrag. Das unveränderliche Release enthält einen kanonischen Projektindex, 158 unveränderte Projektquellen, insgesamt 161 gebundene Dateien, einen Knowledge-Payload und ein Katalogfragment. Der Manifestdigest lautet `38fcef85b101c05aee075a0692e08956a5090796aa2015affd5c687a2503daf3`; die Projektpayload-Provenienz `83a63c0af8775001e4c7f909a46c5b227f3cce3d` ist ausschließlich Provenienz. Der veröffentlichende Repositorycommit `281d2bab4fadce74c7756cc42a14dbf0a6a9eb45` bindet Pointer und Releasebytes unveränderlich. Release `UABC-PORTABLE-PILOT-0003` bleibt historische Evidence und wird nicht als aktueller Katalogstand umgedeutet. Die gebundene Spectra-Version `spectra-v1.2.0-alpha.12` besitzt einen echten unveränderlichen Release-Nachweis. Zusätzlich zur Setup-Wave-1-Projektion werden der CORE-FINANCE-Payload, sein Paketmanifest und sein JSON-Schema aus den manifestgeprüften Releasebytes validiert. Sichtbar ist ausschließlich die kontrolliert vorbereitete Definition; sie ist weder in BC angewendet noch kundenseitig abgenommen. W0-01, Zielentscheidung, Resetpunkt, Steuerbestätigung und Schreibfreigabe bleiben offen. Der Twin zeigt den Standard-CRONUS-Ausgangsstand weiterhin ausschließlich als bereitgestellte Projektinformation und übernimmt keine Live-Ausführungsbehauptung.

Ein enger Konsistenz-Guard koppelt aktuelle Company-/Setup-Ausführungsevidence an den typisierten Pilot- und Schreibstatus. Historische Evidence bleibt nur dann nachrangig sichtbar, wenn der Producer sie ausdrücklich mit currentAuthority false kennzeichnet; andernfalls wird ein nicht eingerichteter oder nicht beschriebener Pilot fail-closed abgelehnt. Der aktuelle W0-01-Versuch ist nur gültig, wenn Projektion und Evidence denselben positivgelisteten Pfad, den blockierten Status, fehlende BC-Readback-Autorität, fehlende Feldwerte, fehlenden Screenshot und ausgebliebene Writes belegen.

## Snapshot-Katalog und macOS-Onboarding

Der neue Laufzeitvertrag ersetzt die direkte Git-Arbeitsbaum-, Branch-, Commit- und Tree-Bindung vollständig. Project Twin liest ausschließlich ein explizites Kunden-/Projektregister, dessen Einträge auf einen lokalen Ordnerkatalog oder eine HTTPS-Adresse zeigen. Beide Transporte verwenden denselben Vertrag aus `current.json`, unveränderlichem Release-Manifest, positiver Dateiliste und SHA-256-Digests. Eine Commit-SHA ist nur optionale Manifestprovenienz.

Die Konfiguration liegt außerhalb des Repositorys nach XDG, enthält keine Secrets und kann durch CLI-Argumente übersteuert werden. Ein synthetisches Zwei-Kunden-Szenario beweist die Trennung. Der plattformneutrale Starter erhält Configure und einen katalogbasierten Doctor. Das echte macOS-Runnergate bleibt bis zu einem nachgewiesenen Fresh-Clone-Lauf ausdrücklich offen. Der Producer bindet den echten Spectra-Release `spectra-v1.2.0-alpha.12` samt Commit, Tagobjekt, Manifest und Digests; der Twin übernimmt ausschließlich diese belegte Producerprovenienz und erfindet keine Versions- oder Releasebindung.

Der reale Producervertrag ist ab `UABC-PORTABLE-PILOT-0003` kein vom Twin vorkompilierter `project-state`-Payload. Die Kundeninstanz veröffentlicht stattdessen den kanonischen Projektindex und alle darin positivgelisteten Quellbytes als unveränderliches, digestgebundenes Release. Der Twin validiert Pointer, Release-Manifest, Spectra-Bindung, Projektindex, vollständige Quellenmenge und jeden einzelnen Datei-Digest und normalisiert erst danach im Arbeitsspeicher. Dadurch bleiben Datenhoheit und Ableitungslogik getrennt: BC Basic veröffentlicht fachliche Quellbytes, der Twin erzeugt nur seine lesende Darstellung und benötigt zur Laufzeit weder ein Git-Repository noch das Git-Programm.

## Problem
Der Blueprint ist maßgeblich, lässt sich jedoch nur schwer als zusammenhängende Projektwelt erkunden. Der Projektzwilling muss ihn darstellen, ohne fachliche Wahrheit zu kopieren oder Änderungen zurückzuschreiben.

## Nicht-Ziele
Keine Statusänderungen oder anderen Rückschreibungen, keine erfundene Historie, keine Rekonstruktion früherer Dokumentinhalte ohne versionierte Quelle, keine eigene Abrechnung, keine Authentifizierungszustände der Quelle, Ablaufspuren, Videos, Mandantenkennungen oder Geheimnisse.
## Lokale Betriebsbereitschaft

Der Twin erhält einen strikt lokalen Einzeloperator-Vertrag mit drei getrennten Reifestufen: Plattformbereitschaft, Onboardingbereitschaft und ausschließlich producerabhängige Kunden-Go-live-Bereitschaft. Katalogwechsel, Konfigurationssicherung, Update-Preflight, atomare Aktivierung, Rollback und bereinigte Diagnose bleiben außerhalb der Fachdaten und schreiben niemals in den Snapshot zurück. LAN, Mehrbenutzerzugriff, Authentifizierung und TLS-Terminierung sind nicht Bestandteil dieses lokalen Betriebsmodells. Eine öffentliche Distribution bleibt bis zur ausdrücklichen menschlichen Lizenzentscheidung offen.

## Repository-Trennung

Der Projektstand wird ohne History-Rewrite aus dem gemeinsam genutzten Repository `sivla/FiBu.git` in das eigene öffentliche Repository `sivla/Universaarl-Project-Twin.git` migriert. Der Ausgangscommit `0e6f7c931a073955fd4920247f6ffc49eff6e0f4` und sein Tree `9991b193c0a50eb668ccc1d5519a47968a811e35` bleiben bytegenau in der Historie erhalten. `main` ist der stabile Standardzweig; `codex/universaarl-projekt-twin` bleibt der Arbeitszweig für den laufenden Portfolioabschluss.

Die kanonische Kundeninstanz liegt nach ihrer kontrollierten Migration unter `sivla/Universaarl-BC-Basic`. Der Plattformworkflow liest ausschließlich deren veröffentlichten Snapshot-Katalog; der Twin fällt nicht auf `FiBu`, einen Arbeitsbaum oder eine andere Quelle zurück. Merge, Tag und Release bleiben beim externen Freigabeprozess.
