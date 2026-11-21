/** Bound pixel work and lower resolution only after sustained slow moving frames. */
export class ViewerQuality {
  ratio = 1;
  maximum = 1;
  private elapsed = 0;
  private frames = 0;
  moving = false;
  resize(width: number, height: number, deviceRatio: number) {
    this.maximum = Math.max(.75, Math.min(deviceRatio || 1, 1.5, Math.sqrt(1200000 / Math.max(1, width * height))));
    this.restore();
  }
  observe(frameMs: number): boolean {
    if (frameMs <= 0 || frameMs > 150) return false; // Ignore idle gaps, loading and tab switches.
    this.elapsed += frameMs; this.frames++;
    if (this.elapsed < 700 || this.frames < 12) return false;
    const average = this.elapsed / this.frames;
    this.elapsed = 0; this.frames = 0;
    const next = average > 20 ? Math.max(Math.min(.75, this.maximum), this.ratio - .15) : this.ratio;
    if (Math.abs(next - this.ratio) < .01) return false;
    this.ratio = next; return true;
  }
  beginMotion() {
    if(this.moving)return false;
    this.moving=true;
    const next=Math.max(Math.min(.75,this.maximum),this.maximum*.85);
    const changed=Math.abs(next-this.ratio)>.001;
    this.ratio=next;return changed;
  }
  restore() { this.ratio = this.maximum; this.moving=false; this.elapsed = 0; this.frames = 0; }
}
