const active = new Set(['queued','running','saving']);
export function expiredWorkspaceJob(job,now=Date.now()) {
 if(!active.has(job.status))return false;
 const mark=job.status==='queued'?Date.parse(job.queuedAt||job.createdAt):Date.parse(job.startedAt||job.createdAt);
 return Number.isFinite(mark)&&now-mark>(job.status==='queued'?120000:960000);
}
export async function expireWorkspaceJobs(workspace,now=Date.now()) {
 if(!(await workspace.snapshot()).state.jobs.some(j=>expiredWorkspaceJob(j,now)))return;
 await workspace.update(state=>{for(const j of state.jobs){if(!expiredWorkspaceJob(j,now))continue;if(j.render?.scenes?.length){for(const scene of j.render.scenes)if(scene.status==='rendering')scene.status='pending';if(j.render.assembly?.status==='rendering')j.render.assembly.status='pending';const done=j.render.scenes.filter(scene=>scene.status==='complete').length;j.status='queued';j.queuedAt=new Date(now).toISOString();delete j.startedAt;j.stage=`Saved ${done} of ${j.render.scenes.length} scenes. Continuing.`;j.updatedAt=j.queuedAt;continue;}j.status='failed';j.stage=j.startedAt?'Background worker exceeded its time limit. Existing media is preserved; review before retrying.':'Background worker did not start. Please check the deployment before retrying.';j.updatedAt=new Date(now).toISOString();}return true;});
}
