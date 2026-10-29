/** Run after `netlify build --offline`: catch missing dynamically served assets. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {workspacePage} from '../features/msn-local/hosted-ui.mjs';
const root=path.resolve('.netlify/functions-internal/___netlify-server-handler');
const pages=['','projects','templates','articles','library','social','video','images','image-editor','msn-video','settings','import','studio-navigation.js','studio-animation.mjs','hosted-transport.js'];
for(const file of new Set(pages.map(workspacePage))){
 assert.ok(file,'Every workspace route needs a source file');
 const expected=await fs.readFile(path.join('features/msn-local',file));
 const actual=await fs.readFile(path.join(root,'features/msn-local',file));
 assert.ok(actual.equals(expected),'Packaged source differs: '+file);
}
for(const file of ['features/msn-local/models/u2netp.onnx','node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm','node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs'])assert.ok((await fs.stat(path.join(root,file))).size>0);
console.log('Packaged Studio pages, browser scripts, segmentation model and WASM verified.');
