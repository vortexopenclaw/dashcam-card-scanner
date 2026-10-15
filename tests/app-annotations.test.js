// SPDX-License-Identifier: AGPL-3.0-only
import {test,expect} from 'vitest';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import {validate} from '../intake/schema.js';
test('actual Rust mixed-card serializer matches additive intake contract',()=>{
 const output=execFileSync('cargo',['test','--quiet','--locked','--manifest-path','src-tauri/Cargo.toml','annotations::tests::mixed_fixture_emits_contract','--','--nocapture'],{encoding:'utf8',timeout:240000});
 const line=output.split('\n').find(line=>line.startsWith('APP_CONTRACT:'));expect(line).toBeDefined();
 const body=JSON.parse(line.slice('APP_CONTRACT:'.length));expect(validate(body)).toBe(body);
 const publicBody=JSON.parse(output.split('\n').find(line=>line.startsWith('APP_PUBLIC:')).slice('APP_PUBLIC:'.length));const publicSchema=new Ajv2020({strict:false}).compile(JSON.parse(readFileSync('tests/reference/card-scan.schema.json','utf8')));expect(publicSchema(publicBody),JSON.stringify(publicSchema.errors)).toBe(true);expect(JSON.stringify(publicBody)).not.toContain('PrivateTester');
 expect(body.cohorts.map(c=>c.owner.channelCount)).toEqual([2,3]);expect(body.cohorts.flatMap(c=>c.evidenceIndices).sort()).toEqual([0,1]);
 expect(body.cohorts[0].owner.timeLapseFps).toBe(1);expect(body.evidence[0].fps).toBe(30);expect(body.contributor.dashcamTalkUsername).toBe('PrivateTester');
 expect(JSON.stringify(body)).not.toContain('PRIVATE-20261015');
},240000);
