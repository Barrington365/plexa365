import {test} from 'node:test';
import assert from 'node:assert/strict';
import {showNextPreview} from './preview.mjs';
const base={hasNext:true,started:true,duration:120,currentTime:110,inAd:false};
test('preview appears at ten seconds remaining, not before',()=>{
 assert.equal(showNextPreview({...base,currentTime:109.9}),false);
 assert.equal(showNextPreview(base),true);
 assert.equal(showNextPreview({...base,currentTime:119.9}),true);
});
test('preview hides on seeking backwards, completion and unknown duration',()=>{
 for(const patch of [{currentTime:40},{currentTime:120},{duration:NaN},{duration:Infinity},{duration:0}])assert.equal(showNextPreview({...base,...patch}),false);
});
test('preview requires started content and a next video, never an advertisement',()=>{
 for(const patch of [{hasNext:false},{started:false},{inAd:true}])assert.equal(showNextPreview({...base,...patch}),false);
});
