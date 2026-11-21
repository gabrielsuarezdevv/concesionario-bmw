import * as T from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { HorizontalBlurShader } from 'three/addons/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/addons/shaders/VerticalBlurShader.js';
import type { ViewerEnvironment } from './viewer-environment-options';

/** Local HDR light cards: long reflections reveal the curvature of the bodywork. */
export function createStudioEnvironment(renderer: T.WebGLRenderer, environment:ViewerEnvironment='studio'): T.WebGLRenderTarget {
  const studio = new T.Scene();
  studio.background = new T.Color(environment==='day'?'#9aaeba':environment==='night'?'#060e1d':'#30343b');
  const panelGeometry = new T.PlaneGeometry();
  const materials: T.MeshBasicMaterial[] = [];
  const panel = (position: number[], size: number[], intensity: number, color = '#ffffff') => {
    const material = new T.MeshBasicMaterial({ color: new T.Color(color).multiplyScalar(intensity), side: T.DoubleSide, toneMapped: false });
    materials.push(material);
    const mesh = new T.Mesh(panelGeometry, material);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.scale.set(size[0], size[1], 1);
    mesh.lookAt(0, 0, 0);
    studio.add(mesh);
  };
  if(environment==='day') {
    panel([-3,6,4],[3,3],7,'#fff2d9');panel([0,5,0],[10,8],2.4,'#dcefff');
    panel([3,2,-4],[7,3],1.1,'#dceaff');panel([-5,1,2],[5,2],.65,'#b8cbd9');
  } else if(environment==='night') {
    panel([0,5,1],[7,.7],3.8,'#dcecff');panel([-3,3,-4],[6,.4],4,'#41adff');
    panel([1,2,5],[5,1.2],1.6,'#b0cbef');panel([5,1.5,-1],[1.5,3],1.6,'#e8f0ff');
  } else {
    panel([0, 5, 1], [7, 1.4], 5);
    panel([-3, 3, -4], [6, .65], 6);
    panel([1, 2, 5], [6, 2.5], 2.5);
    panel([5, 1.5, -1], [2, 3], 3);
    panel([-5, 1, 2], [2, 2], 1.5, '#d6e5ff');
  }
  const generator = new T.PMREMGenerator(renderer);
  const target = generator.fromScene(studio, .012, .1, 30, { size: environment==='studio'?512:256 });
  generator.dispose();
  panelGeometry.dispose();
  materials.forEach(material => material.dispose());
  return target;
}

/** Soft contact occlusion, projected from the actual underside of the vehicle. */
export class ContactShadow {
  readonly mesh: T.Mesh<T.PlaneGeometry, T.MeshBasicMaterial>;
  private readonly depth = new T.MeshDepthMaterial({ depthPacking: T.BasicDepthPacking, side: T.DoubleSide });
  private readonly target = new T.WebGLRenderTarget(512, 512);
  private readonly temporary = new T.WebGLRenderTarget(512, 512);
  private readonly camera = new T.OrthographicCamera(-3.5, 3.5, 2.25, -2.25, .01, 2.8);
  private readonly horizontal = new T.ShaderMaterial({ ...HorizontalBlurShader, uniforms: T.UniformsUtils.clone(HorizontalBlurShader.uniforms) });
  private readonly vertical = new T.ShaderMaterial({ ...VerticalBlurShader, uniforms: T.UniformsUtils.clone(VerticalBlurShader.uniforms) });
  private readonly quad = new FullScreenQuad(this.horizontal);

  constructor() {
    this.depth.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace(
        'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
        'gl_FragColor = vec4(0.0, 0.0, 0.0, pow(1.0 - fragCoordZ, 3.0));'
      );
    };
    this.camera.position.set(0, -.05, 0);
    this.camera.up.set(0, 0, 1);
    this.camera.lookAt(0, 1, 0);
    this.camera.layers.set(1);
    this.mesh = new T.Mesh(new T.PlaneGeometry(7, 4.5), new T.MeshBasicMaterial({
      map: this.target.texture, transparent: true, opacity: .85,
      depthWrite: false, side: T.DoubleSide, toneMapped: false
    }));
    this.mesh.rotation.x = Math.PI / 2;
    this.mesh.position.y = .012;
    this.mesh.renderOrder = 1;
    this.horizontal.uniforms['h'].value = 2 / 512;
    this.vertical.uniforms['v'].value = 2 / 512;
  }

  update(renderer: T.WebGLRenderer, scene: T.Scene) {
    const target = renderer.getRenderTarget();
    const background = scene.background;
    const override = scene.overrideMaterial;
    const clearColor = renderer.getClearColor(new T.Color());
    const clearAlpha = renderer.getClearAlpha();
    const shadows = renderer.shadowMap.enabled;
    try {
      renderer.shadowMap.enabled = false;
      renderer.setClearColor(0x000000, 0);
      scene.background = null;
      scene.overrideMaterial = this.depth;
      renderer.setRenderTarget(this.target);
      renderer.clear();
      renderer.render(scene, this.camera);
      this.horizontal.uniforms['tDiffuse'].value = this.target.texture;
      this.quad.material = this.horizontal;
      renderer.setRenderTarget(this.temporary);
      this.quad.render(renderer);
      this.vertical.uniforms['tDiffuse'].value = this.temporary.texture;
      this.quad.material = this.vertical;
      renderer.setRenderTarget(this.target);
      this.quad.render(renderer);
    } finally {
      scene.overrideMaterial = override;
      scene.background = background;
      renderer.setClearColor(clearColor, clearAlpha);
      renderer.setRenderTarget(target);
      renderer.shadowMap.enabled = shadows;
    }
  }

  dispose() {
    this.target.dispose(); this.temporary.dispose(); this.depth.dispose();
    this.horizontal.dispose(); this.vertical.dispose(); this.quad.dispose();
    this.mesh.geometry.dispose(); this.mesh.material.dispose();
  }
}
