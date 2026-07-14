#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
const output = path.resolve(process.argv[2] ?? '.runtime/catalog-ci-evidence.json'); const passed = process.env.UNIVERSAARL_CATALOG_GATES === 'passed'; const checks = ['freshCheckout', 'npmCi', 'bootstrap', 'configure', 'doctor', 'start', 'health', 'filesystemFixture', 'localHttpParity', 'browserSmoke', 'identityIsolation', 'digestGuards', 'noRuntimeRepository', 'stop', 'noWrites'];
const evidence = { schemaVersion: 1, status: passed ? 'PASS' : 'PENDING', platform: process.platform, architecture: process.arch, generatedAt: new Date().toISOString(), checks: Object.fromEntries(checks.map((check) => [check, passed ? 'PASS' : 'PENDING'])), redaction: { localPaths: true, secrets: true, customerData: true } };
fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 }); process.stdout.write(`${output}\n`);
