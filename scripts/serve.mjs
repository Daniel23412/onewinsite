import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {Readable} from 'node:stream';
import {handlers} from '../lib/handlers.mjs';

const root=fileURLToPath(new URL('../public/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.jpg':'image/jpeg','.png':'image/png'};
const routes={'/api/go':'go','/api/postback':'postback','/api/health':'health'};
createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    const name=routes[url.pathname];
    if(name){
      const options={method:req.method,headers:req.headers};
      if(!['GET','HEAD'].includes(req.method)){options.body=Readable.toWeb(req);options.duplex='half'}
      const response=await handlers[name](new Request(url,options));
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return}
    const filename=path.resolve(root,`.${decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname)}`);
    if(!filename.startsWith(root)||path.relative(root,filename).split(path.sep).some(p=>p.startsWith('.'))){res.writeHead(404);res.end('Not found');return}
    const data=await readFile(filename);res.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(req.method==='HEAD'?undefined:data);
  }catch{res.writeHead(404);res.end('Not found')}
}).listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log(`Pixel Club listening on port ${process.env.PORT||3000}`));
