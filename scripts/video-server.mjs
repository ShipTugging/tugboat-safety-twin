// Local artifact renderer only. Not included in the production application.
import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const output=path.resolve('artifacts.local/towline-video');
await mkdir(path.join(output,'frames'),{recursive:true});
await mkdir(path.join(output,'masks'),{recursive:true});
await mkdir(path.join(output,'metadata'),{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:5177,strictPort:true},plugins:[{name:'local-video-output',configureServer(s){
 s.middlewares.use('/__video/frame',async(req,res)=>{
  if(req.method!=='POST'||req.headers.origin!=='http://127.0.0.1:5177'){res.statusCode=403;res.end();return;}
  try{
   let bytes=0;const chunks=[];
   for await(const chunk of req){bytes+=chunk.length;if(bytes>4*1024*1024)throw Error('Frame too large');chunks.push(chunk);}
   const {index,jpeg,mask,metadata}=JSON.parse(Buffer.concat(chunks).toString());
   if(!Number.isInteger(index)||index<0||index>=600||!jpeg.startsWith('data:image/jpeg;base64,'))throw Error('Invalid frame');
   const name=String(index).padStart(4,'0');
   await writeFile(path.join(output,'frames',`${name}.jpg`),Buffer.from(jpeg.split(',')[1],'base64'));
   if(mask?.startsWith('data:image/png;base64,'))await writeFile(path.join(output,'masks',`${name}.png`),Buffer.from(mask.split(',')[1],'base64'));
   await writeFile(path.join(output,'metadata',`${name}.json`),JSON.stringify(metadata));
   res.end('ok');
  }catch(e){res.statusCode=400;res.end(String(e));}
 });
}}]});
await server.listen();
console.log('http://127.0.0.1:5177/scripts/video-capture.html');
console.log(output);
