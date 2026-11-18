import * as T from 'three';
import { CabinMaterials } from './cabin-materials';
import { e46Gauges, projectE46Artwork } from './e46-details';

type Part = { group: T.Group; origin: T.Vector3; offset: T.Vector3; kind: string };

/** Complete Merc_TV E46 sedan. Body and cabin share a single source and transform. */
export class E46Car {
  readonly group = new T.Group();
  readonly parts: Part[] = [];
  readonly paints: T.MeshStandardMaterial[] = [];
  readonly rims: T.MeshStandardMaterial[] = [];
  readonly seats: T.MeshStandardMaterial[] = [];
  private readonly wheelVariants: { group: T.Group; finish: string }[] = [];

  constructor(source: T.Group, cabin: CabinMaterials, paintNormal: T.Texture, anisotropy: number) {
    // Alternative bumpers, roofs and wheels must not overlap.
    source.traverse(node => {
      const n = node.name;
      if (/^badge_/.test(n)) node.visible = n === 'badge_330i';
      else if (/^front_bumper_/.test(n)) node.visible = /^front_bumper_zhp(?:_trim)?$/.test(n);
      else if (/^rear_bumper_/.test(n)) node.visible = n === 'rear_bumper_mtech2';
      else if (/^(left|right)_mirror_/.test(n)) node.visible = n.endsWith('_stock');
      else if (/^rim_/.test(n)) node.visible = /^rim_(style_135|bbs_chr)_/.test(n);
      else if (/^spoiler_/.test(n) || n === 'roof_sun' || n === 'front_lip' || /_m_side_vent$/.test(n)) node.visible = false;
    });
    source.rotation.y += Math.PI / 2;
    source.updateMatrixWorld(true);
    const meshes: T.Mesh[] = [];
    source.traverseVisible(node => { if (node instanceof T.Mesh) meshes.push(node); });
    const bounds = new T.Box3();
    for (const mesh of meshes) bounds.union(new T.Box3().setFromObject(mesh));
    const factor = 4.471 / bounds.getSize(new T.Vector3()).x;
    const center = bounds.getCenter(new T.Vector3());
    const normalize = new T.Matrix4().makeScale(factor, factor, factor)
      .multiply(new T.Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z));
    const cache = new Map<string, T.MeshStandardMaterial>();
    const dials = e46Gauges();
    const badge = new T.TextureLoader().load('/brand/bmw-logo.svg'); badge.colorSpace = T.SRGBColorSpace;

    for (const mesh of meshes) {
      let assembly = '';
      for (let node: T.Object3D | null = mesh; node && node !== source; node = node.parent) assembly += ' ' + node.name;
      const wheel = /(?:rim_|tire_)(?:style_135_|bbs_chr_)?(?:front|rear)_(?:left|right)/.test(assembly);
      const seat = /(?:front_left_seat|front_right_seat|rear_seat)/.test(assembly);
      const interior = seat || /(?: dash | _8 |inner_trim|door_trim|left_trim|right_trim)/.test(assembly);
      let geometry = mesh.geometry.clone().applyMatrix4(new T.Matrix4().multiplyMatrices(normalize, mesh.matrixWorld));
      let needsDetail = false;
      const originals = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const materials = originals.map(originalMaterial => {
        const original = originalMaterial as T.MeshStandardMaterial;
        const n = original.name.toLowerCase();
        const key = original.uuid + ':' + seat;
        let material = cache.get(key);
        const leather = /seats_f|seat_r|panels|dash/.test(n);
        needsDetail ||= leather;
        if (material) return material;
        material = original.clone();
        if (/^e46racing_body(?:_2)?$/.test(n)) {
          material = new T.MeshPhysicalMaterial({ color: '#2868b2', metalness: .55, roughness: .28,
            clearcoat: 1, clearcoatRoughness: .13, normalMap: paintNormal, normalScale: new T.Vector2(.018, .018) });
          this.paints.push(material);
        } else if (/glass/.test(n)) {
          material = new T.MeshPhysicalMaterial({ color: '#edf3f8', metalness: 0, roughness: .04,
            transmission: 1, thickness: .005, ior: 1.5, side: T.DoubleSide, envMapIntensity: .4 });
        } else if (seat && leather) {
          material = cabin.leather('#181b20', true); this.seats.push(material);
        } else if (leather) {
          material = cabin.dashboard(original); material.color.set('#202328');
        } else if (/logo32/.test(n)) {
          material.color.set('#ffffff'); material.map = badge; material.metalness = .1; material.roughness = .45;
          material.emissive.set('#ffffff'); material.emissiveMap = badge; material.emissiveIntensity = .3;
          material.side = T.DoubleSide;
        } else if (/gauges_beta/.test(n)) {
          material.color.set('#ffffff'); material.map = dials; material.metalness = 0; material.roughness = .9;
          material.emissive.set('#ffffff'); material.emissiveMap = dials; material.emissiveIntensity = .2;
        } else if (/pribori/.test(n)) {
          material.color.set('#101317'); material.metalness = 0; material.roughness = .65;
        } else if (/carpet/.test(n)) {
          material.color.set('#171a1e'); material.metalness = 0; material.roughness = 1;
        } else if (/plastik|body_parts|frame/.test(n)) {
          material.color.set('#181b20'); material.metalness = 0; material.roughness = .75;
        } else if (wheel && !/tire|rubber/.test(n)) {
          material.color.set('#bdc5cd'); material.metalness = .8; material.roughness = .3; this.rims.push(material);
        } else if (/tire|rubber/.test(n)) {
          material.color.set('#17191c'); material.metalness = 0; material.roughness = .95;
        } else if (/metall|chrome/.test(n)) {
          material.color.set('#85909d'); material.metalness = .75; material.roughness = .35;
        } else if (/knopki|multi/.test(n)) {
          material.color.set('#565e68'); material.metalness = 0; material.roughness = .65;
        }
        for (const value of Object.values(material)) if (value instanceof T.Texture) value.anisotropy = anisotropy;
        cache.set(key, material);
        return material;
      });
      if (originals.length === 1 && /gauges_beta|logo32/.test(originals[0].name)) {
        projectE46Artwork(geometry, /gauges_beta/.test(originals[0].name));
      }
      if (needsDetail) geometry = cabin.addDetailUVs(geometry);
      const box = new T.Box3().setFromBufferAttribute(geometry.getAttribute('position') as T.BufferAttribute);
      const middle = box.getCenter(new T.Vector3());
      const glass = materials.some(m => (m as T.MeshPhysicalMaterial).transmission > 0);
      const paint = materials.some(m => this.paints.includes(m));
      const kind = wheel ? 'wheels' : interior ? 'interior' : glass ? 'glass' : paint ? 'paint' : 'structure';
      const offset = wheel ? new T.Vector3(0, 0, Math.sign(middle.z) * .85)
        : glass ? new T.Vector3(0, 1.25, 0) : interior ? new T.Vector3(0, .55, 0)
        : paint ? new T.Vector3(0, /roof/.test(assembly) ? 1.5 : .8, 0) : new T.Vector3();
      const part = new T.Group();
      const visual = new T.Mesh(geometry, Array.isArray(mesh.material) ? materials : materials[0]);
      visual.castShadow = !glass; visual.receiveShadow = true; visual.layers.enable(1);
      if (!glass) visual.layers.enable(2);
      part.add(visual);
      this.group.add(part);
      this.parts.push({ group: part, origin: new T.Vector3(), offset, kind });
      if (/rim_/.test(assembly)) this.wheelVariants.push({ group: part, finish: /rim_bbs_chr/.test(assembly) ? 'forged' : 'sport' });
    }
    source.traverse(node => { if (node instanceof T.Mesh) {
      node.geometry.dispose();
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.dispose();
    } });
  }

  update(paint: string, wheels: string, exploded: boolean, activePart: string) {
    for (const material of this.paints) material.color.set(paint);
    for (const material of this.rims) material.color.set(wheels === 'forged' ? '#444e5a' : '#bdc5cd');
    for (const variant of this.wheelVariants) variant.group.visible = variant.finish === wheels;
    for (const [kind, materials] of [['paint', this.paints], ['wheels', this.rims], ['interior', this.seats]] as const) {
      for (const material of materials) {
        material.emissive.set(exploded && activePart === kind ? '#0066b1' : '#000000');
        material.emissiveIntensity = .12;
      }
    }
  }
}
