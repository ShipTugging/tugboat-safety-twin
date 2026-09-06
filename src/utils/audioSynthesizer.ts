// Web Audio API procedural sound synthesizer for high-tech maritime operations
class MaritimeAudioEngine {
  private ctx: AudioContext | null = null;
  private isEnabled: boolean = true;
  private lastAlertTime: number = 0;
  private rumbleNode: AudioBufferSourceNode | null = null;
  private rumbleGain: GainNode | null = null;

  private initContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
  }

  // Girting emergency siren: high-pitch modulated two-tone sweep
  public playGirtingAlarm() {
    if (!this.isEnabled) return;
    const now = Date.now();
    if (now - this.lastAlertTime < 800) return;
    this.lastAlertTime = now;

    this.initContext();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';

      const t = this.ctx.currentTime;
      osc.frequency.setValueAtTime(880, t);
      osc.frequency.exponentialRampToValueAtTime(1400, t + 0.2);
      osc.frequency.exponentialRampToValueAtTime(880, t + 0.4);

      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.45);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.45);
    } catch {
      // Audio context might be blocked by autoplay policies until user gesture
    }
  }

  // Suction proximity alert: rapid sonar ping
  public playProximityPing(intensity: number) { // intensity 0 to 1
    if (!this.isEnabled || intensity < 0.3) return;
    const now = Date.now();
    const interval = Math.max(120, 700 - intensity * 550);
    if (now - this.lastAlertTime < interval) return;
    this.lastAlertTime = now;

    this.initContext();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';

      const t = this.ctx.currentTime;
      const freq = 1200 + intensity * 600;
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.15 * intensity, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.09);
    } catch {
      // Ignored
    }
  }

  // Quick-release actuation: hydraulic hiss + heavy steel clunk
  public playQuickRelease() {
    if (!this.isEnabled) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(120, t);
      osc.frequency.exponentialRampToValueAtTime(30, t + 0.25);

      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.3);
    } catch {
      // Ignored
    }
  }
}

export const maritimeAudio = new MaritimeAudioEngine();
