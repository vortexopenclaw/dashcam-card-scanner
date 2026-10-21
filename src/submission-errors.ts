// SPDX-License-Identifier: AGPL-3.0-only
/** Static user messages only: never echo raw bridge/server errors or private data. */
const messages: Record<string, string> = {
  'submission:network_timeout': 'The submission timed out. Your report is still here; you can safely retry.',
  'submission:network_unavailable': 'Could not reach the submission service. Check your connection and try again.',
  'submission:rate_limited': 'The submission service has received too many requests. Please try again later.',
  'submission:storage_capacity': 'The submission inbox is full. Your report is still here; please try again after space is cleared.',
  'submission:invalid_report': 'The service could not accept this report format. Check for an app update before retrying.',
  'submission:service_unavailable': 'The submission service is temporarily unavailable. Your report is still here; please try again later.',
  'submission:service_rejected': 'The submission service rejected the request. Your report is still here; check for an app update before retrying.',
  'submission:receipt_unconfirmed': 'The service did not return a matching confirmation. Your report may have arrived; you can safely retry.',
};
export function submissionErrorMessage(error: unknown, phase: 'prepare' | 'submit'): string {
  const code = typeof error === 'string' ? error : error instanceof Error ? error.message : '';
  if (Object.hasOwn(messages, code)) return messages[code];
  const legacy = /^Intake rejected submission \(HTTP (\d{3})\)\. Retry the same prepared report later\.$/.exec(code);
  if (legacy) {
    const status = Number(legacy[1]);
    return messages[status === 429 ? 'submission:rate_limited' : status >= 500 ? 'submission:service_unavailable' : [400, 413, 422].includes(status) ? 'submission:invalid_report' : 'submission:service_rejected'];
  }
  if (phase === 'prepare') return 'Could not prepare this report. Check the camera and recording settings, then click Submit again.';
  return 'Unable to confirm submission. Your report may have arrived; you can safely retry.';
}
