import * as T from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

class CabinOcclusion extends GTAOPass {
  override render(renderer: T.WebGLRenderer, write: T.WebGLRenderTarget, read: T.WebGLRenderTarget) {
    const previousMask = this.camera.layers.mask;
    // Glass must not become an opaque depth surface and cast noisy occlusion over the view outside.
    this.camera.layers.set(2);
    try { super.render(renderer, write, read, 0, false); }
    finally { this.camera.layers.mask = previousMask; }
  }
}

/** Short-range occlusion gives controls, upholstery folds and panel joins depth. */
export class CabinRendering {
  private readonly composer: EffectComposer;
  private readonly beauty: RenderPass;
  private readonly occlusion: GTAOPass;
  private readonly output: OutputPass;

  constructor(renderer: T.WebGLRenderer, scene: T.Scene, camera: T.PerspectiveCamera) {
    const target = new T.WebGLRenderTarget(1, 1, {
      type: T.HalfFloatType, samples: Math.min(4, renderer.capabilities.maxSamples)
    });
    this.composer = new EffectComposer(renderer, target);
    this.beauty = new RenderPass(scene, camera);
    this.occlusion = new CabinOcclusion(scene, camera);
    this.occlusion.updateGtaoMaterial({ radius: .14, thickness: .12, samples: 8, distanceFallOff: .6 });
    this.occlusion.updatePdMaterial({ samples: 8, radius: 4 });
    this.occlusion.blendIntensity = .85;
    this.output = new OutputPass();
    this.composer.addPass(this.beauty);
    this.composer.addPass(this.occlusion);
    this.composer.addPass(this.output);
  }

  resize(width: number, height: number, pixelRatio: number) {
    const ratio = Math.min(pixelRatio, width < 600 ? 1 : 1.5);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(width, height);
    // Occlusion can be denoised at a lower resolution than the antialiased colour image.
    this.occlusion.setSize(Math.round(width * ratio * .65), Math.round(height * ratio * .65));
  }

  render(dt: number, moving = false) {
    // Restore contact detail on the final frame; avoid the extra geometry and denoise passes during travel.
    this.occlusion.enabled=!moving;
    this.composer.render(dt);
  }

  dispose() {
    this.beauty.dispose();
    this.occlusion.dispose();
    this.output.dispose();
    this.composer.dispose();
  }
}
