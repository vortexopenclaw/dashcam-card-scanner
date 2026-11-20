// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {bearerMatches} from '../schema.js';
const key='k'.repeat(40);
test('admin bearer check accepts only the exact key', () => {
  assert.equal(bearerMatches('Bearer '+key, key), true);
  for (const h of [null, undefined, '', 'Bearer ', 'Bearer '+key.slice(1), 'Bearer '+key+'x', 'bearer '+key, key, 'Bearer '+'j'+key.slice(1)])
    assert.equal(bearerMatches(h, key), false, String(h));
  assert.equal(bearerMatches('Bearer '+key, undefined), false);
});
