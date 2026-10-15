// SPDX-License-Identifier: AGPL-3.0-only
// Cosmetic only: never use this hint for native permissions or update targets.
export function platformStyle(hint: string): 'macos' | 'windows' | 'linux' | 'generic' {
  if (/\b(?:Mac(?:OS|Intel|PPC|intosh)?|Darwin)\b/i.test(hint)) return 'macos';
  if (/\b(?:Windows|Win32|Win64)\b/i.test(hint)) return 'windows';
  if (/\bLinux\b/i.test(hint)) return 'linux';
  return 'generic';
}
