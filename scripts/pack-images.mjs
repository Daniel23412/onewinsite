import {readFile,writeFile} from 'node:fs/promises';
import {games} from '../public/games.mjs';
const rows=[];
for(const game of games){
  const bytes=await readFile(new URL(`../public/assets/${game.id}.jpg`,import.meta.url));
  rows.push(`  ${JSON.stringify(game.id)}: ${JSON.stringify(`data:image/jpeg;base64,${bytes.toString('base64')}`)}`);
}
await writeFile(new URL('../public/images.mjs',import.meta.url),`// Generated from public/assets by scripts/pack-images.mjs.\nexport const imageData = {\n${rows.join(',\n')}\n};\n`);
console.log(`Packed ${rows.length} covers.`);
