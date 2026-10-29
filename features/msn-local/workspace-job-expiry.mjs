const active = new Set(['queued','running','saving']);
export function expiredWorkspaceJob(job,now=Date.now()) {
 if(!active.has(job.status))return false;
 const started=Date.parse(job.startedAt||job.createdAt);
 return Number.isFinite(started)&&now-started>(job.status==='queued'?120000:960000);
}
export async function expireWorkspaceJobs(workspace,now=Date.now()) {
 if(!(await workspace.snapshot()).state.jobs.some(j=>expiredWorkspaceJob(j,now)))return;
 await workspace.update(state=>{for(const j of state.jobs){if(!expiredWorkspaceJob(j,now))continue;j.status='failed';j.stage=j.startedAt?'Background worker exceeded its time limit. Existing media is preserved; review before retrying.':'Background worker did not start. Please check the deployment before retrying.';j.updatedAt=new Date(now).toISOString();}return true;});
}
