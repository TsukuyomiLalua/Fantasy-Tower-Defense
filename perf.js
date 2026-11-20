// Staged FPS auto-throttling for mobile performance

export class PerformanceController {
  constructor() {
    this.fps = 60;
    this.tier = 0; // 0: normal, 1: trim particles/popups, 2: simplified rings/grid, 3: minimal rendering
    this._frames = 0;
    this._elapsed = 0;
    this._lowStreak = 0;
    this._highStreak = 0;
  }

  update(dt) {
    this._frames += 1;
    this._elapsed += dt;
    if (this._elapsed >= 0.5) {
      this.fps = Math.round((this._frames / this._elapsed));
      this._frames = 0;
      this._elapsed = 0;

      if (this.fps < 22) {
        this._lowStreak += 1;
        this._highStreak = 0;
        if (this._lowStreak >= 2 && this.tier < 3) {
          this.tier += 1;
          this._lowStreak = 0;
        }
      } else if (this.fps < 36) {
        this._lowStreak += 1;
        this._highStreak = 0;
        if (this._lowStreak >= 2 && this.tier < 2) {
          this.tier += 1;
          this._lowStreak = 0;
        }
      } else if (this.fps < 50) {
        this._lowStreak += 1;
        this._highStreak = 0;
        if (this._lowStreak >= 2 && this.tier < 1) {
          this.tier += 1;
          this._lowStreak = 0;
        }
      } else if (this.fps >= 56) {
        this._highStreak += 1;
        this._lowStreak = 0;
        if (this._highStreak >= 4 && this.tier > 0) {
          this.tier -= 1;
          this._highStreak = 0;
        }
      }
    }
    return this.tier;
  }

  getTierLabel() {
    const labels = [
      `軽量化: 段階0 (通常 / ${this.fps}FPS)`,
      `軽量化: 段階1 (粒子削減 / ${this.fps}FPS)`,
      `軽量化: 段階2 (描画簡略 / ${this.fps}FPS)`,
      `軽量化: 段階3 (超軽量 / ${this.fps}FPS)`,
    ];
    return labels[this.tier] || labels[0];
  }
}
