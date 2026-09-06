import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {games} from '../public/games.mjs';
import {imageData} from '../public/images.mjs';
import {translations,languages} from '../public/i18n.mjs';
import {safeAffiliate} from '../lib/security.mjs';
const root=new URL('../',import.meta.url);
async function read(name){return readFile(new URL(name,root),'utf8')}
const config=JSON.parse(await read('public/site-config.json'));safeAffiliate(config.affiliateUrl);assert.ok(config.promoCode);
const html=await read('public/index.html');
for(const match of html.matchAll(/data-i18n="([^"]+)"/g))for(const [lang] of languages)assert.ok(translations[lang][match[1]],`${lang}:${match[1]}`);
for(const match of html.matchAll(/(?:src|href)="([^"?#]+)"/g)){const ref=match[1];if(ref.startsWith('api/')||ref.includes(':'))continue;await readFile(new URL(`public/${ref}`,root))}
assert.equal(new Set(games.map(g=>g.id)).size,games.length);
for(const game of games){
  assert.ok(imageData[game.id].startsWith('data:image/jpeg;base64,'));
  const packed=Buffer.from(imageData[game.id].slice('data:image/jpeg;base64,'.length),'base64');
  assert.ok(packed.length>1000);assert.equal(packed[0],0xff);assert.equal(packed[1],0xd8);
}
async function validateFiles(dir){for(const entry of await readdir(new URL(dir,root),{withFileTypes:true})){const file=dir+entry.name;if(entry.isDirectory()){if(entry.name!=='.git'&&entry.name!=='node_modules')await validateFiles(`${file}/`);continue}if(/\.(mjs|js)$/.test(file))execFileSync(process.execPath,['--check',fileURLToPath(new URL(file,root))]);if(file.endsWith('.json'))JSON.parse(await read(file));if(!file.includes('assets/')&&!file.startsWith('.env'))assert.ok(!/\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/.test(await read(file)),`Secret-like value in ${file}`)}}
await validateFiles('');
console.log(`Validated: ${games.length} local covers, ${languages.length} locales, asset references, JavaScript syntax and public configuration.`);
