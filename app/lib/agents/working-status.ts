/** Read-only presentation of a confirmed, current worker lease. Never activates tools. */
export function workingTask(agent: {id:string; state:string; approved:boolean; brand:string; workspace:string}, tasks: readonly {id:string; owner:string; state:string; brand:string; workspace:string; title:string; runId?:string; leaseUntil?:string}[], now=Date.now()) {
 if(agent.state!=='Active'||!agent.approved)return null;
 return tasks.find(t=>t.owner===agent.id&&t.brand===agent.brand&&t.workspace===agent.workspace&&t.state==='Working'&&!!t.runId&&!!t.leaseUntil&&Date.parse(t.leaseUntil)>now)??null;
}
