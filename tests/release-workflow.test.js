// SPDX-License-Identifier: AGPL-3.0-only
import {test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {checkReleaseEnvironment} from '../scripts/check-release-environment.mjs';

test('reusing an unpublished draft preserves its version tag and draft-only state explicitly',()=>{
 const workflow=readFileSync('.github/workflows/release.yml','utf8');
 const command=workflow.split('\n').find(line=>line.includes('gh api -X PATCH')&&line.includes('/releases/$EXISTING'));
 expect(command).toBeDefined();
 for(const field of ['-f tag_name="v$VERSION"','-f target_commitish="$GITHUB_SHA"','-F draft=true','-F prerelease=false'])expect(command).toContain(field);
 expect(workflow.indexOf('Never overwrite a published release')).toBeLessThan(workflow.indexOf(command.trim()));
 expect(workflow).toContain('Create draft release only (never publish automatically)');
});

test('agent-managed policy retains automated signing, packaging, OCR and draft inspection gates',()=>{
 const workflow=readFileSync('.github/workflows/release.yml','utf8');
 expect(workflow).not.toContain('Required environment reviewers must be configured');
 for(const gate of ['environment: scanner-release', "github.ref == 'refs/heads/main'", 'node scripts/check-release-environment.mjs', 'npm audit --audit-level=high', 'cargo test --locked', 'npm test', 'npm run test:intake', 'TAURI_SIGNING_PRIVATE_KEY:', 'releaseDraft: true', 'verify-macos-packaging.py', 'verify-local-ocr-package.py', 'node scripts/check-draft.mjs']) expect(workflow).toContain(gate);
});

const policy={protected_branches:false,custom_branch_policies:true};
const mainRules={total_count:1,branch_policies:[{name:'main',type:'branch'}]};
for(const [name,ref,environment,rules,accepted] of [
 ['no human reviewer required','refs/heads/main',{deployment_branch_policy:policy,protection_rules:[]},mainRules,true],
 ['other protections retained','refs/heads/main',{deployment_branch_policy:policy,protection_rules:[{type:'wait_timer',wait_timer:5}]},mainRules,true],
 ['non-main rejected','refs/heads/feature',{deployment_branch_policy:policy},mainRules,false],
 ['unrestricted environment rejected','refs/heads/main',{deployment_branch_policy:null},mainRules,false],
 ['wildcard rejected','refs/heads/main',{deployment_branch_policy:policy},{total_count:1,branch_policies:[{name:'*',type:'branch'}]},false],
 ['tag rule rejected','refs/heads/main',{deployment_branch_policy:policy},{total_count:1,branch_policies:[{name:'main',type:'tag'}]},false],
 ['extra rule rejected','refs/heads/main',{deployment_branch_policy:policy},{total_count:2,branch_policies:[...mainRules.branch_policies,{name:'feature',type:'branch'}]},false],
]) test(`environment guard: ${name}`,()=>{
 const check=()=>checkReleaseEnvironment(ref,'example/scanner',path=>path.includes('deployment-branch-policies')?rules:environment);
 if(accepted) expect(check).not.toThrow(); else expect(check).toThrow();
});
