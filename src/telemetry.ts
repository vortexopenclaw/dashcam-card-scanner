// SPDX-License-Identifier: AGPL-3.0-only
// Owner crash/error reporting for the webview. Events, breadcrumbs, logs and
// transactions go to Rust over Tauri IPC (tauri-plugin-sentry), never directly
// from the renderer, so the no-network CSP stays intact. Everything is scrubbed
// here first (and again in Rust for typed events). Reporting must never break
// the UI: every entry point swallows its own failures.
/// <reference types="vite/client" />
import * as Sentry from '@sentry/browser';
import type {Breadcrumb, ErrorEvent, Event, Integration, Log, TransactionEvent} from '@sentry/core';
import {defaultOptions} from 'tauri-plugin-sentry-api';

declare const __APP_VERSION__: string;

export const release = (): string => `dashcam-card-scanner@${typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'}`;
const environment = (): string => (import.meta.env?.PROD ? 'production' : 'development');

const HOME_PATH = /(\/Users\/|\/home\/|[A-Za-z]:\\{1,2}Users\\{1,2}|[A-Za-z]:\/Users\/)[^/\\\s"'<>:]+/gi;
const VOLUME_PATH = /(\/Volumes\/|\/media\/[^/\s"']+\/|\/run\/media\/[^/\s"']+\/)[^/\s"'<>]+/g;
const MEDIA_FILE = /\b([^\s/\\"'<>:|?*]+)\.(mp4|mov|avi|mkv|ts|m4v|3gp|h264|h265|hevc|jpe?g|png|heic|nmea|gpx|kml|gps|dat|thm)\b/gi;
const GPS_PAIR = /[-+]?\d{1,3}\.\d{3,}\s*[,; ]\s*[-+]?\d{1,3}\.\d{3,}/g;
const GPS_DMS = /\d{1,3}°\s*\d{1,2}['′]\s*[\d.]+["″]?\s*[NSEW]/g;
const NMEA = /\$G[PNLAB][A-Z]{3},[^\s"']*/g;
const SERIAL_LABELLED = /\b(serial(?:[ _-]?(?:no|number))?|s\/n|sn|imei)(\s*[:=#]?\s*)[A-Za-z0-9-]{4,}/gi;
const SERIAL_TOKEN = /\b[A-Z0-9]{10,}\b/g;
const MAC_ADDR = /\b[0-9A-Fa-f]{2}(?:[:-][0-9A-Fa-f]{2}){5}\b/g;
const SENSITIVE_KEY = /^(serial|serial_?(no|number)|sn|imei|mac|mac_?address|gps|lat|latitude|lon|lng|longitude|location|coords?|coordinates|geo|username|user_?name|hostname|host_?name|server_name|email|ip|ip_?address)$/i;
// Code/debug identifiers: only path scrubbing applies (keeps stacks readable).
const STRUCTURAL_KEYS = new Set(['function', 'raw_function', 'symbol', 'module', 'package', 'filename', 'abs_path', 'instruction_addr', 'debug_id', 'code_id', 'debug_file', 'code_file', 'event_id', 'trace_id', 'span_id', 'parent_span_id', 'release', 'dist', 'environment', 'platform', 'version', 'name', 'type', 'op', 'sdk', 'timestamp', 'start_timestamp', 'level', 'context_line', 'pre_context', 'post_context', 'origin']);

/** Short non-reversible tag for a media file stem (FNV-1a, 32-bit). */
function shortHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

export function scrubPaths(text: string): string {
  return text.replace(HOME_PATH, '$1<user>').replace(VOLUME_PATH, '$1<volume>');
}

export function scrubText(text: string): string {
  return scrubPaths(text)
    .replace(NMEA, '<nmea>')
    .replace(GPS_DMS, '<gps>')
    .replace(GPS_PAIR, '<gps>')
    .replace(MAC_ADDR, '<mac>')
    .replace(SERIAL_LABELLED, '$1$2<serial>')
    .replace(SERIAL_TOKEN, t => (/\d/.test(t) && /[A-Z]/.test(t) ? '<serial>' : t))
    .replace(MEDIA_FILE, (whole, stem: string, ext: string) => {
      // `.ts` is also TypeScript; only digit-heavy names are treated as MPEG-TS.
      const tsSource = ext.toLowerCase() === 'ts' && (stem.match(/\d/g)?.length ?? 0) < 4;
      return tsSource || stem.startsWith('<') ? whole : `<media-${shortHash(stem)}>.${ext}`;
    });
}

function scrubValue(value: unknown, key?: string, depth = 0): unknown {
  if (depth > 12) return '[depth]';
  if (typeof value === 'string') return key && STRUCTURAL_KEYS.has(key) ? scrubPaths(value) : scrubText(value);
  if (Array.isArray(value)) return value.map(v => scrubValue(v, key, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === 'user' || k === 'server_name') continue;
      out[k] = SENSITIVE_KEY.test(k) && v != null ? '[redacted]' : scrubValue(v, k, depth + 1);
    }
    return out;
  }
  return value;
}

export function scrubEvent<T extends Event>(event: T): T | null {
  try {
    const out = scrubValue(event) as T;
    const device = out.contexts?.device as Record<string, unknown> | undefined;
    if (device) delete device.name;
    // Explicit unroutable address: stops server-side IP/geo inference.
    out.user = {ip_address: '0.0.0.0'};
    delete out.server_name;
    if (out.request) { delete out.request.headers; delete out.request.cookies; }
    return out;
  } catch {
    return null; // never send an event that could not be scrubbed
  }
}

export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  try { return scrubValue(crumb) as Breadcrumb; } catch { return null; }
}

export function scrubLog(log: Log): Log | null {
  try {
    const attributes = log.attributes ? (scrubValue(log.attributes) as Log['attributes']) : undefined;
    return {...log, message: typeof log.message === 'string' ? scrubText(log.message) : log.message, attributes};
  } catch { return null; }
}

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

export function initTelemetry(): boolean {
  try {
    const base = defaultOptions.integrations as (i: Integration[]) => Integration[];
    Sentry.init({
      ...defaultOptions,
      release: release(),
      environment: environment(),
      // SDK v11: `dataCollection` replaces `sendDefaultPii` (PII off) and logs
      // (`Sentry.logger`, console warn/error) are enabled without `enableLogs`.
      dataCollection: {userInfo: false, cookies: false, httpHeaders: false, urlQueryParams: false, stackFrameVariables: false},
      tracesSampleRate: 0.2,
      integrations: defaults => [
        ...base(defaults),
        Sentry.browserTracingIntegration(),
        Sentry.consoleLoggingIntegration({levels: ['warn', 'error']}),
      ],
      beforeSend: (event: ErrorEvent) => scrubEvent(event),
      beforeSendTransaction: (event: TransactionEvent) => scrubEvent(event),
      beforeSendLog: (log: Log) => scrubLog(log),
      beforeBreadcrumb: (crumb, hint) => {
        const clean = scrubBreadcrumb(crumb);
        return clean && defaultOptions.beforeBreadcrumb ? defaultOptions.beforeBreadcrumb(clean, hint) : null;
      },
    });
    return true;
  } catch {
    return false;
  }
}

/** Wrap the IPC bridge: command failures become breadcrumbs/logs (Rust raises the events). */
export function observeInvoke(invoke: Invoke): Invoke {
  return async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
    try {
      return await invoke<T>(cmd, args);
    } catch (error) {
      try {
        const message = scrubText(String(error));
        Sentry.addBreadcrumb({category: 'ipc', level: 'warning', message: `${cmd} rejected: ${message}`});
        Sentry.logger.warn(`${cmd} rejected`, {command: cmd, error: message});
      } catch { /* reporting must never break the UI */ }
      throw error;
    }
  };
}

function syntheticPrivateText(): string {
  return 'synthetic verification: /Users/example-owner/Movies/DCIM/2026_0101_120000_0042F.MP4 camera serial A229P2304001234 at 37.774929,-122.419416';
}

function triggerTestJsError(): never {
  throw new Error(`Sentry webview verification error: ${syntheticPrivateText()}`);
}

async function triggerTestJsRejection(): Promise<never> {
  throw new Error(`Sentry webview verification rejection: ${syntheticPrivateText()}`);
}

/** Hidden verification trigger from DASHCAM_SCANNER_SENTRY_TEST (read by Rust). */
export async function runTestTriggers(invoke: Invoke): Promise<void> {
  try {
    const trigger = await invoke<string | null>('sentry_test_trigger');
    if (!trigger) return;
    Sentry.logger.info('Sentry webview verification trigger', {trigger});
    if (trigger.includes('js-error')) setTimeout(triggerTestJsError, 0);
    if (trigger.includes('js-rejection')) void triggerTestJsRejection();
  } catch { /* ignore */ }
}
