import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type Part = { group: T.Group; origin: T.Vector3; offset: T.Vector3; kind: string };

/** Batch baked, opaque meshes only when their material AND exploded movement match. */
export function batchCarParts(root: T.Group, parts: Part[], protectedGroups: ReadonlySet<T.Group> = new Set(), disposeInputs = true) {
  const mergedGeometries = new Set<T.BufferGeometry>();
  const assemblies = new Map<string, Part[]>();
  const retained: Part[] = [];
  for (const part of parts) {
    const group = part.group;
    if (protectedGroups.has(group) || !group.visible || part.origin.lengthSq() !== 0
      || group.position.lengthSq() !== 0 || group.rotation.toArray().slice(0, 3).some(v => v !== 0)
      || !group.scale.equals(new T.Vector3(1, 1, 1)) || !group.children.every(node =>
        node instanceof T.Mesh && !(node instanceof T.SkinnedMesh) && node.position.lengthSq() === 0
        && node.quaternion.equals(new T.Quaternion()) && node.scale.equals(new T.Vector3(1, 1, 1))
        && !Object.keys(node.geometry.morphAttributes).length)) {
      retained.push(part); continue;
    }
    const key = JSON.stringify([part.kind, ...part.offset.toArray()]);
    const collection = assemblies.get(key) ?? [];
    collection.push(part); assemblies.set(key, collection);
  }
  for (const originals of assemblies.values()) {
    const first = originals[0];
    const combined: Part = { group: new T.Group(), origin: first.origin.clone(), offset: first.offset.clone(), kind: first.kind };
    const batches = new Map<string, T.Mesh[]>();
    for (const part of originals) {
      for (const node of [...part.group.children] as T.Mesh[]) {
        const material = node.material;
        // Transparent meshes need their original sorting boundaries; preserve them verbatim.
        if (!node.visible || Array.isArray(material) || material.transparent
          || (material instanceof T.MeshPhysicalMaterial && material.transmission > 0)
          || node.geometry.groups.length > 0 || node.geometry.drawRange.start !== 0
          || node.geometry.drawRange.count !== Infinity) {
          combined.group.add(node); continue;
        }
        const layout = Object.keys(node.geometry.attributes).sort().map(name => {
          const a = node.geometry.getAttribute(name);
          return [name, a.itemSize, a.normalized, a.array.constructor.name, 'gpuType' in a ? a.gpuType : undefined];
        });
        const key = JSON.stringify([material.uuid, !!node.geometry.index, layout, node.castShadow,
          node.receiveShadow, node.layers.mask, node.renderOrder, node.frustumCulled]);
        const batch = batches.get(key) ?? [];
        batch.push(node); batches.set(key, batch);
      }
      root.remove(part.group);
    }
    for (const batch of batches.values()) {
      const geometry = batch.length > 1 ? mergeGeometries(batch.map(mesh => mesh.geometry)) : null;
      if (!geometry) { combined.group.add(...batch); continue; }
      const visual = batch[0].clone(false);
      visual.geometry = geometry;
      combined.group.add(visual);
      mergedGeometries.add(geometry);
      if(disposeInputs)new Set(batch.map(mesh => mesh.geometry)).forEach(g => g.dispose());
    }
    root.add(combined.group); retained.push(combined);
  }
  parts.splice(0, parts.length, ...retained);
  return mergedGeometries;
}
