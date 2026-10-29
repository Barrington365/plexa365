/** Point one image layer at a Library asset. Other layers and projects stay as they are. */
export async function assignLayerAsset(store, { projectId, sceneId, layerId, asset }) {
  if (typeof projectId !== 'string' || !projectId) throw Error('Choose the open project');
  if (typeof sceneId !== 'string' || !sceneId) throw Error('Choose the open scene');
  if (typeof layerId !== 'string' || !layerId) throw Error('Choose the open image layer');
  if (typeof asset !== 'string' || !asset) throw Error('Choose the edited image');
  const project = await store.get(projectId);
  const scenes = structuredClone(project.scenes || []);
  const scene = scenes.find(item => item.id === sceneId);
  if (!scene) throw Error('Scene not found in this project');
  const layer = (scene.layers || []).find(item => item.id === layerId);
  if (!layer || layer.type !== 'image') throw Error('Choose an image layer in this project');
  if (layer.asset === asset) return project;
  const previous = project.updatedAt;
  layer.asset = asset;
  const saved = await store.save(projectId, { scenes });
  if (saved.updatedAt === previous) throw Error('Project update time did not advance');
  const others = saved.scenes.filter(item => item.id !== sceneId);
  const beforeOthers = (project.scenes || []).filter(item => item.id !== sceneId);
  if (JSON.stringify(others) !== JSON.stringify(beforeOthers)) throw Error('Another scene was changed');
  return saved;
}
