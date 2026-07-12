import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const starter = path.resolve('scripts/twin-local.ps1');
const servers: http.Server[] = [];

async function listen(handler: http.RequestListener): Promise<{ server: http.Server; port: number }> {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Der Testport konnte nicht aufgelöst werden.');
  return { server, port: address.port };
}

async function runStarter(action: 'Start' | 'Status' | 'Stop', port: number) {
  return execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', starter, '-Action', action, '-Port', String(port), '-TimeoutSeconds', '5'], {
    cwd: path.resolve('.'),
    windowsHide: true,
  });
}

async function failedStarter(action: 'Start' | 'Status' | 'Stop', port: number): Promise<string> {
  try {
    await runStarter(action, port);
    throw new Error('Der erwartete Starterabbruch blieb aus.');
  } catch (error) {
    return String((error as { stderr?: string }).stderr ?? error);
  }
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe('lokaler Twin-Starter', () => {
  it('erkennt einen gesunden Twin idempotent und startet keinen zweiten Prozess', async () => {
    const { port } = await listen((request, response) => {
      if (request.url !== '/api/health') { response.writeHead(404).end(); return; }
      response.setHeader('X-Universaarl-Service', 'project-twin');
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify({ application: 'project-twin', status: 'bereit' }));
    });
    await expect(runStarter('Start', port)).resolves.toMatchObject({ stdout: expect.stringContaining('bereits bereit') });
    expect(fs.existsSync(path.resolve(`.runtime/twin-local-${port}/process.json`))).toBe(false);
  });

  it('lehnt einen fremden Dienst ab und beendet ihn nicht', async () => {
    let requests = 0;
    const { server, port } = await listen((_request, response) => { requests += 1; response.end('fremder Dienst'); });
    const error = await failedStarter('Start', port);
    expect(error).toContain('fremden');
    expect(error).toContain('ungesunden Dienst');
    expect(server.listening).toBe(true);
    expect(requests).toBeGreaterThan(0);
  });

  it('meldet einen nicht laufenden Twin ohne Prozessmanipulation', async () => {
    const { server, port } = await listen((_request, response) => response.end('kurzzeitig'));
    await new Promise<void>((resolve) => server.close(() => resolve()));
    servers.splice(servers.indexOf(server), 1);
    expect(await failedStarter('Status', port)).toContain('derzeit nicht');
  });

  it('beendet keinen nicht nachweislich eigenen Prozess', async () => {
    const { server, port } = await listen((_request, response) => response.end('fremder Dienst'));
    const runtime = path.resolve(`.runtime/twin-local-${port}`);
    fs.mkdirSync(runtime, { recursive: true });
    fs.writeFileSync(path.join(runtime, 'process.json'), JSON.stringify({ schemaVersion: 1, pid: 2_147_483_646, instanceId: 'nicht-eigen', port }), 'utf8');
    try {
      expect(await failedStarter('Stop', port)).toContain('Es wurde nichts beendet');
      expect(server.listening).toBe(true);
    } finally {
      fs.rmSync(runtime, { recursive: true, force: true });
    }
  });

  it('bindet Health, Laufzeitkennung und npm-Bedienwege explizit', () => {
    const vite = fs.readFileSync(path.resolve('vite.config.ts'), 'utf8');
    const script = fs.readFileSync(starter, 'utf8');
    const launcher = fs.readFileSync(path.resolve('scripts/run-twin-server.ps1'), 'utf8');
    const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(vite).toContain("pathname === '/api/health'");
    expect(vite).toContain("'X-Universaarl-Service', 'project-twin'");
    expect(script).toContain('Test-OwnedProcess');
    expect(script).toContain('run-twin-server.ps1');
    expect(launcher).toContain("$env:UABC_STABLE_BRANCH = $StableBranch");
    expect(packageJson.scripts).toMatchObject({ 'twin:start': expect.any(String), 'twin:status': expect.any(String), 'twin:stop': expect.any(String) });
  });
});
