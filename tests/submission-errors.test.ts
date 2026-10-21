// SPDX-License-Identifier: AGPL-3.0-only
import {describe,it,expect} from 'vitest';
import {submissionErrorMessage} from '../src/submission-errors';
describe('safe actionable submission errors',()=>{
 it('distinguishes local preparation from network failures',()=>{
  expect(submissionErrorMessage('invalid camera labels','prepare')).toContain('Could not prepare');
  expect(submissionErrorMessage('submission:network_timeout','submit')).toContain('timed out');
  expect(submissionErrorMessage('submission:network_unavailable','submit')).toContain('Could not reach');
 });
 it('distinguishes rate, permanent capacity, schema and service errors',()=>{
  expect(submissionErrorMessage('submission:rate_limited','submit')).toContain('too many requests');
  expect(submissionErrorMessage('submission:storage_capacity','submit')).toContain('inbox is full');
  expect(submissionErrorMessage('submission:invalid_report','submit')).toContain('report format');
  expect(submissionErrorMessage('submission:service_unavailable','submit')).toContain('temporarily unavailable');
  expect(submissionErrorMessage('Intake rejected submission (HTTP 429). Retry the same prepared report later.','submit')).toContain('too many requests');
 });
 it('never exposes arbitrary upstream errors, URLs or private text',()=>{
  const unsafe='AUDIT_ONLY_FAKE_PRIVATE_TEXT https://invalid.example/local-path';
  for(const phase of ['prepare','submit'] as const){
   expect(submissionErrorMessage(new Error(unsafe),phase)).not.toContain(unsafe);
   expect(submissionErrorMessage({error:unsafe},phase)).not.toContain(unsafe);
  }
  expect(submissionErrorMessage('__proto__','submit')).toContain('Unable to confirm');
  expect(submissionErrorMessage('Invalid receipt','submit')).toContain('safely retry');
 });
});
