// SPDX-License-Identifier: AGPL-3.0-only
import {test,expect} from 'vitest';
import {readFileSync} from 'node:fs';

test('reusing an unpublished draft preserves its version tag and draft-only state explicitly',()=>{
 const workflow=readFileSync('.github/workflows/release.yml','utf8');
 const command=workflow.split('\n').find(line=>line.includes('gh api -X PATCH')&&line.includes('/releases/$EXISTING'));
 expect(command).toBeDefined();
 for(const field of ['-f tag_name="v$VERSION"','-f target_commitish="$GITHUB_SHA"','-F draft=true','-F prerelease=false'])expect(command).toContain(field);
 expect(workflow.indexOf('Never overwrite a published release')).toBeLessThan(workflow.indexOf(command!.trim()));
 expect(workflow).toContain('Create draft release only (never publish automatically)');
});
