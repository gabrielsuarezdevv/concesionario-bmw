import * as T from 'three';

export const CABIN_FIELD_OF_VIEW = 82;

/** Rotate the viewing direction while keeping the driver's position fixed. */
export class CabinLook {
  private yaw = 0;
  private pitch = 0;
  private readonly spherical = new T.Spherical();
  private readonly direction = new T.Vector3();
  rotate(yaw: number, pitch: number) {
    this.yaw = (this.yaw + yaw) % (Math.PI * 2);
    this.pitch = T.MathUtils.clamp(this.pitch + pitch, -.7, .65);
  }
  reset() { this.yaw = 0; this.pitch = 0; }
  target(anchor: T.Vector3, forward: T.Vector3, result: T.Vector3) {
    this.spherical.setFromVector3(this.direction.copy(forward).sub(anchor));
    this.spherical.radius = 1;
    this.spherical.theta += this.yaw;
    this.spherical.phi = T.MathUtils.clamp(this.spherical.phi + this.pitch, .2, Math.PI - .2);
    return result.copy(anchor).add(this.direction.setFromSpherical(this.spherical));
  }
}
