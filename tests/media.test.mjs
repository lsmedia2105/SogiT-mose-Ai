import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createProject, createScene } from '../shared/domain.mjs';
import { importAsset } from '../electron/store.mjs';
import { runProcess, renderTimeline, probeMedia, upscaleVideo, outputSize } from '../electron/media.mjs';

test('portrait and scope outputs are even-sized and preserve requested canvas ratio',()=>{assert.deepEqual(outputSize('2160p','9:16'),[2160,3840]);assert.deepEqual(outputSize('1440p','16:9'),[2560,1440]);assert.deepEqual(outputSize('1080p','2.39:1'),[1920,804]);assert.throws(()=>outputSize('8k','16:9'));});
test('FFmpeg workflow renders two scenes, voice replacement, music, resize and cancellation', {timeout:60000},async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'sogit-media-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await runProcess('ffmpeg',['-y','-f','lavfi','-i','color=c=red:s=320x180:r=24:d=0.5','-c:v','libx264','-pix_fmt','yuv420p',path.join(root,'silent.mp4')]);
  await runProcess('ffmpeg',['-y','-f','lavfi','-i','color=c=blue:s=320x180:r=24:d=2','-f','lavfi','-i','sine=frequency=200:duration=2','-shortest','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',path.join(root,'original.mp4')]);
  await runProcess('ffmpeg',['-y','-f','lavfi','-i','sine=frequency=800:duration=0.5',path.join(root,'voice.wav')]);
  const p=createProject('Test');p.assets=[await importAsset(root,path.join(root,'silent.mp4')),await importAsset(root,path.join(root,'original.mp4')),await importAsset(root,path.join(root,'voice.wav'))];
  const make=(index,a)=>createScene(index,{duration:1,versions:[{id:`v${index}`,assetId:a.id}],selectedVersionId:`v${index}`});
  p.scenes=[make(0,p.assets[0]),make(1,p.assets[1])];p.scenes[1].narrationAssetId=p.assets[2].id;p.musicAssetId=p.assets[2].id;
  const settings={profile:'eco'},output=path.join(root,'film.mp4');
  await renderTimeline({root,project:p,settings,output,resolution:'720p'});
  const info=await probeMedia(settings,output);assert.equal(info.streams.find(s=>s.codec_type==='video').width,1280);assert.equal(info.streams.find(s=>s.codec_type==='video').height,720);assert.ok(info.streams.some(s=>s.codec_type==='audio'));assert.ok(Math.abs(Number(info.format.duration)-2)<0.2);
  const scaled=path.join(root,'scaled.mp4');await upscaleVideo({root,asset:p.assets[0],output:scaled,resolution:'720p',ratio:'9:16',engine:'lanczos',settings});
  const portrait=await probeMedia(settings,scaled);assert.equal(portrait.streams[0].width,720);assert.equal(portrait.streams[0].height,1280);
  const controller=new AbortController();controller.abort();const cancelled=path.join(root,'cancelled.mp4');
  await assert.rejects(upscaleVideo({root,asset:p.assets[0],output:cancelled,resolution:'720p',ratio:'16:9',engine:'lanczos',settings,signal:controller.signal}));
  await assert.rejects(fs.access(cancelled));
  p.scenes[0].selectedVersionId='missing';await assert.rejects(renderTimeline({root,project:p,settings,output:path.join(root,'invalid.mp4'),resolution:'720p'}),/chưa chọn video/);
});
