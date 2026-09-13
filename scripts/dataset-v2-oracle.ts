import { BoxGeometry, Color, LineCurve3, Mesh, MeshBasicMaterial, NoToneMapping, PerspectiveCamera, Scene, ShaderMaterial, TubeGeometry, Vector3, WebGLRenderer } from 'three';
import { VisibleTowlinePass } from '../../tugboat-safety_dataset/src/dataset/visibleMask';

/** Independent analytic oracle: a shader-deformed box occludes a magenta tube.
 * Compare every GT mask pixel against visible RGB support, including a uniform
 * update between captures. This would fail for a blanket material override. */
export async function maskOracle() {
  const gl=new WebGLRenderer({antialias:false});gl.setSize(192,128);gl.toneMapping=NoToneMapping;
  const camera=new PerspectiveCamera(50,192/128,.1,100);camera.position.set(0,0,8);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
  const scene=new Scene();scene.background=new Color(0);
  const rope=new Mesh(new TubeGeometry(new LineCurve3(new Vector3(-3,0,-1),new Vector3(3,0,-1)),64,.12,8,false),new MeshBasicMaterial({color:0xff00ff}));
  const material=new ShaderMaterial({uniforms:{offset:{value:0}},vertexShader:'uniform float offset; void main(){ vec3 p=position; p.x+=offset; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.); }',fragmentShader:'void main(){gl_FragColor=vec4(0.,0.,0.,1.);}'});
  const box=new Mesh(new BoxGeometry(1.4,3,1),material);scene.add(rope,box);scene.updateMatrixWorld(true);
  const pass=new VisibleTowlinePass(),original=rope.material,results=[];
  const decode=async(url:string)=>{const image=new Image();image.src=url;await image.decode();const c=document.createElement('canvas');c.width=192;c.height=128;const ctx=c.getContext('2d')!;ctx.drawImage(image,0,0);return ctx.getImageData(0,0,192,128).data;};
  let previous:Uint8Array|undefined,changedPixels=0;
  try {
    for(const offset of [0,1.5]) {
      material.uniforms.offset.value=offset;
      const f=pass.capture(gl,scene,camera,rope,192,128),rgb=await decode(f.rgb);
      let mismatch=0,white=0;
      for(let i=0;i<f.maskPixels.length;i++){
        const visible=rgb[i*4]>=128&&rgb[i*4+2]>=128&&rgb[i*4+1]<20;
        if(visible!==(f.maskPixels[i]===255))mismatch++;if(f.maskPixels[i]===255)white++;
        if(previous&&previous[i]!==f.maskPixels[i])changedPixels++;
      }
      results.push({offset,mismatch,white});previous=f.maskPixels;
    }
    return {results,changedPixels,stateRestored:rope.material===original&&box.material===material&&gl.getRenderTarget()===null&&gl.toneMapping===NoToneMapping};
  } finally {pass.dispose();gl.dispose();rope.geometry.dispose();original.dispose();box.geometry.dispose();material.dispose();}
}
