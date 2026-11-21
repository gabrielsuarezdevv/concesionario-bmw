/** Even 60 FPS pacing on high refresh displays, without double-rendering near a frame boundary. */
export class ViewerFrameClock {
  private last = 0;
  private started = false;
  take(time: number): boolean {
    if (!this.started) { this.started = true; this.last = time; return true; }
    const budget = 1000 / 60, elapsed = time - this.last;
    if (elapsed + .01 < budget) return false;
    this.last += Math.max(1, Math.floor((elapsed + .01) / budget)) * budget;
    return true;
  }
  reset() { this.started = false; }
}
