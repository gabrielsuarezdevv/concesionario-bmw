import * as T from 'three';

/** CC0 photographed leather detail, independent of the model's low-resolution colour atlas. */
export class CabinMaterials {
  private readonly normal: T.Texture;
  private readonly roughness: T.Texture;
  private readonly upholstery = { value: new T.Color('#252827') };

  constructor(anisotropy: number, invalidate: () => void = () => {}) {
    const loader = new T.TextureLoader();
    this.normal = loader.load('/textures/leather-white-normal-1k.jpg', invalidate);
    this.roughness = loader.load('/textures/leather-white-roughness-1k.jpg', invalidate);
    for (const texture of [this.normal, this.roughness]) {
      texture.wrapS = texture.wrapT = T.RepeatWrapping;
      texture.channel = 1;
      texture.anisotropy = anisotropy;
      texture.colorSpace = T.NoColorSpace;
    }
  }

  setUpholsteryColor(color: string) { this.upholstery.value.set(color); }

  leather(trimColor = '#111418', upholsteryOnly = false): T.MeshPhysicalMaterial {
    const material = new T.MeshPhysicalMaterial({
      color: '#ffffff', metalness: 0, roughness: 1,
      normalMap: this.normal, normalScale: new T.Vector2(.32, .32),
      roughnessMap: this.roughness,
      sheen: .12, sheenColor: '#b1b0ad', sheenRoughness: .9,
      envMapIntensity: .65
    });
    material.onBeforeCompile = shader => {
      shader.uniforms['cabinUpholstery'] = this.upholstery;
      shader.uniforms['cabinTrim'] = { value: new T.Color(trimColor) };
      if(!upholsteryOnly) {
        shader.vertexShader='attribute float cabinUpholsteryMask;\nvarying float vCabinUpholsteryMask;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\nvCabinUpholsteryMask = cabinUpholsteryMask;');
        shader.fragmentShader='varying float vCabinUpholsteryMask;\n'+shader.fragmentShader;
      }
      shader.fragmentShader = 'uniform vec3 cabinUpholstery;\nuniform vec3 cabinTrim;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        diffuseColor.rgb *= ${upholsteryOnly ? 'cabinUpholstery' : 'mix(cabinTrim, cabinUpholstery, vCabinUpholsteryMask)'};
      `);
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        'float roughnessFactor = mix(0.68, 0.92, texture2D(roughnessMap, vRoughnessMapUv).g);'
      );
    };
    material.customProgramCacheKey = () => 'cabin-leather-panel-mask-v3-'+upholsteryOnly;
    return material;
  }

  dashboard(original: T.MeshStandardMaterial): T.MeshStandardMaterial {
    const material = original.clone();
    // glTF defaults metalness to 1 when omitted. The source atlas is vinyl, not metal.
    material.metalness = 0;
    material.roughness = .82;
    material.envMapIntensity = .5;
    material.normalMap = this.normal;
    material.normalScale.set(.16, .16);
    material.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
          vec4 cabinTexel = texture2D(map, vMapUv);
          // The atlas has a yellow decorative strip; give it a neutral satin finish.
          if (cabinTexel.r > .22 && cabinTexel.g > .22 && cabinTexel.b < cabinTexel.g * .65) {
            cabinTexel.rgb = vec3(dot(cabinTexel.rgb, vec3(.2126, .7152, .0722)) * .48);
          }
          diffuseColor *= cabinTexel;
        #endif`
      );
    };
    material.customProgramCacheKey = () => 'cabin-vinyl-atlas-v1';
    return material;
  }

  /** Secondary UVs in metres: consistent 30 cm grain on seats, doors and dashboard. */
  addDetailUVs(geometry: T.BufferGeometry): T.BufferGeometry {
    const result = geometry.index ? geometry.toNonIndexed() : geometry;
    if (result !== geometry) geometry.dispose();
    const position = result.getAttribute('position');
    const normal = result.getAttribute('normal');
    const uvs = new Float32Array(position.count * 2);
    for (let i = 0; i < position.count; i += 3) {
      const nx = Math.abs(normal.getX(i) + normal.getX(i + 1) + normal.getX(i + 2));
      const ny = Math.abs(normal.getY(i) + normal.getY(i + 1) + normal.getY(i + 2));
      const nz = Math.abs(normal.getZ(i) + normal.getZ(i + 1) + normal.getZ(i + 2));
      for (let j = i; j < i + 3; j++) {
        uvs[j * 2] = (nx > ny && nx > nz ? position.getZ(j) : position.getX(j)) / .3;
        uvs[j * 2 + 1] = (ny > nx && ny > nz ? position.getZ(j) : position.getY(j)) / .3;
      }
    }
    result.setAttribute('uv1', new T.BufferAttribute(uvs, 2));
    return result;
  }

  dispose() {
    this.normal.dispose();
    this.roughness.dispose();
  }
}
