// This entry point uses only Node built-ins so it also works on a fresh checkout.
import { existsSync } from 'node:fs';
import { fork, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { envRoot } from '../server/lib/env.mjs';

process.chdir(envRoot);
const require = createRequire(import.meta.url);
let backend;
let frontend;
let installer;
let stopping = false;

async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  installer?.kill('SIGTERM');
  await frontend?.close();
  if (backend && backend.exitCode === null) {
    backend.kill('SIGTERM');
    await Promise.race([
      new Promise(resolve => backend.once('exit', resolve)),
      delay(3000).then(() => backend.kill('SIGKILL')),
    ]);
  }
  process.exit(code);
}
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());

try {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 18)) {
    throw new Error('Node.js 22.18 or newer is required. Run mise install, then mise exec -- npm run dev.');
  }
  try {
    const manifest = require('../package.json');
    for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) {
      if (!existsSync(`node_modules/${name}/package.json`)) throw new Error(`Missing ${name}`);
    }
    require.resolve('vite');
    require.resolve('cors');
  } catch {
    console.log('Installing project dependencies…');
    await new Promise((resolve, reject) => {
      const install = installer = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm',
        [existsSync('package-lock.json') ? 'ci' : 'install'], { stdio: 'inherit' });
      install.once('error', reject);
      install.once('exit', code => code === 0 ? resolve() : reject(new Error('Dependency installation failed. Run npm ci and retry.')));
    });
  }

  const database = process.env.DATABASE_URL || 'sqlite:data/labnotes.db';
  console.log(process.env.DATABASE_URL ? 'Using the configured database.' : 'Using local SQLite: data/labnotes.db');
  backend = fork('server/index.mjs', [], {
    env: { ...process.env, DATABASE_URL: database, PORT: '0', HOST: '127.0.0.1' },
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
  });
  backend.once('exit', (code, signal) => {
    if (signal === 'SIGINT' || signal === 'SIGTERM') { void stop(); return; }
    if (!stopping) {
      console.error('The API stopped. Check the error above, then restart npm run dev.');
      void stop(code || 1);
    }
  });
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('API startup timed out. Check your database configuration.')), 60000);
    backend.once('error', error => { clearTimeout(timeout); reject(error); });
    backend.on('message', message => {
      if (message.type === 'ready') { clearTimeout(timeout); resolve(message.port); }
    });
  });
  const { createServer } = await import('vite');
  const target = `http://127.0.0.1:${port}`;
  frontend = await createServer({
    server: {
      host: '127.0.0.1', port: 5173, strictPort: false,
      proxy: { '/api': target, '/share': target },
    },
  });
  await frontend.listen();
  frontend.printUrls();
  console.log('Frontend hot reload is enabled. Restart this command after API changes. Ctrl+C stops both servers.');
} catch (error) {
  console.error(error.message);
  await stop(1);
}
