// SPDX-License-Identifier: AGPL-3.0-only
import {test,expect} from 'vitest';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const read=p=>readFileSync(p,'utf8');
test('renderer has no fetch, HTML interpolation, filesystem, shell or updater authority',()=>{
 const ui=read('src/ui.ts')+read('src/main.ts');expect(ui).not.toMatch(/\bfetch\s*\(|innerHTML|outerHTML|insertAdjacentHTML|eval\s*\(/);
 const cap=JSON.parse(read('src-tauri/capabilities/main.json'));expect(cap.permissions).toEqual(['core:event:allow-listen','core:event:allow-unlisten']);
 const c=JSON.parse(read('src-tauri/tauri.conf.json'));expect(c.app.security.csp).toContain('connect-src ipc: http://ipc.localhost');expect(c.app.security.csp).not.toContain('https:');expect(c.app.security.csp).not.toContain('unsafe-inline');
});
test('release is manual, main-only, environment-gated; no PR privileged entry point',()=>{
 const y=read('.github/workflows/release.yml');expect(y).toContain('workflow_dispatch:');expect(y).toContain("github.ref == 'refs/heads/main'");expect(y).toContain('environment: scanner-release');expect(y).toContain('required_reviewers');expect(y).not.toContain('pull_request_target');expect(y).not.toMatch(/\bon:\s*\[.*pull_request/);expect(y).toContain('releaseDraft: true');
 const v=read('.github/workflows/verify.yml');expect(v).not.toContain('secrets.');
});
test('review build cannot pass release key preflight',()=>{
 const c=JSON.parse(read('src-tauri/tauri.conf.json'));if(c.plugins.updater.pubkey.startsWith('REPLACE_')){const r=spawnSync(process.execPath,['scripts/release-preflight.mjs'],{encoding:'utf8'});expect(r.status).not.toBe(0);expect(r.stderr).toContain('Official PUBLIC updater key');}
});
test('source and built frontend contain no private key/token files or credential-shaped values',()=>{
 const paths=[];const walk=p=>{for(const item of readdirSync(p)){const f=join(p,item);if(statSync(f).isDirectory())walk(f);else paths.push(f);}};
 for(const p of ['src','src-tauri/src','src-tauri/capabilities','dist'])walk(p);
 for(const p of paths){expect(p).not.toMatch(/\.(?:pem|p12|pfx|key|secret)$|(?:^|\/)\.env/);const b=read(p);expect(b,p).not.toMatch(/-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16}/);}
 const rust=read('src-tauri/src/lib.rs');expect(rust).not.toContain('dashcam-offloader-feedback.vortexradar.workers.dev');expect(rust).toContain('redirect(reqwest::redirect::Policy::none())');expect(rust).toContain('https_only(true)');
});
