#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
const output = path.resolve(process.argv[2] ?? '.runtime/macos-onboarding-evidence.json'); const checks = ['freshClone', 'npmCi', 'doctor', 'configure', 'start', 'health', 'filesystemFixture', 'httpsParity', 'stop', 'noWrites'];
const evidence = { schemaVersion: 1, platform: process.platform, architecture: process.arch, status: process.platform === 'darwin' ? 'AUSFUEHRUNG_ERFORDERLICH' : 'PENDING_MACOS_RUNNER', generatedAt: new Date().toISOString(), checks: Object.fromEntries(checks.map((check) => [check, 'PENDING'])), note: process.platform === 'darwin' ? 'Das Skript ist auf einem echten macOS-Runner gestartet; die isolierte Ablaufsteuerung muss mit lokaler Fixtureadresse ausgeführt werden.' : 'Kein macOS-Runner: Es wird ausdrücklich keine macOS-Freigabe behauptet.', host: { homeRedacted: os.homedir() ? '<HOME>' : null } };
fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 }); process.stdout.write(`${output}\n`);
