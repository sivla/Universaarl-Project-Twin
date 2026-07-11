# Anforderungen an den schreibgeschützten MVP

## Strikte Nur-Lesen-Grenze

Der Projektzwilling MUSS seine Fachdaten ausschließlich aus einem vorhandenen Git-Versionsstand lesen. Er DARF weder Quelldateien noch Git-Referenzen, Index, Arbeitskopie oder externe Systeme verändern.

Akzeptanz: Es existiert keine schreibende Programmierschnittstelle. Nicht unterstützte Methoden werden abgelehnt, und ein Lesevorgang verändert weder Quellenstatus noch Indexfingerabdruck.

## Projekt- und commitgebundene Momentaufnahme

`ProjectContext` MUSS das ausgewählte Projekt eindeutig bestimmen. `SourceSnapshot` MUSS die vollständige 40-stellige Commit-SHA, den Zweig, den Änderungszustand und die Einlesezeit enthalten. Jede dargestellte Momentaufnahme und jede Nachweis-ID MUSS an Projekt, Commit, Quellblob und sicheren internen Pfad gebunden sein.

Akzeptanz: Ein Nachweis eines Projekts oder Versionsstands ist unter einem anderen Projekt oder Versionsstand nicht auflösbar. Verzögerte Antworten eines vorherigen Projektkontexts werden nicht angezeigt.

## Sichere Provenienz und Nachweise

Repository-relative Provenienz MUSS auf ausdrücklich erlaubte Quellwurzeln und Einzelpfade begrenzt sein. Absolute Pfade, URI-Werte, Pfadüberschreitungen, sensible Namen, symbolische Verknüpfungen und nicht reguläre Git-Einträge MÜSSEN abgelehnt werden. Die Benutzeroberfläche DARF keine internen Nachweisdateipfade erhalten.

Akzeptanz: Nur reguläre PNG-Blobs unter `evidence/` werden als Bildnachweise adressiert. Andere unterstützte Blobs werden sicher vorgeprüft, erzeugen jedoch keine Nachweis-ID.

## Sichtbare Lücken ohne erfundene Fachdaten

Fehlende Quellenfamilien, ungelöste strukturierte Referenzen und bekannte Datenlücken MÜSSEN sichtbar bleiben. Der MVP DARF aus freier Prosa keine Chronologie, Manifestbeziehung, Freigabe oder fachliche Wahrheit erfinden.

Akzeptanz: Jira-Typ, Status, Phase, Arbeitsstrom, Aufwand, Abhängigkeiten, explizite Historie, Termine, Liefergegenstände und Abrechnungskennzeichen erscheinen nur, wenn sie strukturiert im positivgelisteten Quellenvertrag belegt sind. Fehlende Werte bleiben `null`, leere Listen oder ein ehrlicher Leerzustand. Die Auswahl einer commitgebundenen Momentaufnahme durch die betreibende Person gilt nicht als menschliche Freigabe.

## Projektgebundener Datenindex

Die Projektbindung für `bc-basic` MUSS ausschließlich über einen validierten Snapshot erfolgen. Einstiegspunkt ist allein `exports/project-data/v1/snapshot-manifest.json`; die Hülle referenziert exakt `exports/project-data/v1/index.yaml`. Der Index MUSS schreibgeschützt, schemavalidiert, an die erwartete fachliche Projekt-ID gebunden und die einzige Einstiegskante zu den positiv referenzierten Jira-, Confluence-, Meeting-, Planungs-, Trainings-, Handbuch-, Budget-, Arbeitsprotokoll- und Nachweisquellen sein.

Akzeptanz: Nicht im Index referenzierte Fachdaten werden für `bc-basic` nicht normalisiert. Positivgelistete CSV-Datenvorlagen werden größenbegrenzt und UTF-8-validiert als Dokumentartefakte dargestellt, ohne ihre Zeilen als fachliche Fakten auszulegen. Der vorhandene Walkthrough-Vertrag wird nicht als Projektindex umgedeutet. Der Twin speichert keine Kopie der fachlichen Projektdaten.

## Nicht selbstreferenzielle Snapshotbindung

Die produktive Registry MUSS extern die vollständige SHA des Snapshot-Metadatencommits B binden. snapshot-manifest.json in B ist ein striktes JSON-Objekt der Schema-Version 1 ohne zusätzliche Eigenschaften. Es enthält producerId blueprint, Projekt- und Vertragskennung, producerCommitSha des direkten Parents A, schemaPath, indexPath, den nur-lesenden Consumer project-twin, consumerBindingDigest, das Digestformat uabc-snapshot-records-v1, Indexmetadaten, genau eine Payloadmetadatenzeile je positivgelistetem Artefakt, payloadBundleDigest und den Validierungsstatus validated. Der Index enthält verpflichtend contractRole repository-relative-data-allowlist und snapshotManifestIncluded false. Das Format json-schema ist nur für einen JSON-Pfad zulässig; governance/consumer-bindings.yaml darf niemals als Twin-Payload erscheinen.

Die vollständige Spectra-Releasebindung ist ausschließlich BOUND: productId spectra, technicalRepositoryName BCProjectOS, die Repositoryadresse https://github.com/sivla/BCProjectOS.git, releaseVersion, einen Tag im Muster spectra-v<SemVer>, Tag- und Manifestcommit, installierbaren Blueprint-Modus, SHA-256 sowie einen eigenständigen Produktrelease-Digest aus BCProjectOS als bare 64-stellige Kleinschreibung-Hexfolge. Der oberste payloadBundleDigest ist dagegen der deterministische BC-Basic-Snapshotrecord-Digest im Format sha256:<64 Kleinschreibung-Hexzeichen>. Beide Digestdomänen dürfen niemals gleichgesetzt, voneinander abgeleitet oder als derselbe Digest geprüft werden. PENDING_BCPROJECTOS_RELEASE, proposed, blocked, fehlende oder widersprüchliche Felder werden abgelehnt.

Zwischen A und B DARF ausschließlich snapshot-manifest.json geändert oder neu hinzugefügt werden. Das in A und B objektidentische JSON-Schema, der Index und alle positivgelisteten Payloadblobs MÜSSEN byteidentisch bleiben. Der Digest umfasst Index und jeden positivgelisteten Pfad genau einmal, sortiert ordinal nach UTF-8-Pfadbytes. Jeder Record lautet Pfad, NUL, Gitmodus, NUL, Dezimalgröße, NUL, SHA-256 der Blobbytes und Zeilenumbruch; der Gesamtdigest ist SHA-256 dieser Records. Manifest, Schema, Index und ausgelieferte Payload werden ausschließlich als Git-Blobs aus B gelesen; A dient nur der Provenienz- und Unverändertheitsprüfung. Weder governance/consumer-bindings.yaml noch BCProjectOS oder ein Arbeitsbaum dürfen als Fallback gelesen werden.

Akzeptanz: Fehlendes Manifest, fehlender direkter Parent, falscher Produzentencommit, unzulässige A/B-Änderung, abweichender Index oder Payloadblob, Digestabweichung und unvollständige Releasebindung blockieren Zustand und Nachweisauflösung fail-closed. Der bekannte Blueprint-Commit `fdf41e337f967aa613c2ddc75d0961119303057f` ohne Manifest zeigt einen professionell deutschen Blockierzustand statt fachlicher Daten.

Jeder produktive Registereintrag MUSS einen expliziten Snapshotvertrag besitzen. Fehlt dieser Vertrag, wird der Projekt- und Nachweiszugriff unmittelbar als deutscher Blockierzustand beendet; ein generischer Git-Tree-Leser ist kein zulässiger Fallback. Universaarl bleibt bis zu einem eigenen validierten Snapshotvertrag sichtbar blockiert.

## Offene Freigabe- und Archivgrenze

Menschliche Freigabe und Archivierung bleiben eigenständige, noch nicht abgeschlossene Schritte. Dieser Vertrag DARF ihren Abschluss nicht aus Implementierung, Prüfungen oder einem lokalen Versionsstand ableiten.

Akzeptanz: Die Aufgaben für menschliche Freigabe und Archivierung bleiben offen, bis ein gesonderter belegter Freigabevorgang abgeschlossen ist.
