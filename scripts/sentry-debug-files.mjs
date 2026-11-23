#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Optional: upload Rust debug files for a built app so native frames get file/line.
// Usage (after `npm run tauri build`): SENTRY_AUTH_TOKEN=... node scripts/sentry-debug-files.mjs [path...]
// Defaults to src-tauri/target/release. Skips silently without a token.
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
if (!process.env.SENTRY_AUTH_TOKEN) { console.log('Sentry: SENTRY_AUTH_TOKEN not set; skipping debug file upload'); process.exit(0); }
const release = join('src-tauri', 'target', 'release');
const defaults = {darwin: [join(release, 'dashcam-card-scanner.dSYM')], win32: [join(release, 'dashcam_card_scanner.pdb')], linux: [join(release, 'dashcam-card-scanner'), join(release, 'dashcam-card-scanner.dwp')]}[process.platform] || [release];
const paths = process.argv.slice(2).length ? process.argv.slice(2) : defaults;
const local = join('node_modules', '.bin', process.platform === 'win32' ? 'sentry-cli.cmd' : 'sentry-cli');
const r = spawnSync(local, [...(process.env.SENTRY_URL ? ['--url', process.env.SENTRY_URL] : []), 'debug-files', 'upload', '--org', process.env.SENTRY_ORG || 'vortex-openclaw', '--project', process.env.SENTRY_PROJECT || 'dashcam-card-scanner', '--include-sources', ...paths], {stdio: 'inherit', shell: process.platform === 'win32'});
if (r.status !== 0) { console.log('Sentry: debug file upload failed'); if (process.env.SENTRY_UPLOAD_REQUIRED === '1') process.exit(1); }
