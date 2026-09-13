import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const server=await createServer({logLevel:'error',server:{host:'127.0.0.1',port:0}});
let browser;
try {
  await server.listen();browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage();await page.goto(server.resolvedUrls.local[0]+'scripts/dataset-v2-capture.html');
  await page.waitForFunction(()=>window.datasetV2?.ready,null,{timeout:60000});
  const result=await page.evaluate(async()=>{const {maskOracle}=await import('/scripts/dataset-v2-oracle.ts');return maskOracle();});
  for(const f of result.results){assert.equal(f.mismatch,0);assert.ok(f.white>0);}
  assert.ok(result.changedPixels>0);assert.ok(result.stateRestored);
  await mkdir('artifacts.local/v2-tests',{recursive:true});await writeFile('artifacts.local/v2-tests/mask-oracle.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
} finally {await browser?.close();await server.close();}
