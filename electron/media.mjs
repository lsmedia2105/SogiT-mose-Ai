import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { realChild } from './store.mjs';

export function runProcess(executable, args, { signal, onLine = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, shell: false, signal });
    let tail = '';
    child.stdout.on('data', data => onLine(data.toString()));
    child.stderr.on('data', data => { tail = (tail + data).slice(-6000); onLine(data.toString()); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(tail) : reject(new Error(signal?.aborted ? 'Đã hủy tác vụ.' : `Công cụ kết thúc với mã ${code}: ${tail.slice(-2200)}`)));
  });
}
export function outputSize(resolution, ratio) {
  const long = { '720p': 1280, '1080p': 1920, '1440p': 2560, '2160p': 3840 }[resolution];
  if (!long) throw new Error('Độ phân giải không hợp lệ.');
  const even = n => Math.round(n / 2) * 2;
  if (ratio === '9:16') return [even(long * 9 / 16), long];
  if (ratio === '1:1') return [long, long];
  if (ratio === '2.39:1') return [long, even(long / 2.39)];
  if (ratio !== '16:9') throw new Error('Tỷ lệ không hợp lệ.');
  return [long, even(long * 9 / 16)];
}
const mediaArgs = ['-hide_banner', '-nostdin', '-y'];
const exists = async p => { try { await fs.access(p); return true; } catch { return false; } };
export async function renderTimeline({ root, project, settings, output, resolution, signal, onLine, onProgress }) {
  const ffmpeg = settings.ffmpegPath || 'ffmpeg';
  const [width, height] = outputSize(resolution, project.ratio);
  if (!project.scenes.length) throw new Error('Chưa có phân cảnh.');
  const sources = [];
  for (const scene of project.scenes) {
    const selected = scene.versions.find(v => v.id === scene.selectedVersionId);
    const asset = project.assets.find(a => a.id === selected?.assetId && a.type === 'video');
    if (!asset) throw new Error(`${scene.title}: chưa chọn video. Hãy nhập và duyệt video trước khi xuất.`);
    sources.push({ scene, file: await realChild(root, asset.path) });
  }
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'sogit-render-'));
  let completed = false;
  try {
    for (let i = 0; i < sources.length; i++) {
      const { scene, file } = sources[i];
      const args = [...mediaArgs, '-i', file];
      const voices = [];
      for (const id of [scene.narrationAssetId, scene.dialogueAssetId].filter(Boolean)) {
        const audio = project.assets.find(a => a.id === id && a.type === 'audio');
        if (!audio) throw new Error(`${scene.title}: không tìm thấy âm thanh đã gán.`);
        voices.push(await realChild(root, audio.path));
      }
      for (const voice of voices) args.push('-i', voice);
      args.push('-f','lavfi','-i','anullsrc=r=48000:cl=stereo');
      const vf = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${project.fps},tpad=stop_mode=clone:stop_duration=${scene.duration}`;
      // Original clip audio is deliberately omitted when separate voice tracks are supplied.
      // With no voice tracks, retain source audio when present (probe), otherwise use silence.
      let audioMap = `${voices.length + 1}:a`;
      if (voices.length) {
        const inputs = voices.map((_, j) => `[${j + 1}:a]`).join('');
        args.push('-filter_complex',`${inputs}amix=inputs=${voices.length}:duration=longest:normalize=0,apad,atrim=duration=${scene.duration}[mix]`);
        audioMap = '[mix]';
      } else {
        const probe = await probeMedia(settings, file, signal);
        if (probe.streams.some(s => s.codec_type === 'audio')) {
          args.push('-filter_complex',`[0:a]apad,atrim=duration=${scene.duration}[original]`);
          audioMap = '[original]';
        }
      }
      args.push('-map','0:v:0','-map',audioMap,'-vf',vf,'-t',String(scene.duration),'-c:v','libx264','-preset',settings.profile === 'eco' ? 'ultrafast' : 'fast','-crf','18','-pix_fmt','yuv420p','-threads',String(settings.profile === 'eco' ? 2 : 4),'-c:a','aac','-ar','48000','-ac','2',path.join(temp,`${i}.mp4`));
      onProgress?.({ stage: `Chuẩn hóa cảnh ${i + 1}/${sources.length}`, percent: Math.round(i / (sources.length + 1) * 100) });
      await runProcess(ffmpeg, args, { signal, onLine });
    }
    await fs.writeFile(path.join(temp,'concat.txt'), sources.map((_,i)=>`file '${i}.mp4'`).join('\n'));
    const music = project.assets.find(a => a.id === project.musicAssetId && a.type === 'audio');
    const args = [...mediaArgs,'-f','concat','-safe','1','-i',path.join(temp,'concat.txt')];
    if (music) {
      const volume = Number(project.musicVolume);
      if (!Number.isFinite(volume) || volume < 0 || volume > 1) throw new Error('Âm lượng nhạc không hợp lệ.');
      args.push('-stream_loop','-1','-i',await realChild(root,music.path),'-filter_complex',`[1:a]volume=${volume}[music];[0:a][music]amix=inputs=2:duration=first:normalize=0[a]`,'-map','0:v','-map','[a]','-c:v','copy','-c:a','aac');
    } else args.push('-c','copy');
    args.push('-movflags','+faststart', output);
    onProgress?.({ stage: 'Ghép phim và âm thanh', percent: 95 });
    await runProcess(ffmpeg, args, { signal, onLine });
    completed = true;
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
    if (!completed && await exists(output)) await fs.rm(output, { force: true });
  }
}
export async function probeMedia(settings, file, signal) {
  const executable = settings.ffprobePath || (settings.ffmpegPath ? path.join(path.dirname(settings.ffmpegPath), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe') : 'ffprobe');
  let text = '';
  await runProcess(executable, ['-v','error','-show_streams','-show_format','-of','json',file], { signal, onLine: data => text += data });
  try { return JSON.parse(text); } catch { throw new Error('Không đọc được thông tin media từ FFprobe.'); }
}
export async function upscaleVideo({ root, asset, output, resolution, ratio, engine, settings, signal, onLine, onProgress }) {
  const input = await realChild(root, asset.path);
  const ffmpeg = settings.ffmpegPath || 'ffmpeg';
  const [w,h] = outputSize(resolution, ratio);
  const scale = `scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1`;
  if (engine === 'lanczos') {
    try {
      await runProcess(ffmpeg,[...mediaArgs,'-i',input,'-vf',scale,'-c:v','libx264','-preset','fast','-crf','18','-threads',settings.profile === 'eco' ? '2' : '4','-c:a','aac','-movflags','+faststart',output],{signal,onLine});
    } catch (error) { await fs.rm(output,{force:true}); throw error; }
    return;
  }
  if (engine !== 'realesrgan' || !settings.realesrganPath || !settings.realesrganModelDir) throw new Error('Cần chọn executable Real-ESRGAN-ncnn-vulkan và thư mục models trong Cài đặt.');
  const probe = await probeMedia(settings, input, signal);
  const video = probe.streams.find(s=>s.codec_type==='video');
  if (!video) throw new Error('File không có luồng video.');
  const [n,d] = String(video.avg_frame_rate || '24/1').split('/').map(Number);
  const fps = n / (d || 1);
  if (!Number.isFinite(fps) || fps < 1 || fps > 120) throw new Error('FPS không được hỗ trợ cho AI upscale.');
  if (Number(probe.format.duration) > 120) throw new Error('AI upscale local giới hạn mỗi clip 120 giây để bảo vệ dung lượng tạm. Hãy chia clip trước.');
  const temp = await fs.mkdtemp(path.join(os.tmpdir(),'sogit-upscale-'));
  try {
    const frames = path.join(temp,'in'), enhanced = path.join(temp,'out');
    await fs.mkdir(frames); await fs.mkdir(enhanced);
    onProgress?.({stage:'Tách khung hình — cần dung lượng ổ tạm lớn',percent:5});
    await runProcess(ffmpeg,[...mediaArgs,'-i',input,'-an','-vf',`fps=${fps}`,path.join(frames,'%08d.png')],{signal,onLine});
    onProgress?.({stage:'AI upscale bằng Real-ESRGAN',percent:30});
    await runProcess(settings.realesrganPath,['-i',frames,'-o',enhanced,'-m',settings.realesrganModelDir,'-n','realesrgan-x4plus','-s','4','-t','128','-j','1:1:1','-f','png'],{signal,onLine});
    onProgress?.({stage:'Đóng gói video',percent:85});
    await runProcess(ffmpeg,[...mediaArgs,'-framerate',String(fps),'-i',path.join(enhanced,'%08d.png'),'-i',input,'-map','0:v','-map','1:a?','-vf',scale,'-c:v','libx264','-preset','fast','-crf','18','-threads','2','-c:a','aac','-shortest','-movflags','+faststart',output],{signal,onLine});
  } catch (error) { await fs.rm(output,{force:true}); throw error; }
  finally { await fs.rm(temp,{recursive:true,force:true}); }
}
export { toSrt } from '../shared/subtitles.mjs';
