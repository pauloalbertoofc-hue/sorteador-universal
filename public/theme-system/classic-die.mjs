// Self-contained WebGL hero: rounded solid die, soft lighting and recessed pips.
// No network dependency; the existing SVG remains the fallback.
export function mountClassicDie(host){
 const canvas=document.createElement('canvas');
 const gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false});
 if(!gl||!gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT)?.precision)return;
 const vertex='attribute vec2 p; void main(){gl_Position=vec4(p,0.,1.);}';
 const fragment=`#ifdef GL_FRAGMENT_PRECISION_HIGH
 precision highp float;
 #else
 precision mediump float;
 #endif
 uniform vec2 resolution, tilt;
 uniform float time;
 mat2 rot(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
 vec3 local(vec3 p){p.y-=.07*sin(time);p.xz=rot(.65+tilt.x)*p.xz;p.yz=rot(.42+tilt.y)*p.yz;return p;}
 float box(vec3 p){vec3 q=abs(p)-vec3(.69);return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.)-.13;}
 float pip(vec2 p,vec2 c){return length(p-c)-.104;}
 float face(vec2 p,float n){
 float d=10.;
 if(n==1.||n==3.||n==5.)d=pip(p,vec2(0.));
 if(n>=2.)d=min(d,min(pip(p,vec2(-.37,-.37)),pip(p,vec2(.37,.37))));
 if(n>=4.)d=min(d,min(pip(p,vec2(-.37,.37)),pip(p,vec2(.37,-.37))));
 if(n==6.)d=min(d,min(pip(p,vec2(-.37,0.)),pip(p,vec2(.37,0.))));
 return d;
 }
 float holes(vec3 p){
 float a=max(face(p.xz,p.y>0.?5.:2.),abs(abs(p.y)-.82)-.05);
 float b=max(face(p.xy,p.z>0.?3.:4.),abs(abs(p.z)-.82)-.05);
 float c=max(face(p.zy,p.x>0.?1.:6.),abs(abs(p.x)-.82)-.05);
 return min(a,min(b,c));
 }
 float scene(vec3 p){p=local(p);return max(box(p),-holes(p));}
 void main(){
 vec2 uv=(gl_FragCoord.xy-.5*resolution)/resolution.y;
 vec3 ro=vec3(uv*2.65,4.),rd=vec3(0.,0.,-1.);
 float t=0.;bool hit=false;
 for(int i=0;i<72;i++){float d=scene(ro+rd*t);if(d<.002){hit=true;break;}t+=max(d,.002);if(t>7.)break;}
 if(!hit){float sh=.20*exp(-10.*uv.x*uv.x-100.*(uv.y+.33)*(uv.y+.33));gl_FragColor=vec4(.12,.31,.59,sh);return;}
 vec3 p=ro+rd*t;vec2 e=vec2(.004,0.);
 vec3 n=normalize(vec3(scene(p+e.xyy)-scene(p-e.xyy),scene(p+e.yxy)-scene(p-e.yxy),scene(p+e.yyx)-scene(p-e.yyx)));
 vec3 l=normalize(vec3(-.5,.8,.9));float diff=max(dot(n,l),0.);
 float spec=pow(max(dot(n,normalize(l-rd)),0.),30.);
 vec3 q=local(p);vec3 a=abs(q);float d;
 if(a.x>=a.y&&a.x>=a.z)d=face(q.zy,q.x>0.?1.:6.);
 else if(a.y>=a.z)d=face(q.xz,q.y>0.?5.:2.);
 else d=face(q.xy,q.z>0.?3.:4.);
 float ink=1.-smoothstep(-.012,.012,d);
 vec3 color=mix(vec3(.96,.98,1.),vec3(.035,.19,.48),ink);
 float sky=.5+.5*n.y;
 float rim=pow(1.-max(0.,dot(n,-rd)),3.);
 float fill=max(0.,dot(n,normalize(vec3(.8,.15,.5))));
 vec3 ambient=mix(vec3(.32,.39,.53),vec3(.62,.67,.75),sky);
 vec3 lit=color*(ambient+.30*diff+.12*fill);
 lit+=vec3(.12,.16,.22)*rim*(1.-ink);
 lit+=vec3(.19)*spec*(1.-ink);
 gl_FragColor=vec4(clamp(lit,0.,1.),1.);
 }`;
 const shader=(type,source)=>{const sh=gl.createShader(type);gl.shaderSource(sh,source);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)){gl.deleteShader(sh);throw Error('hero shader');}return sh;};
 try{
 const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))return;
 gl.useProgram(program);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);const attr=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(attr);gl.vertexAttribPointer(attr,2,gl.FLOAT,false,0,0);
 const res=gl.getUniformLocation(program,'resolution'),tilt=gl.getUniformLocation(program,'tilt'),clock=gl.getUniformLocation(program,'time');
 let x=0,y=0,vx=0,vy=0,last=0,tx=0,ty=0,visible=false,raf=0,lost=false,validated=false;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 canvas.className='su-die-webgl';canvas.style.cssText='width:100%;height:100%;display:block;position:absolute;inset:0;pointer-events:none';
 host.style.position='relative';host.append(canvas);
 const fallback=host.querySelector('svg');
 function draw(now){
 raf=0;if(lost||!visible||document.hidden||document.body.dataset.suTheme!=='classic')return;
 const r=host.getBoundingClientRect();if(!r.width||!r.height)return;
 const scale=Math.min(devicePixelRatio||1,1.25,640/r.width);const w=Math.max(1,Math.round(r.width*scale)),h=Math.max(1,Math.round(r.height*scale));
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
 const dt=Math.min(.033,Math.max(.001,last?(now-last)/1000:1/60));last=now;
 vx+=(tx-x)*65*dt;vy+=(ty-y)*65*dt;
 const damping=Math.exp(-12*dt);vx*=damping;vy*=damping;x+=vx*dt;y+=vy*dt;
 gl.viewport(0,0,w,h);gl.uniform2f(res,w,h);gl.uniform2f(tilt,reduced.matches?0:x,reduced.matches?0:y);gl.uniform1f(clock,reduced.matches?0:now*.001);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
 if(!validated){
 const pixels=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
 let solid=0,blue=0,light=0;
 for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]<240)continue;solid++;if(pixels[i+2]>pixels[i]+35&&pixels[i]<110)blue++;if(pixels[i]>125&&pixels[i+1]>125)light++;}
 if(!solid||blue/solid<.012||light/solid<.25){lost=true;canvas.remove();host.dataset.suDieRender='fallback';return;}
 validated=true;host.dataset.suDieRender='validated';
 }
 if(fallback)fallback.style.opacity='0';if(!reduced.matches)raf=requestAnimationFrame(draw);
 }
 const start=()=>{if(!raf&&!lost)raf=requestAnimationFrame(draw);};
 host.addEventListener('pointermove',e=>{const r=host.getBoundingClientRect();tx=(e.clientX-r.left-r.width/2)/r.width*.85;ty=(e.clientY-r.top-r.height/2)/r.height*.65;start();});
 host.style.touchAction='pan-y';
 let touchStart=null;
 host.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')touchStart={x:e.clientX,y:e.clientY};});
 host.addEventListener('pointermove',e=>{if(e.pointerType==='touch'&&touchStart){tx=Math.max(-1.2,Math.min(1.2,(e.clientX-touchStart.x)/90));ty=0;start();}});
 const release=()=>{touchStart=null;tx=ty=0;start();};
 host.addEventListener('pointerup',release);host.addEventListener('pointercancel',release);
 host.addEventListener('pointerleave',release);
 new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)start();}).observe(host);
 new ResizeObserver(start).observe(host);new MutationObserver(start).observe(document.body,{attributes:true,attributeFilter:['data-su-theme']});document.addEventListener('visibilitychange',start);reduced.addEventListener('change',start);
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;canvas.remove();if(fallback)fallback.style.opacity='';});
 }catch{canvas.remove();}
}
