// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

import {pathToFileURL} from 'node:url';

// Human approval is intentionally not required for routine agent-managed releases.
// Environment-scoped signing secrets and main-only deployments remain mandatory.
export function checkReleaseEnvironment(ref, repo, api) {
assert.equal(ref, 'refs/heads/main', 'Release source must be main');
assert.match(repo ?? '', /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
const environment = api('environments/scanner-release');
assert.equal(environment.deployment_branch_policy?.protected_branches, false);
assert.equal(environment.deployment_branch_policy?.custom_branch_policies, true, 'Custom main-only deployment policy required');
const policies = api('environments/scanner-release/deployment-branch-policies?per_page=100');
assert.equal(policies.total_count, 1, 'Exactly one deployment branch rule required');
assert.deepEqual(policies.branch_policies.map(({name, type}) => ({name, type})), [{name: 'main', type: 'branch'}]);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 const repo = process.env.GITHUB_REPOSITORY;
 checkReleaseEnvironment(process.env.GITHUB_REF, repo, path => JSON.parse(execFileSync('gh', ['api', `repos/${repo}/${path}`], {encoding: 'utf8'})));
 console.log('Agent-managed release: environment main-only deployment restriction verified. Signing and draft acceptance remain required.');
}
