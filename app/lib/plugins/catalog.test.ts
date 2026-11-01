import {describe,it,expect} from 'vitest';
import {plugins,connectionStatus,type Health} from './catalog';
const now=Date.now(),plugin=plugins[0],health:Health={fingerprint:'v1',checkedAt:new Date(now).toISOString(),duration:12,ok:true};
describe('connection evidence',()=>{
 it('never treats configured credentials as verified',()=>expect(connectionStatus(plugin,true)).toBe('Configured — Not Verified'));
 it('requires a recent successful check for the current credentials',()=>{expect(connectionStatus(plugin,true,health,'v1',now)).toBe('Connected');expect(connectionStatus(plugin,true,health,'v2',now)).toBe('Configured — Not Verified');expect(connectionStatus(plugin,true,health,'v1',now+86400001)).toBe('Configured — Not Verified');});
 it('reports failures without changing configuration',()=>expect(connectionStatus(plugin,true,{...health,ok:false},'v1',now)).toBe('Needs Attention'));
 it('keeps planned integrations and missing configuration distinct',()=>{expect(connectionStatus(plugins.find(p=>p.planned)!,false)).toBe('Coming Soon');expect(connectionStatus(plugin,false,health,'v1')).toBe('Not Connected');});
 it('uses unique identifiers and only fixed HTTPS check endpoints',()=>{expect(new Set(plugins.map(p=>p.id)).size).toBe(plugins.length);for(const p of plugins)if(p.endpoint)expect(p.endpoint).toMatch(/^https:\/\//);});
});
