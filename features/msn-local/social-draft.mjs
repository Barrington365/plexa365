export function socialDraft(b){
  const kind=['video','text','image'].includes(b.kind)?b.kind:'video';
  const width=b.width,height=b.height;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<64||height<64||width>3840||height>3840||width%2||height%2)throw Error('Choose a supported even canvas size');
  const title=typeof b.title==='string'&&b.title.trim()?b.title.trim().slice(0,100):(kind==='video'?'Untitled video':'Untitled post');
  const x=Math.min(width-1,Math.round(width*.08));
  const box=Math.max(1,width-x*2);
  const layers=kind==='image'?[{id:'post-image',type:'image',text:'',asset:'',x:0,y:0,width,height}]
    :kind==='text'?[
      {id:'headline',type:'text',text:'Your headline',asset:'',x,y:Math.min(height-1,Math.round(height*.18)),width:box,height:Math.max(1,Math.round(height*.24)),fontSize:Math.max(18,Math.min(120,Math.round(Math.min(width,height)/12))),color:'#ffffff'},
      {id:'body',type:'text',text:'Add the post copy',asset:'',x,y:Math.min(height-1,Math.round(height*.5)),width:box,height:Math.max(1,Math.round(height*.22)),fontSize:Math.max(16,Math.min(72,Math.round(Math.min(width,height)/22))),color:'#d7f7ff'},
    ]:[];
  const scene={id:'opening',duration:5,background:'#091726',layers};
  if(kind==='video'&&typeof b.videoAsset==='string'&&b.videoAsset)scene.video={asset:b.videoAsset,start:0};
  return {title,width,height,scenes:[scene],burnCaptions:kind==='video'};
}
