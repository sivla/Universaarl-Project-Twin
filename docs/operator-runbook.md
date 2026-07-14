# Betriebshandbuch für den lokalen Project Twin

## Betriebsgrenze

Project Twin läuft ausschließlich auf `127.0.0.1` für einen lokalen Einzeloperator. LAN-Betrieb, Mehrbenutzerzugriff, Authentifizierung und TLS-Terminierung sind nicht unterstützt. Der Twin liest nur validierte Snapshot-Kataloge und schreibt weder in Kundenquellen noch in Fachdaten zurück.

## Installation und Diagnose

```powershell
npm ci
npm run twin:bootstrap
npm run twin:doctor
npm run twin:diagnose
```

Die Konfiguration liegt außerhalb des Repositorys im XDG-Konfigurationsordner. Sie enthält nur Katalogadressen und erwartete Kunden-/Projektkennungen, keine Secrets.

## Kunden- und Projektwechsel

Ein Wechsel aktiviert nur einen bereits registrierten Katalog:

```powershell
npm run twin:switch -- --catalog-id kunde-a
```

Der Doctor validiert danach Pointer, unveränderliches Release, Identität und Digests. Ein unbekannter oder widersprüchlicher Katalog wird abgelehnt.

## Sicherung und Wiederherstellung

```powershell
npm run twin:backup -- --backup C:\Sicherungen\twin-config.json
npm run twin:restore -- --backup C:\Sicherungen\twin-config.json
```

Die Sicherung enthält ausschließlich die lokale Katalogkonfiguration. Fachinhalte, Laufzeitdaten und Secrets werden nicht gespeichert.

## Update und Rollback

```powershell
npm run twin:update:preflight -- --candidate C:\Release\release.json
npm run twin:upgrade -- --candidate C:\Release\release.json
npm run twin:rollback
```

Der Preflight prüft Versions-, Konfigurations-, Snapshot- und Paketdigest-Kompatibilität. Die Aktivierung ersetzt den lokalen Releasezeiger atomar. Ein veränderter Release oder ein Downgrade wird abgelehnt; der Rollback verwendet ausschließlich den zuvor validierten Release.

## Start, Status und Stop

```powershell
npm run twin:start
npm run twin:status
npm run twin:stop
```

Ein gesunder eigener Prozess wird idempotent erkannt. Fremde oder ungesunde Portbelegung wird nicht beendet. Diagnoseausgaben kürzen und bereinigen lokale Pfade und Adressen.

## Störung

1. `npm run twin:status` ausführen.
2. `npm run twin:diagnose` erfassen.
3. Snapshot-Katalog und aktive Projektkennung mit `npm run twin:doctor` prüfen.
4. Bei einem fehlerhaften Update `npm run twin:rollback` ausführen.
5. Bei ungültigem Kundensnapshot den Producer korrigieren lassen; niemals lokal übergehen.

## Freigabegrenzen

Plattformbereitschaft und lokales Onboarding werden durch Tests, Runbook und Plattformmatrix belegt. Kunden-Go-live bleibt ausschließlich vom validierten Producerstand abhängig. Eine öffentliche Distribution bleibt bis zu einer ausdrücklichen menschlichen Lizenzentscheidung `internal-only`.
