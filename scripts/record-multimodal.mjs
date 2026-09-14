// Local/offline V1: simulation timestamps never depend on rendering/encoding speed.
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {mkdir, writeFile, rename, readFile} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {generateRecording, recordingImuCsv, validateRecordingConfig} from '../src/simulation/recording.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const options = {}, allowed = new Set(['duration','seed','session-id','sequence-id','out','python','browser']);
const usage = 'node --import tsx scripts/record-multimodal.mjs --session-id run-001 [--duration 20] [--seed 2043] [--sequence-id recording-001] [--out path] [--python path] [--browser chrome|chromium]';
const args = process.argv.slice(2);
if (args.includes('--help')) { console.log(usage); process.exit(0); }
for (let i=0; i<args.length; i+=2) {
  const key = args[i].replace(/^--/, '');
  if (!args[i].startsWith('--') || !allowed.has(key) || options[key] !== undefined || args[i+1] === undefined)
    throw new Error(usage);
  options[key] = args[i+1];
}
const config = {sessionId: options['session-id'] ?? '', sequenceId: options['sequence-id'] ?? options['session-id'] ?? '',
  durationSec: Number(options.duration ?? 20), seed: Number(options.seed ?? 2043)};
validateRecordingConfig(config);
if (options.browser && !['chrome','chromium'].includes(options.browser)) throw new Error('Invalid browser');
const python = options.python ?? resolve(root, '../tugboat-safety_model/.venv/bin/python');
const output = resolve(options.out ?? resolve(root, 'recordings', config.sessionId));
function runPython(args) {
  return new Promise((resolvePromise, reject) => {
    const process = spawn(python, ['-B', ...args], {stdio: 'inherit'});
    process.on('error', reject);
    process.on('exit', code => code === 0 ? resolvePromise() : reject(new Error(`Python exited ${code}`)));
  });
}
await runPython(['-c', 'import PIL, imageio_ffmpeg; print("Recording encoder dependencies ready")']);
const recording = generateRecording(config), manifest = {...recording.session, status: 'generating'};
await mkdir(dirname(output), {recursive: true});
await mkdir(output); // A recording always gets a NEW directory, never patches an old run.
const json = async (name, value) => {
  const target = resolve(output, name);
  await writeFile(target+'.partial', JSON.stringify(value,null,2)+'\n');
  await rename(target+'.partial', target);
};
const started = performance.now(); // Diagnostics only; never a sensor timestamp.
let server, browser;
try {
  await json('session.json', manifest);
  await mkdir(resolve(output, 'frames'));
  await writeFile(resolve(output, 'imu_raw.csv'), recordingImuCsv(recording.imu), {flag:'wx'});
  await runPython([resolve(root, '../tugboat-safety_IMU/run_pipeline.py'),
    '--input', resolve(output,'imu_raw.csv'), '--output', resolve(output,'imu_normalized.csv'),
    '--diagnostics', resolve(output,'imu_diagnostics.json')]);
  server = await createServer({root, logLevel:'error', server:{host:'127.0.0.1',port:0}});
  await server.listen();
  browser = await chromium.launch({channel:options.browser==='chromium'?undefined:'chrome', headless:true,
    args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
  const page = await browser.newPage({viewport:{width:1280,height:720}}), browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  page.setDefaultTimeout(60000);
  await page.goto(server.resolvedUrls.local[0]+'scripts/recording-capture.html');
  await page.waitForFunction(() => !!window.recording);
  const sidecar = [], renderChecks = [];
  const capture = sample => page.evaluate(next => window.recording.capture(next), sample);
  for (const entry of recording.camera) {
    const frame = await capture(entry.sample);
    if (browserErrors.length) throw new Error(`Browser errors: ${browserErrors.join(' | ')}`);
    if (!frame.jpeg.startsWith('data:image/jpeg;base64,')) throw new Error('Expected RGB JPEG');
    // Re-render identical state after extra browser frames: animation must be simulation-time driven.
    if (entry.sample.index === 0 || entry.sample.index === recording.camera.length-1) {
      await page.waitForTimeout(150);
      const repeated = await capture(entry.sample);
      if (repeated.jpeg !== frame.jpeg) throw new Error(`Wall-clock-dependent render at frame ${entry.sample.index}`);
      renderChecks.push({frame_index:entry.sample.index, repeated_rgb_identical:true});
    }
    const bytes = Buffer.from(frame.jpeg.split(',')[1], 'base64');
    await writeFile(resolve(output, entry.sidecar.image_path), bytes, {flag:'wx'});
    sidecar.push({...entry.sidecar, camera:frame.camera, rgb_sha256:createHash('sha256').update(bytes).digest('hex')});
    // Persist progress so cancellation leaves a diagnosable incomplete recording.
    await writeFile(resolve(output, 'camera_frames.jsonl'), sidecar.map(row=>JSON.stringify(row)).join('\n')+'\n');
    if (sidecar.length%12===0) console.log(`Recording: ${sidecar.length}/${recording.camera.length} camera frames`);
  }
  await json('render_validation.json', {browser:browser.version(), browser_errors:browserErrors,
    repeated_frame_checks:renderChecks, note:'Byte equality is checked within this browser/runtime, not across GPUs.'});
  await browser.close(); browser = undefined;
  await server.close(); server = undefined;
  manifest.status = 'captured';
  await json('session.json', manifest);
  await runPython([resolve(root,'scripts/encode-video.py'), '--recording-dir', output]);
  manifest.status = 'complete';
  manifest.generation_elapsed_sec = (performance.now()-started)/1000;
  await json('session.json', manifest);
  const validation = JSON.parse(await readFile(resolve(output,'recording_validation.json'),'utf8'));
  console.log(JSON.stringify({output, ...validation, generation_elapsed_sec:manifest.generation_elapsed_sec},null,2));
} catch (error) {
  manifest.status = 'failed'; manifest.failure = String(error);
  await json('session.json', manifest);
  throw error;
} finally {
  await browser?.close(); await server?.close();
}
