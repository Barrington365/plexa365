import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import atlas from '../../../public/agents/eyes.json';

it('maps two eyelids inside the actual still artwork for every companion',()=>{
  expect(Object.keys(atlas).sort()).toEqual(['banach','bob','fiddle','halley','hubble','huygens','james','linnaeus']);
  for(const [id,asset] of Object.entries(atlas)){
    const png=readFileSync(join(process.cwd(),'public','agents',id,'still.png'));
    expect(png.subarray(1,4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(256);expect(png.readUInt32BE(20)).toBe(asset.height);
    expect(asset.skin).toMatch(/^#[a-f0-9]{6}$/i);expect(asset.eyes).toHaveLength(2);
    for(const eye of asset.eyes){const [x,y,w,h]=eye;expect(eye).toHaveLength(4);expect(eye.every(Number.isInteger)).toBe(true);expect(Math.min(x,y,w,h)).toBeGreaterThan(0);expect(x+w).toBeLessThanOrEqual(256);expect(y+h).toBeLessThanOrEqual(asset.height);}
  }
});
