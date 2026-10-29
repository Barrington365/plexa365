import test from 'node:test';import assert from 'node:assert/strict';import {parseSrt,validateArticle,captionsAss,backdrop} from './article.mjs';
const valid='1\n00:00:00,100 --> 00:00:01,500\nLiverpool & Mac Allister\n';
test('accepts timed captions and rejects overlaps, reversed and missing timing',()=>{assert.equal(parseSrt(valid)[0].end,1.5);for(const s of ['',valid+'\n2\n00:00:01,000 --> 00:00:02,000\nOverlap',valid.replace('01,500','00,000')])assert.throws(()=>parseSrt(s));});
test('missing narration cannot silently render',()=>assert.throws(()=>validateArticle({srt:valid}),/narration/));
test('untrusted caption and headline text cannot inject renderer instructions',()=>{assert(!captionsAss(parseSrt(valid.replace('Liverpool & Mac Allister','{\\pos(1,2)}Liverpool'))).includes('\\pos'));assert(backdrop({background:'#000000',status:'<script>',heading:'x&y',subheading:'z'}).includes('&lt;script&gt;'));});
