#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Local/owner release build with Sentry symbols:
//   SENTRY_AUTH_TOKEN=... node scripts/sentry-release-build.mjs [tauri build args...]
// 1. Remaps the builder's home directory out of compiled paths, so symbolicated
//    Rust frames never show /Users/<name> (DWARF paths are added server-side,
//    after client scrubbing).
// 2. Runs `tauri build` (beforeBuildCommand uploads/deletes JS source maps).
// 3. Uploads the Rust debug files (.dSYM/.dwp/.pdb) for file:line stacks.
// Without a token it is a plain build plus the path remap.
import {spawnSync} from 'node:child_process';
import {homedir} from 'node:os';
import {resolve} from 'node:path';

const home = homedir();
const remap = [`--remap-path-prefix=${home}=~`, `--remap-path-prefix=${resolve('.')}=.`];
const env = {...process.env, RUSTFLAGS: [process.env.RUSTFLAGS, ...remap].filter(Boolean).join(' ')};
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const build = spawnSync(npx, ['tauri', 'build', ...process.argv.slice(2)], {stdio: 'inherit', env, shell: process.platform === 'win32'});
// Updater signing may fail locally without the private key after the app is bundled.
const upload = spawnSync(process.execPath, ['scripts/sentry-debug-files.mjs'], {stdio: 'inherit', env});
process.exit(build.status === 0 && upload.status === 0 ? 0 : build.status || upload.status || 1);
