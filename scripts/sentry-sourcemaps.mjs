#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Upload hidden Vite source maps to Sentry, then remove them from dist/ so they
// are never embedded in the app bundle. Runs after `vite build` (npm run build,
// which Tauri's beforeBuildCommand also uses).
//
// Upload happens only when SENTRY_AUTH_TOKEN is present in the environment
// (org token with CI scope; never commit it). Without a token the maps are just
// deleted, so local/CI builds without secrets behave exactly as before.
// Failures never fail the build unless SENTRY_UPLOAD_REQUIRED=1.
import {readFileSync, readdirSync, rmSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const ORG = process.env.SENTRY_ORG || 'vortex-openclaw';
const PROJECT = process.env.SENTRY_PROJECT || 'dashcam-card-scanner';
// Org auth tokens embed their region URL; pass --url only when overridden.
const URL_ARGS = process.env.SENTRY_URL ? ['--url', process.env.SENTRY_URL] : [];
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const release = `dashcam-card-scanner@${version}`;
const dist = 'dist';

const maps = [];
const walk = p => { for (const name of readdirSync(p)) { const f = join(p, name); if (statSync(f).isDirectory()) walk(f); else if (f.endsWith('.map')) maps.push(f); } };
walk(dist);

function cli(args) {
  const bin = process.platform === 'win32' ? 'sentry-cli.exe' : 'sentry-cli';
  const local = join('node_modules', '.bin', process.platform === 'win32' ? 'sentry-cli.cmd' : 'sentry-cli');
  const command = statSync(local, {throwIfNoEntry: false}) ? local : bin;
  const r = spawnSync(command, [...URL_ARGS, ...args], {stdio: 'inherit', env: {...process.env, SENTRY_ORG: ORG, SENTRY_PROJECT: PROJECT}, shell: process.platform === 'win32'});
  return r.status === 0;
}

let ok = true;
if (process.env.SENTRY_AUTH_TOKEN && maps.length) {
  // Release + url-prefix matching (no debug-ID injection): injected debug_meta
  // makes tauri-plugin-sentry forward envelopes raw, skipping Rust enrichment.
  ok = cli(['releases', 'new', release])
    && cli(['sourcemaps', 'upload', '--release', release, '--url-prefix', 'app:///assets', '--validate', join(dist, 'assets')]);
  console.log(ok ? `Sentry: uploaded ${maps.length} source map(s) for ${release}` : 'Sentry: source map upload failed (build continues)');
} else if (maps.length) {
  console.log('Sentry: SENTRY_AUTH_TOKEN not set; skipping source map upload');
}
for (const f of maps) rmSync(f);
if (!ok && process.env.SENTRY_UPLOAD_REQUIRED === '1') process.exit(1);
