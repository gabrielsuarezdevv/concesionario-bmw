import * as T from 'three';
import { batchCarParts } from './batch-car-parts';

type Part = { group: T.Group; origin: T.Vector3; offset: T.Vector3; kind: string };

/** Black Snow's complete G87: one coordinate system for the body and its own cabin. */
export class M2Car {
  readonly group = new T.Group();
  readonly parts: Part[] = [];
  private paints: T.MeshStandardMaterial[] = [];
  private rims: T.MeshStandardMaterial[] = [];
  private seats: T.MeshStandardMaterial[] = [];

  constructor(source: T.Group, paintNormal: T.Texture, anisotropy: number) {
    // The source contains alternative transmissions. Retain its rear-drive assembly.
    source.traverse(node => {
      if (/transfercase_awd|driveshaft_RF_awd|halfshafts_F|diff_F_/.test(node.name)) node.visible = false;
    });
    source.rotation.y += Math.PI / 2;
    source.updateMatrixWorld(true);
    const meshes: T.Mesh[] = [];
    source.traverseVisible(node => { if (node instanceof T.Mesh) meshes.push(node); });
    const bounds = new T.Box3();
    for (const mesh of meshes) bounds.union(new T.Box3().setFromObject(mesh));
    const factor = 4.58 / bounds.getSize(new T.Vector3()).x;
    const center = bounds.getCenter(new T.Vector3());
    const normalize = new T.Matrix4().makeScale(factor, factor, factor)
      .multiply(new T.Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z));
    const cache = new Map<T.Material, T.MeshStandardMaterial>();
    const assemblies = new Map<string, Part>();
    for (const mesh of meshes) {
      let assembly = mesh.parent!;
      while (assembly.parent && !/^(m2g87undg_|rimslaw_)/.test(assembly.name)) assembly = assembly.parent;
      const name = assembly.name;
      const geometry = mesh.geometry.clone().applyMatrix4(new T.Matrix4().multiplyMatrices(normalize, mesh.matrixWorld));
      const originals = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const materials = originals.map(originalMaterial => {
        if (cache.has(originalMaterial)) return cache.get(originalMaterial)!;
        const original = originalMaterial as T.MeshStandardMaterial;
        let material = original.clone();
        const n = original.name;
        if (/_Paint$/.test(n)) {
          material = new T.MeshPhysicalMaterial({ color: '#2868b2', metalness: .6, roughness: .27,
            clearcoat: 1, clearcoatRoughness: .13, normalMap: paintNormal, normalScale: new T.Vector2(.018, .018) });
          this.paints.push(material);
        } else if (/_Wheel1A_(Rim|Shine)$/.test(n)) {
          material.metalness = .8; material.roughness = .28; this.rims.push(material);
        } else if (/_Interior_(?:Seat_Leather01|Leather01)$/.test(n)) {
          // Neutralize only the leather's base pigment; retain its authored grain and maps.
          // The source uses separate dark seat and cognac trim maps with different luminance.
          const gain = /_Seat_/.test(n) ? '28.0' : '5.0';
          material.onBeforeCompile = shader => {
            shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>',
              `#include <map_fragment>\n#ifdef USE_MAP\nfloat leatherDetail = clamp(dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)) * ${gain}, 0.55, 1.3);\ndiffuseColor.rgb = diffuse * leatherDetail;\n#endif`);
          };
          material.customProgramCacheKey = () => 'm2-leather-' + gain;
          material.metalness = 0; material.roughness = .65; this.seats.push(material);
        } else if (/_Glass(?:_Clear)?$|_glass_int$/.test(n)) {
          material = new T.MeshPhysicalMaterial({ color: '#e8eff7', metalness: 0, roughness: .04,
            transmission: 1, thickness: .005, ior: 1.5, side: T.DoubleSide, envMapIntensity: .4 });
        }
        for (const value of Object.values(material)) if (value instanceof T.Texture) value.anisotropy = anisotropy;
        cache.set(originalMaterial, material);
        return material;
      });
      let part = assemblies.get(name);
      if (!part) {
        const center = new T.Box3().setFromObject(assembly).getCenter(new T.Vector3()).applyMatrix4(normalize);
        const wheel = /rimslaw_|tire_|brakedisc|caliper/.test(name);
        const interior = /seat_|dash|doorpanel|body_int|sunvisor|intmirror/.test(name);
        const glass = /glass|windshield|backlight/.test(name);
        const side = Math.sign(center.z) || 1;
        const offset = wheel ? new T.Vector3(0, 0, side * .85)
          : /door_[LR]_/.test(name) || /doorpanel|doorglass/.test(name) ? new T.Vector3(0, .15, side * 1.1)
          : /hood_/.test(name) ? new T.Vector3(.3, 1.15, 0)
          : /trunk_/.test(name) ? new T.Vector3(-.3, .9, 0)
          : /roof_|windshield|backlight/.test(name) ? new T.Vector3(0, 1.55, 0)
          : /fender_|bumper_[FR]_a/.test(name) ? new T.Vector3(Math.sign(center.x) * .35, .2, side * .45)
          : interior ? new T.Vector3(0, .5, 0) : new T.Vector3();
        part = { group: new T.Group(), origin: new T.Vector3(), offset, kind: wheel ? 'wheels' : interior ? 'interior' : glass ? 'glass' : 'paint' };
        assemblies.set(name, part); this.parts.push(part); this.group.add(part.group);
      }
      const visual = new T.Mesh(geometry, Array.isArray(mesh.material) ? materials : materials[0]);
      const glass = materials.some(m => m.transparent || (m as T.MeshPhysicalMaterial).transmission > 0);
      visual.castShadow = !glass; visual.receiveShadow = true; visual.layers.enable(1);
      if (!glass) visual.layers.enable(2);
      part.group.add(visual);
    }
    batchCarParts(this.group, this.parts);
    source.traverse(node => { if (node instanceof T.Mesh) {
      node.geometry.dispose();
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.dispose();
    } });
  }

  update(paint: string, wheels: string, interior: string, exploded: boolean, activePart: string) {
    for (const material of this.paints) material.color.set(paint);
    for (const material of this.rims) material.color.set(wheels === 'forged' ? '#444e5a' : '#bdc5cd');
    for (const material of this.seats) material.color.set(interior);
    for (const [kind, materials] of [['paint', this.paints], ['wheels', this.rims], ['interior', this.seats]] as const) {
      for (const material of materials) {
        material.emissive.set(exploded && activePart === kind ? '#0066b1' : '#000000'); material.emissiveIntensity = .12;
      }
    }
  }
}
