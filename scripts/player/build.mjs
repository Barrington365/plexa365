import {build} from 'esbuild';
await build({entryPoints:['features/player/browser.js'],bundle:true,minify:true,outfile:'public/player/player.js',legalComments:'external',loader:{'.woff':'file','.woff2':'file','.ttf':'file','.eot':'file','.svg':'dataurl'},target:['es2020']});
