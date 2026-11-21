import * as T from 'three';
import { batchCarParts } from './batch-car-parts';

type Part = { group: T.Group; origin: T.Vector3; offset: T.Vector3; kind: string };

/** One assembled representation; original geometry and materials remain available for disassembly. */
export class AssembledCar {
  readonly group = new T.Group();
  private readonly ownedGeometries: Set<T.BufferGeometry>;

  constructor(parts: readonly Part[]) {
    const assembled = parts.filter(part => part.group.visible).map(part => {
      const group = part.group.clone(true);
      group.position.copy(part.origin);
      this.group.add(group);
      return { group, origin: part.origin.clone(), offset: new T.Vector3(), kind: 'assembled' };
    });
    // Mesh clones share source buffers. Never dispose those buffers when merging or releasing this view.
    this.ownedGeometries = batchCarParts(this.group, assembled, new Set(), false);
  }

  dispose() { this.ownedGeometries.forEach(geometry => geometry.dispose()); this.group.clear(); }
}
