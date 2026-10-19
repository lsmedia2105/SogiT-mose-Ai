/** Additive merge keeps results safe when an older autosave arrives after a job. */
export function applyGeneratedResults(project,entries=[]){
  const next=structuredClone(project),assets=new Map(next.assets.map(a=>[a.id,a]));
  for(const entry of entries){
    const {asset,targetType,targetId}=entry;assets.set(asset.id,{...assets.get(asset.id),...asset});
    if(targetType==='reference'){
      const ref=next.references.find(r=>r.id===targetId);
      if(ref){ref.imageAssetIds=[...new Set([...(ref.imageAssetIds||[]),asset.id])];if(!ref.assetId)ref.assetId=asset.id;}
    }else{
      const scene=next.scenes.find(s=>s.id===targetId);
      if(scene&&asset.type==='image'){scene.imageVersions=[...new Set([...(scene.imageVersions||[]),asset.id])];if(!scene.selectedImageAssetId)scene.selectedImageAssetId=asset.id;}
      else if(scene&&asset.type==='video'&&!scene.versions.some(v=>v.assetId===asset.id)){scene.versions.push({id:asset.id,assetId:asset.id,createdAt:asset.createdAt});if(scene.status!=='approved')scene.status='review';}
    }
  }
  next.assets=[...assets.values()];return next;
}
