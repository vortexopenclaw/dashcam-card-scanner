// SPDX-License-Identifier: AGPL-3.0-only
import {expect, test} from 'vitest';
import {readFileSync} from 'node:fs';
import {release, scrubBreadcrumb, scrubEvent, scrubText} from '../src/telemetry';

const privateText = 'open /Users/alice/Movies/DCIM/2026_0101_120000_0042F.MP4 on /Volumes/VIOFO_A229 serial A229P2304001234 SN: XJ-99812 at 37.774929,-122.419416 $GPRMC,123519,A,4807.038,N mac 00:1A:2B:3C:4D:5E C:\\Users\\bob\\x.mov';

test('scrubs home paths, volume names, serials, GPS and media filenames', () => {
  const out = scrubText(privateText);
  for (const leaked of ['alice', 'bob', '2026_0101_120000_0042F', 'VIOFO_A229', 'A229P2304001234', 'XJ-99812', '37.774929', '-122.419416', '4807.038', '00:1A:2B']) {
    expect(out, leaked).not.toContain(leaked);
  }
  expect(out).toContain('/Users/<user>/Movies/DCIM/<media-');
  expect(out).toMatch(/<media-[0-9a-f]{8}>\.MP4/);
  expect(out).toContain('<gps>');
});

test('keeps source-mapped code locations readable', () => {
  expect(scrubText('at app:///src/ui.ts:10:4 (mount)')).toBe('at app:///src/ui.ts:10:4 (mount)');
  const event = scrubEvent({exception: {values: [{type: 'Error', value: privateText, stacktrace: {frames: [{filename: 'app:///assets/index-Ba5Tatz3.js', function: 'triggerTestJsError', abs_path: '/Users/alice/src/ui.ts'}]}}]}, user: {id: 'x', username: 'alice'}, server_name: 'Alices-Mac', contexts: {device: {name: 'Alice phone', arch: 'arm64'}}, extra: {latitude: 1.23, note: 'serial ABCDEF123456'}})!;
  const json = JSON.stringify(event);
  expect(json).not.toMatch(/alice|Alices-Mac|Alice phone|1\.23|ABCDEF123456|A229P2304001234/i);
  const frame = event.exception!.values![0].stacktrace!.frames![0];
  expect(frame.function).toBe('triggerTestJsError');
  expect(frame.filename).toBe('app:///assets/index-Ba5Tatz3.js');
  expect(frame.abs_path).toBe('/Users/<user>/src/ui.ts');
  expect(event.user).toEqual({ip_address: '0.0.0.0'});
});

test('breadcrumbs are scrubbed and release is versioned', () => {
  expect(JSON.stringify(scrubBreadcrumb({message: privateText, data: {gps: '1,2'}}))).not.toMatch(/alice|A229P2304001234|"1,2"/);
  expect(release()).toMatch(/^dashcam-card-scanner@\d+\.\d+\.\d+/);
  expect(readFileSync('vite.config.ts', 'utf8')).toContain('__APP_VERSION__: JSON.stringify(pkg.version)');
});

test('renderer still sends nothing over the network itself', () => {
  const ts = readFileSync('src/telemetry.ts', 'utf8');
  expect(ts).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon/);
  expect(ts).toContain('defaultOptions');
  const conf = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
  expect(conf.app.security.csp).not.toContain('sentry.io');
});
