// SPDX-License-Identifier: AGPL-3.0-only
import {readFileSync} from 'node:fs';
import {defineConfig} from 'vite';
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {version: string};
export default defineConfig({
  define: {__APP_VERSION__: JSON.stringify(pkg.version)},
  // Hidden maps: generated for Sentry upload, never referenced from the bundle.
  // scripts/sentry-sourcemaps.mjs uploads them (when a token is present) and
  // then deletes them so they are not embedded in the app.
  build: {sourcemap: 'hidden'},
});
