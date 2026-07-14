import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error Das direkt ausführbare Node-Skript besitzt bewusst kein separates Typenpaket.
import { browserCommand, defaultConfigPath, npmExecutable, parseArguments, validateConfiguration } from '../scripts/twin-local.mjs';

const execFileAsync = promisify(execFile); const starter = path.resolve('scripts/twin-local.mjs'); const servers: http.Server[] = []; const roots: string[] = [];
async function listen(handler: http.RequestListener) { const server = http.createServer(handler); servers.push(server); await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('Der Testport konnte nicht aufgelöst werden.'); return { server, port: address.port }; }
async function runStarter(action: 'start' | 'status' | 'stop', port: number) { return execFileAsync(process.execPath, [starter, action, '--port', String(port), '--timeout', '5'], { cwd: path.resolve('.'), windowsHide: true }); }
async function failedStarter(action: 'start' | 'status' | 'stop', port: number) { try { await runStarter(action, port); throw new Error('Der erwartete Starterabbruch blieb aus.'); } catch (error) { return String((error as { stderr?: string }).stderr ?? error); } }
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

describe('plattformneutraler Snapshot-Katalog-Starter', () => {
  it('verwendet XDG beziehungsweise ~/.config und passende Browserbefehle', () => {
    expect(defaultConfigPath({ XDG_CONFIG_HOME: '/tmp/xdg' }, '/Users/beispiel', 'darwin')).toBe('/tmp/xdg/universaarl-twin/config.json');
    expect(defaultConfigPath({}, '/Users/beispiel', 'darwin')).toBe('/Users/beispiel/.config/universaarl-twin/config.json');
    expect(defaultConfigPath({ XDG_CONFIG_HOME: 'C:\\Konfig' }, 'C:\\Benutzer\\Beispiel', 'win32')).toBe('C:\\Konfig\\universaarl-twin\\config.json');
    expect(npmExecutable('win32')).toBe('npm.cmd'); expect(npmExecutable('darwin')).toBe('npm'); expect(browserCommand('http://127.0.0.1:4173/', 'darwin')).toEqual({ command: 'open', args: ['http://127.0.0.1:4173/'] });
  });

  it('parst configure und Katalogüberschreibungen ohne Repositoryparameter', () => {
    const options = parseArguments(['configure', '--catalog-id', 'kunde-a', '--catalog-type', 'filesystem', '--catalog-address', '../katalog', '--customer-id', 'KUNDE-A', '--project-id', 'PROJEKT-A']);
    expect(options).toMatchObject({ action: 'configure', catalogId: 'kunde-a', catalogType: 'filesystem', customerId: 'KUNDE-A', projectId: 'PROJEKT-A' });
    expect(() => parseArguments(['start', '--source-repo', '../quelle'])).toThrow('Unbekannter Parameter');
    expect(validateConfiguration({ schemaVersion: 1, activeCatalogId: 'kunde-a', catalogs: [{ id: 'kunde-a', type: 'https', address: 'https://katalog.example/a/', expectedCustomerId: 'KUNDE-A', expectedProjectId: 'PROJEKT-A' }] }).catalogs).toHaveLength(1);
  });

  it('schreibt configure ausschließlich in den expliziten externen Konfigurationspfad', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'twin-config-')); roots.push(root); const config = path.join(root, 'config.json');
    const result = await execFileAsync(process.execPath, [starter, 'configure', '--config', config, '--catalog-id', 'kunde-a', '--catalog-type', 'filesystem', '--catalog-address', path.join(root, 'katalog'), '--customer-id', 'KUNDE-A', '--project-id', 'PROJEKT-A'], { cwd: path.resolve('.'), windowsHide: true });
    expect(result.stdout).toContain('Konfiguration gespeichert'); expect(JSON.parse(fs.readFileSync(config, 'utf8'))).toMatchObject({ activeCatalogId: 'kunde-a', catalogs: [{ expectedCustomerId: 'KUNDE-A' }] });
  });

  it('erkennt einen gesunden Twin idempotent über den gemeinsamen Health-Vertrag', async () => { const { port } = await listen((request, response) => { if (request.url !== '/api/health') { response.writeHead(404).end(); return; } response.setHeader('X-Universaarl-Service', 'project-twin'); response.setHeader('Content-Type', 'application/json; charset=utf-8'); response.end(JSON.stringify({ application: 'project-twin', status: 'bereit' })); }); await expect(runStarter('start', port)).resolves.toMatchObject({ stdout: expect.stringContaining('bereits bereit') }); expect(fs.existsSync(path.resolve(`.runtime/twin-local-${port}/process.json`))).toBe(false); });
  it('lehnt einen fremden Dienst ab und beendet ihn nicht', async () => { const { server, port } = await listen((_request, response) => response.end('fremder Dienst')); expect(await failedStarter('start', port)).toContain('fremden oder ungesunden Dienst'); expect(server.listening).toBe(true); });
  it('beendet keinen Prozess ohne passende Health-PID und Laufzeitkennung', async () => { const { server, port } = await listen((_request, response) => { response.setHeader('X-Universaarl-Service', 'project-twin'); response.setHeader('Content-Type', 'application/json; charset=utf-8'); response.end(JSON.stringify({ application: 'project-twin', status: 'bereit', instanceId: 'fremd', pid: process.pid })); }); const runtime = path.resolve(`.runtime/twin-local-${port}`); fs.mkdirSync(runtime, { recursive: true }); fs.writeFileSync(path.join(runtime, 'process.json'), JSON.stringify({ schemaVersion: 1, pid: process.pid, instanceId: 'eigen', port }), 'utf8'); try { expect(await failedStarter('stop', port)).toContain('nicht nachweislich'); expect(server.listening).toBe(true); } finally { fs.rmSync(runtime, { recursive: true, force: true }); } });
  it('unterbindet .env-Lektüre und bewahrt Windows-Fallbacks', () => { const vite = fs.readFileSync(path.resolve('vite.config.ts'), 'utf8'); const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8')) as { scripts: Record<string, string> }; expect(vite).toContain('envDir: false'); expect(packageJson.scripts['twin:configure']).toBe('node scripts/twin-local.mjs configure'); expect(packageJson.scripts['twin:start:windows']).toContain('scripts/twin-local.ps1'); const source = fs.readFileSync(starter, 'utf8'); expect(source).toContain("spawnCommand(npmExecutable(), ['ci']"); expect(source).not.toMatch(/readFileSync\([^)]*\.env/); });
});
