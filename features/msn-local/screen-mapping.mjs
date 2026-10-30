/** Projective mapping shared by preview and export. Corners: TL, TR, BR, BL. */
export function screenMatrix(points){
 const src=[[0,0],[1,0],[1,1],[0,1]],a=[];
 for(let i=0;i<4;i++){const [x,y]=src[i],[u,v]=points[i];a.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]);}
 for(let i=0;i<8;i++){let k=i;for(let j=i+1;j<8;j++)if(Math.abs(a[j][i])>Math.abs(a[k][i]))k=j;[a[i],a[k]]=[a[k],a[i]];const p=a[i][i];if(Math.abs(p)<1e-9)throw Error('Screen corners must form a non-degenerate quadrilateral');for(let c=i;c<9;c++)a[i][c]/=p;for(let r=0;r<8;r++)if(r!==i){const f=a[r][i];for(let c=i;c<9;c++)a[r][c]-=f*a[i][c];}}
 return [...a.map(r=>r[8]),1];
}
export function inverseMatrix(m){const [a,b,c,d,e,f,g,h,i]=m,adj=[e*i-f*h,c*h-b*i,b*f-c*e,f*g-d*i,a*i-c*g,c*d-a*f,d*h-e*g,b*g-a*h,a*e-b*d],det=a*adj[0]+b*adj[3]+c*adj[6];if(Math.abs(det)<1e-9)throw Error('Invalid screen mapping');return adj.map(v=>v/det);}
export function mapPoint(m,x,y){const z=m[6]*x+m[7]*y+m[8];return [(m[0]*x+m[1]*y+m[2])/z,(m[3]*x+m[4]*y+m[5])/z];}
export function cssScreenTransform(points,width,height){const [a,b,c,d,e,f,g,h]=screenMatrix(points);return `matrix3d(${a},${d*height/width},0,${g/width},${b*width/height},${e},0,${h/height},0,0,1,0,${c*width},${f*height},0,1)`;}
export function warpRgba(data,width,height,points){const inv=inverseMatrix(screenMatrix(points)),out=Buffer.alloc(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const [u,v]=mapPoint(inv,x/(width-1),y/(height-1));if(u<0||u>1||v<0||v>1)continue;const sx=u*(width-1),sy=v*(height-1),x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(x0+1,width-1),y1=Math.min(y0+1,height-1),dx=sx-x0,dy=sy-y0;for(let c=0;c<4;c++)out[(y*width+x)*4+c]=Math.round(data[(y0*width+x0)*4+c]*(1-dx)*(1-dy)+data[(y0*width+x1)*4+c]*dx*(1-dy)+data[(y1*width+x0)*4+c]*(1-dx)*dy+data[(y1*width+x1)*4+c]*dx*dy);}return out;}
