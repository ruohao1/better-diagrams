export async function exportPng(source:string):Promise<Blob> {
  const parsed=new DOMParser().parseFromString(source,'image/svg+xml'),svg=parsed.documentElement;
  if(parsed.querySelector('parsererror') || svg.localName!=='svg' || svg.namespaceURI!=='http://www.w3.org/2000/svg')throw new Error('Invalid SVG for PNG export');
  const bounds=svg.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if(!bounds || bounds.length!==4 || !bounds.every(Number.isFinite) || bounds[2]<=0 || bounds[3]<=0)throw new Error('PNG export needs finite positive diagram bounds');
  const maxPixels=16*1024*1024,maxEdge=8192,scale=Math.min(2,maxEdge/bounds[2],maxEdge/bounds[3]);
  const scaledWidth=bounds[2]*scale,scaledHeight=bounds[3]*scale,areaScale=Math.min(1,Math.sqrt(maxPixels/(scaledWidth*scaledHeight)));
  const width=Math.max(1,Math.floor(scaledWidth*areaScale)),height=Math.max(1,Math.floor(scaledHeight*areaScale));
  if(!Number.isFinite(width+height) || width>maxEdge || height>maxEdge || width*height>maxPixels)throw new Error('PNG export dimensions exceed the image limit');
  svg.setAttribute('width',String(width));svg.setAttribute('height',String(height));
  const image=new Image();let canvas:HTMLCanvasElement|undefined;
  try {
    image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(svg));
    await image.decode();
    canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const context=canvas.getContext('2d');if(!context)throw new Error('Unable to create a canvas for PNG export');
    context.drawImage(image,0,0);
    return await new Promise<Blob>((resolve,reject)=>canvas!.toBlob(blob=>blob?resolve(blob):reject(new Error('Unable to encode PNG image')),'image/png'));
  } finally {
    image.removeAttribute('src');if(canvas){canvas.width=0;canvas.height=0;}
  }
}
