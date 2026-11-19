import * as T from 'three';

type Part = { group: T.Group; origin: T.Vector3; offset: T.Vector3; kind: string };

/** Complete Black Snow E36/E92 assets; no cabin or body meshes from another car. */
export class StreetCar {
  readonly group = new T.Group();
  readonly parts: Part[] = [];
  private paints: T.MeshStandardMaterial[] = [];
  private rims: T.MeshStandardMaterial[] = [];
  private seats: T.MeshStandardMaterial[] = [];

  constructor(source: T.Group, model: 'e36' | 'e92', paintNormal: T.Texture, anisotropy: number) {
    source.traverse(node => {
      const n = node.name;
      if (model === 'e36' && (/^E36uk_/.test(n)
        || /^E36_coupe_(?:gauges_escM3|gauges_speed_odo_miles|trunk_lettering|sunroof_manual|rooflight_second|button_speaker_clear)/.test(n)
        || n === 'E36_coupe_gauges' || /^E36_coupe_needle_(?:temp|tacho|speedo|fuel)$/.test(n)
        || /^E36_coupe_f_(?:obc11|obc8|obc7|clock|obc_clock|clear)$/.test(n)
        || /^E36_coupe_seat_F[LR]_(?:heat|1_m)$/.test(n)
        || /^E36_(?:halfshaft_F|diff_F|driveshaft_F)$/.test(n))) node.visible = false;
      if (model === 'e92' && (/^e92_display(?:Nd|Pd|Rd)$/.test(n)
        || /^e92_lettering_trunk_/.test(n)
        || /^e92_(?:engine_i4|header_i4|header_i6_turbo|header_v8_turbo|icpipe_|intake_v8_turbo|radtube_i4)/.test(n))) node.visible = false;
    });
    source.rotation.y += Math.PI / 2;
    source.updateMatrixWorld(true);
    const bounds = new T.Box3().setFromObject(source, true);
    const center = bounds.getCenter(new T.Vector3());
    const scale = (model === 'e36' ? 4.433 : 4.615) / bounds.getSize(new T.Vector3()).x;
    const normalize = new T.Matrix4().makeScale(scale, scale, scale)
      .multiply(new T.Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z));
    const cache = new Map<string, T.MeshStandardMaterial>();
    const assemblies = new Map<string, Part>();
    const meshes: T.Mesh[] = [];
    source.traverseVisible(node => { if (node instanceof T.Mesh) meshes.push(node); });
    for (const mesh of meshes) {
      const assembly = mesh.parent && !/^(RootNode|Sketchfab_model)$/.test(mesh.parent.name) ? mesh.parent : mesh;
      const n = assembly.name;
      const seat = /seat_/.test(n);
      const wheelAssembly = /^(wheel_bmw_|e92_wheel_|amdb11_brakedisc)/.test(n);
      const originals = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const materials = originals.map(originalMaterial => {
        const original = originalMaterial as T.MeshStandardMaterial;
        const key = original.uuid + ':' + seat + ':' + wheelAssembly;
        if (cache.has(key)) return cache.get(key)!;
        const name = original.name;
        let material = original.clone();
        if (/^(BMWE36_paint(?:\.\d+)?|e92_paint)$/.test(name)) {
          material = new T.MeshPhysicalMaterial({ color: '#2868b2', metalness: .52, roughness: .32,
            clearcoat: 1, clearcoatRoughness: .2, normalMap: paintNormal, normalScale: new T.Vector2(.018, .018) });
          this.paints.push(material);
        } else if (/^(BMWE36_glass(?:_int)?|e92_glass(?:_int)?)$/.test(name)) {
          material = new T.MeshPhysicalMaterial({ color: '#edf3f8', metalness: 0, roughness: .04,
            transmission: 1, thickness: .005, ior: 1.5, side: T.DoubleSide, envMapIntensity: .4 });
        } else if (wheelAssembly && /^(BMWE36_felgen|wheel_19a|e92_wheel_05a)$/.test(name)) {
          material.metalness = .8; material.roughness = .28; this.rims.push(material);
        } else if (name === 'Scene_-_Root.002') {
          material.color.set('#17191c'); material.metalness = 0; material.roughness = .95;
        } else if (name === 'E36_gauges_alpina') {
          material.metalness = 0; material.roughness = .7;
          material.emissiveMap = material.map; material.emissive.set('#ffffff'); material.emissiveIntensity = .15;
        } else if (seat && /seat_tex|leather|BMWE36_int/.test(name)) {
          material.color.set('#ffffff'); material.metalness = 0; material.roughness = .8;
          if (material.map) {
            // Remove only the atlas pigment, retaining its photographed leather grain.
            material.onBeforeCompile = shader => {
              shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>',
                '#include <map_fragment>\n#ifdef USE_MAP\nfloat grain = clamp(dot(sampledDiffuseColor.rgb, vec3(.2126,.7152,.0722)) * 12.0, .55, 1.25);\ndiffuseColor.rgb = diffuse * grain;\n#endif');
            };
            material.customProgramCacheKey = () => 'street-seat-grain';
          }
          this.seats.push(material);
        }
        for (const value of Object.values(material)) if (value instanceof T.Texture) value.anisotropy = anisotropy;
        cache.set(key, material);
        return material;
      });
      const geometry = mesh.geometry.clone();
      // Meshopt uses normalized integer attributes. Dequantize before baking world transforms:
      // writing transformed positions into an integer buffer would crush the whole car.
      for (const key of ['position', 'normal', 'tangent']) {
        const attribute = geometry.getAttribute(key);
        if (attribute && !(attribute.array instanceof Float32Array)) {
          const values = new Float32Array(attribute.count * attribute.itemSize);
          for (let i = 0; i < attribute.count; i++) for (let k = 0; k < attribute.itemSize; k++)
            values[i * attribute.itemSize + k] = attribute.getComponent(i, k);
          geometry.setAttribute(key, new T.Float32BufferAttribute(values, attribute.itemSize));
        }
      }
      geometry.applyMatrix4(new T.Matrix4().multiplyMatrices(normalize, mesh.matrixWorld));
      const box = new T.Box3().setFromBufferAttribute(geometry.getAttribute('position') as T.BufferAttribute);
      const middle = box.getCenter(new T.Vector3());
      const tire = originals.some(m => m.name === 'Scene_-_Root.002');
      const wheel = wheelAssembly || tire;
      const glass = materials.some(m => (m as T.MeshPhysicalMaterial).transmission > 0);
      const interior = seat || /dash|steer|gauges|needle|doorpanel|interior|console|pedal|sunvisor|intmirror|shifter|obc|clock|radio/.test(n);
      const paint = materials.some(m => this.paints.includes(m));
      const kind = wheel ? 'wheels' : interior ? 'interior' : glass ? 'glass' : paint ? 'paint' : 'structure';
      const side = Math.sign(middle.z) || 1;
      const offset = wheel ? new T.Vector3(0, 0, side * .85)
        : /door_[LR]$|doorpanel|doorglass/.test(n) ? new T.Vector3(0, .12, side * 1.05)
        : /hood/.test(n) ? new T.Vector3(.25, 1.2, 0)
        : /roof|windshield|backlight|sideglass/.test(n) ? new T.Vector3(0, 1.4, 0)
        : /trunk/.test(n) ? new T.Vector3(-.3, .85, 0)
        : /fender|bumper_[FR]/.test(n) ? new T.Vector3(Math.sign(middle.x) * .4, .15, side * .4)
        : interior ? new T.Vector3(0, .5, 0)
        : paint ? new T.Vector3(0, .65, 0) : new T.Vector3();
      const add = (g: T.BufferGeometry, id: string, displacement: T.Vector3) => {
        let part = assemblies.get(id);
        if (!part) {
          part = { group: new T.Group(), origin: new T.Vector3(), offset: displacement, kind };
          assemblies.set(id, part); this.parts.push(part); this.group.add(part.group);
        }
        const visual = new T.Mesh(g, Array.isArray(mesh.material) ? materials : materials[0]);
        visual.castShadow = !glass; visual.receiveShadow = true; visual.layers.enable(1);
        if (!glass && !materials.some(m => m.transparent)) visual.layers.enable(2);
        part.group.add(visual);
      };
      if (tire && box.getSize(new T.Vector3()).x > 2) {
        // Some exports combine the four tyres into one mesh; split at triangle boundaries.
        const flat = geometry.index ? geometry.toNonIndexed() : geometry;
        const positions = flat.getAttribute('position');
        const buckets: number[][] = [[], [], [], []];
        for (let i = 0; i < positions.count; i += 3) {
          const x = positions.getX(i) + positions.getX(i + 1) + positions.getX(i + 2);
          const z = positions.getZ(i) + positions.getZ(i + 1) + positions.getZ(i + 2);
          buckets[(x > 0 ? 2 : 0) + (z > 0 ? 1 : 0)].push(i, i + 1, i + 2);
        }
        buckets.forEach((indices, b) => {
          if (!indices.length) return;
          const split = new T.BufferGeometry();
          for (const key of Object.keys(flat.attributes)) {
            const attr = flat.getAttribute(key), values = new Float32Array(indices.length * attr.itemSize);
            indices.forEach((i, j) => { for (let k = 0; k < attr.itemSize; k++) values[j * attr.itemSize + k] = attr.getComponent(i, k); });
            split.setAttribute(key, new T.Float32BufferAttribute(values, attr.itemSize));
          }
          add(split, assembly.uuid + ':' + b, new T.Vector3(0, 0, b % 2 ? .85 : -.85));
        });
        if (flat !== geometry) flat.dispose(); geometry.dispose();
      } else add(geometry, assembly.uuid, offset);
    }
    source.traverse(node => { if (node instanceof T.Mesh) {
      node.geometry.dispose();
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.dispose();
    } });
  }

  update(paint: string, wheels: string, interior: string, exploded: boolean, activePart: string) {
    for (const material of this.paints) material.color.set(paint);
    for (const material of this.rims) material.color.set(wheels === 'forged' ? '#444e5a' : '#bdc5cd');
    for (const material of this.seats) material.color.set(interior);
    for (const [kind, materials] of [['paint', this.paints], ['wheels', this.rims], ['interior', this.seats]] as const)
      for (const material of materials) {
        material.emissive.set(exploded && activePart === kind ? '#0066b1' : '#000000'); material.emissiveIntensity = .12;
      }
  }
}
