/* Small, self-contained WebGL scene. No CDN, model downloads or tracking. */
(() => {
  'use strict';
  const canvas = document.getElementById('glass-canvas');
  if (!canvas) return;
  const gl = canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false,powerPreference:'low-power'});
  if (!gl) return; // CSS glass cube remains visible as the fallback.
  const vertex = `
    attribute vec3 aPosition; attribute vec3 aNormal;
    uniform mat4 uModel; uniform mat4 uProjection; uniform mat4 uView;
    varying vec3 vNormal; varying vec3 vWorld;
    void main(){vec4 p=uModel*vec4(aPosition,1.0);vWorld=p.xyz;vNormal=mat3(uModel)*aNormal;gl_Position=uProjection*uView*p;}
  `;
  const fragment = `
    precision mediump float;
    uniform vec3 uColor; uniform float uOpacity; uniform float uMaterial;
    varying vec3 vNormal; varying vec3 vWorld;
    void main(){
      vec3 n=normalize(vNormal);if(!gl_FrontFacing)n=-n;
      vec3 view=normalize(vec3(0.0,0.0,5.4)-vWorld);
      float fresnel=pow(1.0-abs(dot(n,view)),2.8);
      vec3 r=reflect(-view,n);
      float window1=pow(max(0.0,1.0-abs(r.x*0.78+r.y*0.4-0.43)*4.4),13.0);
      float window2=pow(max(0.0,1.0-abs(r.x*0.9-r.y*0.2+0.56)*3.8),10.0);
      float shade=0.38+0.4*smoothstep(-0.3,0.9,r.y);
      float dark=pow(max(0.0,1.0-abs(r.x*0.72-r.z*0.2+0.2)*3.6),4.0);
      vec3 env=vec3(shade)-vec3(0.34)*dark+vec3(window1*0.95+window2*0.52);
      float diffuse=max(dot(n,normalize(vec3(-0.6,1.0,1.0))),0.0);
      float spec=pow(max(dot(reflect(-normalize(vec3(-0.7,1.0,1.7)),n),view),0.0),48.0);
      vec3 rose=vec3(1.0,0.47,0.68)*pow(max(0.0,dot(n,normalize(vec3(0.8,-0.9,0.5)))),3.0);
      vec3 color=mix(vec3(0.84,0.84,0.83),env,0.53+fresnel*0.4)+rose*0.3+spec*0.65;
      float alpha=(0.2+fresnel*0.52+window1*0.3+dark*0.25)*uOpacity;
      if(uMaterial>0.5){color=uColor*(0.5+diffuse*0.42)+env*0.28+spec*0.8;alpha=uOpacity;}
      gl_FragColor=vec4(clamp(color,0.0,1.0),clamp(alpha,0.0,1.0));
    }
  `;
  function shader(type,source) { const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s; }
  let program;
  try {program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Glass program could not link');} catch {return;}
  gl.useProgram(program);
  const loc={};for(const key of ['uModel','uProjection','uView','uColor','uOpacity','uMaterial'])loc[key]=gl.getUniformLocation(program,key);
  const pLoc=gl.getAttribLocation(program,'aPosition'),nLoc=gl.getAttribLocation(program,'aNormal');
  function mesh(vertices,normals){const p=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,p);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);const n=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,n);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(normals),gl.STATIC_DRAW);return {p,n,count:vertices.length/3};}
  function torus(radius,tube,radial=72,tubular=24){
    const v=[],n=[];const point=(i,j)=>{const a=i/radial*Math.PI*2,b=j/tubular*Math.PI*2;return {p:[(radius+tube*Math.cos(b))*Math.cos(a),(radius+tube*Math.cos(b))*Math.sin(a),tube*Math.sin(b)],n:[Math.cos(b)*Math.cos(a),Math.cos(b)*Math.sin(a),Math.sin(b)]};};
    for(let i=0;i<radial;i++)for(let j=0;j<tubular;j++){const q=[point(i,j),point(i+1,j),point(i+1,j+1),point(i,j+1)];for(const k of [0,1,2,0,2,3]){v.push(...q[k].p);n.push(...q[k].n);}}
    return mesh(v,n);
  }
  function roundedBox(size,radius,steps=7){
    const v=[],n=[],half=size.map(x=>x/2);const faces=[[0,1,2,1],[0,2,1,-1],[1,2,0,1],[1,0,2,-1],[2,0,1,1],[2,1,0,-1]];
    const point=(face,i,j)=>{const [axis,a,b,sign]=face;const p=[0,0,0];p[axis]=half[axis]*sign;p[a]=(i/steps*2-1)*half[a];p[b]=(j/steps*2-1)*half[b];const c=p.map((x,k)=>Math.max(-half[k]+radius,Math.min(half[k]-radius,x)));let d=p.map((x,k)=>x-c[k]);const len=Math.hypot(...d);d=d.map(x=>x/len);return {p:c.map((x,k)=>x+d[k]*radius),n:d};};
    for(const f of faces)for(let i=0;i<steps;i++)for(let j=0;j<steps;j++){const q=[point(f,i,j),point(f,i+1,j),point(f,i+1,j+1),point(f,i,j+1)];for(const k of [0,1,2,0,2,3]){v.push(...q[k].p);n.push(...q[k].n);}}
    return mesh(v,n);
  }
  const meshes={torus:torus(.94,.34),inner:torus(.79,.045),orb:torus(.55,.32),barX:roundedBox([2.34,.35,.35],.105),barY:roundedBox([.35,2.34,.35],.105),barZ:roundedBox([.35,.35,2.34],.105),plate:roundedBox([1.9,1.9,.25],.11),smallBox:roundedBox([.75,.75,.75],.14),core:roundedBox([.95,.95,.17],.075)};
  const I=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  function multiply(a,b){const m=Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)m[c*4+r]+=a[k*4+r]*b[c*4+k];return m;}
  function transform(x,y,z,rx,ry,rz,scale=1){const cx=Math.cos(rx),sx=Math.sin(rx),cy=Math.cos(ry),sy=Math.sin(ry),cz=Math.cos(rz),sz=Math.sin(rz);const tx=I();tx[12]=x;tx[13]=y;tx[14]=z;const X=[1,0,0,0,0,cx,sx,0,0,-sx,cx,0,0,0,0,1],Y=[cy,0,-sy,0,0,1,0,0,sy,0,cy,0,0,0,0,1],Z=[cz,sz,0,0,-sz,cz,0,0,0,0,1,0,0,0,0,1];const S=I();S[0]=S[5]=S[10]=scale;return multiply(multiply(multiply(multiply(tx,Z),Y),X),S);}
  function bind(m){gl.bindBuffer(gl.ARRAY_BUFFER,m.p);gl.enableVertexAttribArray(pLoc);gl.vertexAttribPointer(pLoc,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,m.n);gl.enableVertexAttribArray(nLoc);gl.vertexAttribPointer(nLoc,3,gl.FLOAT,false,0,0);}
  function draw(m,model,opacity=1,color=[1,.43,.65],material=0){bind(m);gl.uniformMatrix4fv(loc.uModel,false,new Float32Array(model));gl.uniform3fv(loc.uColor,new Float32Array(color));gl.uniform1f(loc.uOpacity,opacity);gl.uniform1f(loc.uMaterial,material);gl.drawArrays(gl.TRIANGLES,0,m.count);}
  const view=I();view[14]=-5.4;gl.uniformMatrix4fv(loc.uView,false,new Float32Array(view));
  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.clearColor(0,0,0,0);
  let progress=0,width=0,height=0,pointerX=0,pointerY=0,frame=null,visible=true,contextLost=false;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  window.OpenCallGlass={setProgress(value){progress=value;if(frame===null&&visible&&!contextLost)frame=requestAnimationFrame(render);}};
  const objectParts=[];
  function addCube(base,alpha){for(const y of [-1,1])for(const z of [-1,1])objectParts.push([meshes.barX,multiply(base,transform(0,y,z,0,0,0)),alpha]);for(const x of [-1,1])for(const z of [-1,1])objectParts.push([meshes.barY,multiply(base,transform(x,0,z,0,0,0)),alpha]);for(const x of [-1,1])for(const y of [-1,1])objectParts.push([meshes.barZ,multiply(base,transform(x,y,0,0,0,0)),alpha]);}
  function resize(){const r=canvas.getBoundingClientRect();const dpr=Math.min(devicePixelRatio||1,1.5);const w=Math.floor(r.width*dpr),h=Math.floor(r.height*dpr);if(w!==width||h!==height){width=canvas.width=w;height=canvas.height=h;gl.viewport(0,0,w,h);const f=1/Math.tan(Math.PI/8),a=w/Math.max(1,h),near=.1,far=30;gl.uniformMatrix4fv(loc.uProjection,false,new Float32Array([f/a,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]));}}
  function render(time){
    frame=null;if(!visible||document.hidden||contextLost)return;
    resize();gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    const t=reduced.matches ? 0 : time*.00024;
    const position=progress*3.999,scene=Math.min(3,Math.floor(position)),phase=position-scene;
    const boundary=scene===3?Math.min(1,phase/.15):scene===0?Math.min(1,(1-phase)/.17):Math.min(1,phase/.15,(1-phase)/.17);
    const alpha=.45+.55*boundary;
    const scale=(innerWidth<700?.77:.91)*(.83+.17*boundary);
    const x=.05+Math.sin(t*.7)*.05+(1-boundary)*.3;
    const y=.08+Math.sin(t)*.07;
    const base=transform(x,y,0,.43+progress*2.8+pointerY,-.54+progress*5.7+pointerX,-.22+Math.sin(t*.4)*.06,scale);
    objectParts.length=0;
    if(scene===0){addCube(base,alpha);objectParts.push([meshes.core,multiply(base,transform(0,0,0,0,0,.14)),.8,[1,.46,.66],1]);objectParts.push([meshes.inner,multiply(base,transform(0,0,.26,0,0,0)),1,[.14,.14,.14],1]);}
    else if(scene===1){objectParts.push([meshes.torus,base,alpha]);objectParts.push([meshes.inner,multiply(base,transform(0,0,0,0,0,0,1.44)),.8,[1,.38,.59],1]);objectParts.push([meshes.torus,multiply(base,transform(0,0,-.32,0,0,0,.94)),alpha*.7]);}
    else if(scene===2){for(let j=-2;j<=2;j++)objectParts.push([meshes.plate,multiply(base,transform(0,0,j*.39,0,0,j*.095)),alpha*.8]);objectParts.push([meshes.core,multiply(base,transform(0,0,1.02,0,0,.1,.84)),.84,[1,.4,.61],1]);}
    else{for(let j=-1;j<=1;j++)objectParts.push([meshes.torus,multiply(base,transform(0,j*.6,0,Math.PI/2,0,j*.16,.87)),alpha*.72]);objectParts.push([meshes.inner,multiply(base,transform(0,0,0,Math.PI/2,0,0,1.4)),.8,[1,.4,.61],1]);}
    objectParts.push([meshes.smallBox,transform(1.78,1.61,-.4,.5+t*.25,.5+progress*3,.3,.74),.8]);
    objectParts.push([meshes.orb,transform(-1.47,-1.1,-1,.4,.8+progress*2,-.3,.36),.7]);
    // Opaque colored details establish depth before transparent acrylic surfaces.
    gl.depthMask(true);gl.cullFace(gl.BACK);for(const part of objectParts.filter(x=>x[4]))draw(...part);
    gl.depthMask(false);const glass=objectParts.filter(x=>!x[4]);gl.cullFace(gl.FRONT);for(const part of glass)draw(...part);gl.cullFace(gl.BACK);for(const part of glass)draw(...part);gl.depthMask(true);
    canvas.parentElement.classList.add('ready');
    if(!reduced.matches)frame=requestAnimationFrame(render);
  }
  if('IntersectionObserver' in window)new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible&&frame===null&&!contextLost)frame=requestAnimationFrame(render);else if(!visible&&frame!==null){cancelAnimationFrame(frame);frame=null;}},{rootMargin:'100px'}).observe(canvas);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&frame!==null){cancelAnimationFrame(frame);frame=null;}else if(visible&&frame===null&&!contextLost)frame=requestAnimationFrame(render);});
  window.addEventListener('pointermove',e=>{if(reduced.matches||e.pointerType==='touch')return;pointerX=(e.clientX/innerWidth-.5)*.13;pointerY=(e.clientY/innerHeight-.5)*.08;},{passive:true});
  window.addEventListener('resize',()=>{if(frame===null&&visible&&!contextLost)frame=requestAnimationFrame(render);});
  reduced.addEventListener('change',()=>{if(frame===null&&visible&&!contextLost)frame=requestAnimationFrame(render);});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;canvas.parentElement.classList.remove('ready');if(frame!==null){cancelAnimationFrame(frame);frame=null;}});
  frame=requestAnimationFrame(render);
})();
