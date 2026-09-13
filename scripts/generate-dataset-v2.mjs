// Local-only positive pilot; no production UI, upload or model training.
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {v2Config,validateV2Config,planParents} from '../src/dataset/v2/scenarios.ts';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const allowed=new Set(['count','seed','width','height','out','config','browser','python']),options={};
const args=process.argv.slice(2);
for(let i=0;i<args.length;i+=2){const key=args[i].replace(/^--/,'');if(!args[i].startsWith('--')||!allowed.has(key)||args[i+1]===undefined)throw new Error('Usage: npm run dataset:v2 -- [--count 120] [--seed 2043] [--width 1280] [--height 720] [--out path] [--config config.json] [--browser chrome|chromium] [--python path]');options[key]=args[i+1];}
const config=structuredClone(v2Config);
if(options.config){const value=JSON.parse(await readFile(resolve(options.config),'utf8'));for(const [key,override] of Object.entries(value)){if(!(key in config))throw new Error(`Unknown V2 config key: ${key}`);config[key]=override&&typeof override==='object'&&!Array.isArray(override)?{...config[key],...override}:override;}}
for(const [arg,key] of [['count','datasetSize'],['seed','seed'],['width','imageWidth'],['height','imageHeight']])if(options[arg]!==undefined)config[key]=Number(options[arg]);
validateV2Config(config);
planParents(config); // Fail coverage feasibility before creating output or starting a browser.
if(options.browser&&!['chrome','chromium'].includes(options.browser))throw new Error('Invalid browser');
const runId=randomUUID().replaceAll('-','');
const output=resolve(options.out??resolve(root,'towline_dataset_v2',runId));
const python=resolve(options.python??resolve(root,'../tugboat-safety_model/.venv/bin/python'));
await mkdir(dirname(output),{recursive:true});await mkdir(output); // Refuse overwrite.
let browser,server,worker,lines;
const pending=[];
try {
  await writeFile(resolve(output,'README_DATASET.md'),await readFile(resolve(root,'docs/DATASET_V2.md')));
  worker=spawn(python,['-B',resolve(root,'scripts/dataset-v2-mask-check.py')],{stdio:['pipe','pipe','inherit']});
  lines=createInterface({input:worker.stdout});
  lines.on('line',line=>{const next=pending.shift();if(!next)return;try{next.resolve(JSON.parse(line));}catch(error){next.reject(error);}});
  worker.on('error',error=>{for(const p of pending.splice(0))p.reject(error);});
  worker.on('exit',code=>{for(const p of pending.splice(0))p.reject(new Error(`Mask checker exited ${code}`));});
  server=await createServer({root,logLevel:'error',server:{host:'127.0.0.1',port:0}});await server.listen();
  browser=await chromium.launch({channel:options.browser==='chromium'?undefined:'chrome',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
  const page=await browser.newPage({viewport:{width:1280,height:720}}),browserErrors=[];
  page.on('pageerror',e=>{browserErrors.push(e.message);console.error('Browser error:',e.message);});
  await page.exposeFunction('__v2CheckMask',(png,minimum_iou)=>new Promise((resolve,reject)=>{
    if(worker.exitCode!==null){reject(new Error('Mask checker is not running'));return;}
    const timer=setTimeout(()=>reject(new Error('Mask checker timed out')),60000);
    pending.push({resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});
    worker.stdin.write(JSON.stringify({png,minimum_iou})+'\n');
  }));
  let saved=0;
  await page.exposeFunction('__v2Write',async(path,data,encoding)=>{
    const file=resolve(output,path);if(!file.startsWith(output+sep)||!['utf8','base64'].includes(encoding))throw new Error('Invalid output path/encoding');
    await mkdir(dirname(file),{recursive:true});await writeFile(file+'.partial',Buffer.from(data,encoding));await rename(file+'.partial',file);
    if(path.startsWith('metadata/')){saved++;if(saved%10===0)console.log(`V2 pilot: ${saved}/${config.datasetSize}`);}
  });
  await page.goto(server.resolvedUrls.local[0]+'scripts/dataset-v2-capture.html');
  await page.waitForFunction(()=>window.datasetV2?.ready,{},{timeout:60000});
  const result=await page.evaluate(({config,runId})=>window.datasetV2.generate(config,runId),{config,runId});
  const gitInfo=cwd=>({commit:execFileSync('git',['rev-parse','HEAD'],{cwd,encoding:'utf8'}).trim(),workingTreeModified:!!execFileSync('git',['status','--porcelain'],{cwd,encoding:'utf8'}).trim()});
  const runtime={generation_run_id:runId,node:process.version,browser:browser.version(),platform:process.platform,sourceGit:gitInfo(root),sharedMaskGit:gitInfo(resolve(root,'..')),browserErrors};
  await writeFile(resolve(output,'runtime.json'),JSON.stringify(runtime,null,2)+'\n');
  if(browserErrors.length)throw new Error('Browser errors occurred; inspect runtime.json');
  console.log(JSON.stringify({output,...result},null,2));
} finally {await browser?.close();await server?.close();lines?.close();worker?.stdin.end();worker?.kill();}
