# Universaarl Project Twin

Project Twin ist eine strikt read-only arbeitende deutsche Projektansicht. Der Twin liest fachliche Daten ausschließlich aus einem validierten Snapshot-Katalog. Er scannt kein Kundenrepository, startet kein Git, schreibt nicht in die Quelle zurück und speichert keine fachlichen Payloads dauerhaft.

## Snapshot-Katalog

Jeder konfigurierte Katalog besitzt genau einen Einstieg `current.json`. Dieser Zeiger nennt ein unveränderliches Release-Manifest unter `releases/<releaseId>/manifest.json`. Das Manifest bindet Kunden-ID, Projekt-ID, Validierungsstatus sowie die vollständige positive Dateiliste mit Größe, Medientyp und SHA-256-Digest. Die lokale Ordnerquelle und HTTPS verwenden exakt denselben Byte- und Digestvertrag.

Eine optionale Commit-SHA im Manifest ist ausschließlich sichtbare Provenienz. Sie wird weder als Leseadresse noch als Laufzeitbindung verwendet. Ohne tatsächlich veröffentlichten Spectra-Release bleibt die Bindung ehrlich `PENDING_BCPROJECTOS_RELEASE`.

Die lokale Konfiguration enthält nur:

- Katalogtyp `filesystem` oder `https`
- Katalogadresse
- erwartete Kunden- und Projekt-ID
- optionalen Anzeigenamen

Sie enthält keine Tokens, Kennwörter oder fachlichen Inhalte. Standardmäßig wird sie im XDG-Konfigurationsverzeichnis unter `universaarl-twin/config.json` abgelegt. CLI-Argumente können einen Registereintrag für einen einzelnen Lauf überschreiben. `.env`-Dateien werden nicht gelesen.

## Schnellstart auf macOS

Voraussetzungen über Homebrew:

```sh
brew install node
node --version
npm --version
```

Repository klonen und Abhängigkeiten deterministisch installieren:

```sh
git clone <OEFFENTLICHE-REPOSITORY-ADRESSE> Universaarl-Project-Twin
cd Universaarl-Project-Twin
npm ci
npm run twin:bootstrap
```

Einen separat bereitgestellten lokalen Snapshot-Katalog konfigurieren:

```sh
npm run twin:configure -- \
  --catalog-id mein-projekt \
  --catalog-type filesystem \
  --catalog-address "/absoluter/pfad/zum/snapshot-katalog" \
  --customer-id MEIN-KUNDE \
  --project-id MEIN-PROJEKT \
  --display-name "Mein Projekt"
```

Für einen veröffentlichten HTTPS-Katalog wird ausschließlich Typ und Adresse geändert:

```sh
npm run twin:configure -- \
  --catalog-id mein-projekt \
  --catalog-type https \
  --catalog-address "https://beispiel.invalid/snapshots/mein-projekt/" \
  --customer-id MEIN-KUNDE \
  --project-id MEIN-PROJEKT
```

Anschließend:

```sh
npm run twin:doctor
npm run twin:start
npm run twin:status
```

Die Oberfläche ist unter `http://127.0.0.1:4173/` erreichbar. `npm run twin:start -- --open` öffnet sie nach erfolgreicher Health-Prüfung. Beenden:

```sh
npm run twin:stop
```

Start und Status sind idempotent. Stop beendet ausschließlich einen durch PID und Laufzeitkennung nachgewiesenen eigenen Prozess. Ein fremder oder ungesunder Dienst auf Port 4173 wird niemals beendet.

## Synthetische Demo

Die Demo enthält zwei vollständig synthetische Kundenkataloge und keine realen Kundeninhalte:

```sh
npm run twin:demo-catalog
npm run twin:start -- --config ".runtime/synthetischer-katalog/config.json"
```

## Plattformnachweis

Windows-Pfad-, Prozess- und Shellsemantik sind automatisiert geprüft. Das Evidence-Skript schreibt ausschließlich bereinigtes JSON:

```sh
npm run twin:evidence:macos
```

Auf einem Nicht-macOS-System lautet der Status ausdrücklich `PENDING_MACOS_RUNNER`. Eine macOS-Freigabe wird erst nach einem echten Fresh-Clone-Lauf mit `npm ci`, Configure, Doctor, Start, Health, Filesystem-/HTTPS-Parität, Stop und No-Writes-Nachweis behauptet.

Die bisherigen PowerShell-Aliase bleiben als Windows-Fallback vorhanden. Der normale, plattformneutrale Weg verwendet den Node-Starter.

## API und Sicherheitsgrenze

- `GET /api/projects`
- `GET /api/projects/:projectId/state`
- `GET /api/projects/:projectId/evidence/:evidenceId`
- `GET /api/projects/:projectId/resources/:resourceId/preview`
- `GET /api/projects/:projectId/resources/:resourceId/download`

Andere Methoden sind nicht erlaubt. Fremde Kunden-/Projektidentitäten, unsichere Pfade, Symlinks oder Junctions, fehlende Releases, falsche Digests, unbekannte Referenzen und ein während des Lesens verändertes `current.json` blockieren fail-closed mit HTTP 503.
