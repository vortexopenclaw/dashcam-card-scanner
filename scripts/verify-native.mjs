// SPDX-License-Identifier: AGPL-3.0-only
// Developer-only real-media cross-check. Neither ffmpeg nor ffprobe ships in the app.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,statSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {validate} from '../intake/schema.js';
const base=mkdtempSync(join(realpathSync(tmpdir()),'scanner-real-media-'));
const ffmpeg=process.env.TEST_FFMPEG||'ffmpeg',ffprobe=process.env.TEST_FFPROBE||'ffprobe';
const results=[];
for(const [codec,encoder,extra] of [['h264','libx264',['-preset','ultrafast']],['hevc','libx265',['-x265-params','log-level=error:pools=1','-tag:v','hvc1']]]){
 const source=join(base,codec);mkdirSync(source);const path=join(source,'2026_1015_120000_000001F.MP4');
 execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=640x360:rate=30:duration=2','-f','lavfi','-i','sine=frequency=1000:sample_rate=48000:duration=2','-c:v',encoder,...extra,'-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-shortest',path],{timeout:120000});
 const hash=()=>createHash('sha256').update(readFileSync(path)).digest('hex');const before=hash(),mtime=statSync(path).mtimeMs;
 const actual=JSON.parse(execFileSync('cargo',['run','--quiet','--manifest-path','src-tauri/Cargo.toml','--example','scan_fixture','--',source],{encoding:'utf8',timeout:120000}));
 const reference=JSON.parse(execFileSync(ffprobe,['-v','error','-select_streams','v:0','-show_entries','stream=codec_name,width,height,avg_frame_rate,duration,bit_rate','-of','json',path],{encoding:'utf8'})).streams[0];
 const v=actual.report.folders.flatMap(f=>f.videos)[0];assert(v,'native parser produced no measurement');assert.equal(v.codec,codec);assert.equal(v.codec,reference.codec_name);assert.equal(v.width,reference.width);assert.equal(v.height,reference.height);assert(Math.abs(v.durationSeconds-Number(reference.duration))<0.000001);const [n,d]=reference.avg_frame_rate.split('/').map(Number);assert(Math.abs(v.nominalFrameRate-n/d)<0.000001);assert(Math.abs(v.videoBitrate-Number(reference.bit_rate))<=1);assert.equal(v.fileSizeBytes,statSync(path).size);assert.equal(hash(),before);assert.equal(statSync(path).mtimeMs,mtime);
 const gateway=JSON.parse(actual.review.submissionJson);validate(gateway);assert.equal(gateway.evidence[0].sizeBytes,v.fileSizeBytes);assert.equal(gateway.evidence[0].durationSeconds,v.durationSeconds);assert.equal(gateway.evidence[0].bitrateKbps,v.videoBitrate/1000);assert.equal(gateway.evidence[0].containerBitrateKbps,null);
 results.push({codec,native:v,ffprobe:reference,sourceHashUnchanged:true,sourceMtimeUnchanged:true,gatewayValidated:true});
}
mkdirSync('verification',{recursive:true});writeFileSync('verification/native-media.json',JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify({generatedMediaLocation:base,results},null,2));
