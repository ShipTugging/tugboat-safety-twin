/**
 * Web Audio API based Sound Synthesizer for Harbor Tugboat Digital Twin
 * Completely client-side procedural generation without external mp3 files.
 */

class MaritimeAudioSystem {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private alarmOsc1: OscillatorNode | null = null;
  private alarmOsc2: OscillatorNode | null = null;
  private alarmGain: GainNode | null = null;
  private isAlarmPlaying: boolean = false;
  private lastSonarTime: number = 0;

  private initContext() {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        this.ctx = new AudioCtxClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted && this.isAlarmPlaying) {
      this.stopAlarm();
    }
  }

  /**
   * Tactical maritime sonar ping (Reverberant sine wave decay)
   */
  public playSonarPing(force: boolean = false) {
    if (this.isMuted) return;
    const now = performance.now();
    if (!force && now - this.lastSonarTime < 3500) return; // limit frequency
    this.lastSonarTime = now;

    try {
      this.initContext();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(840, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(620, this.ctx.currentTime + 1.2);

      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 1.5);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 1.5);
    } catch {
      // Audio context might be restricted before interaction
    }
  }

  /**
   * Start / Update Emergency Klaxon Siren (Two-tone pulsing alarm)
   */
  public startAlarm() {
    if (this.isMuted || this.isAlarmPlaying) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      this.alarmGain = this.ctx.createGain();
      this.alarmGain.gain.setValueAtTime(0.12, this.ctx.currentTime);

      this.alarmOsc1 = this.ctx.createOscillator();
      this.alarmOsc2 = this.ctx.createOscillator();

      this.alarmOsc1.type = 'sawtooth';
      this.alarmOsc2.type = 'sine';

      // 4Hz two-tone modulating siren
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.setValueAtTime(4, this.ctx.currentTime); // 4 pulses per second
      lfoGain.gain.setValueAtTime(160, this.ctx.currentTime);

      lfo.connect(lfoGain);
      lfoGain.connect(this.alarmOsc1.frequency);
      this.alarmOsc1.frequency.setValueAtTime(740, this.ctx.currentTime);
      this.alarmOsc2.frequency.setValueAtTime(370, this.ctx.currentTime);

      this.alarmOsc1.connect(this.alarmGain);
      this.alarmOsc2.connect(this.alarmGain);
      this.alarmGain.connect(this.ctx.destination);

      this.alarmOsc1.start();
      this.alarmOsc2.start();
      lfo.start();
      this.isAlarmPlaying = true;
    } catch {
      // ignore
    }
  }

  public stopAlarm() {
    if (!this.isAlarmPlaying) return;
    try {
      if (this.alarmOsc1) {
        this.alarmOsc1.stop();
        this.alarmOsc1.disconnect();
      }
      if (this.alarmOsc2) {
        this.alarmOsc2.stop();
        this.alarmOsc2.disconnect();
      }
      if (this.alarmGain) {
        this.alarmGain.disconnect();
      }
    } catch {
      // ignore
    } finally {
      this.alarmOsc1 = null;
      this.alarmOsc2 = null;
      this.alarmGain = null;
      this.isAlarmPlaying = false;
    }
  }

  /**
   * Pneumatic Emergency Quick-Release Hook actuation sound
   */
  public playQuickRelease() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      // 1. Heavy metallic clunk
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(140, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.3);
      oscGain.gain.setValueAtTime(0.3, this.ctx.currentTime);
      oscGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);

      osc.connect(oscGain);
      oscGain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.35);

      // 2. High-pressure pneumatic air hiss burst
      const bufferSize = this.ctx.sampleRate * 0.4;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1800, this.ctx.currentTime);
      filter.Q.setValueAtTime(2.0, this.ctx.currentTime);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.25, this.ctx.currentTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.4);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);

      noise.start();
      noise.stop(this.ctx.currentTime + 0.4);
    } catch {
      // ignore
    }
  }

  /**
   * Towing line high-tension stress groan
   */
  public playTensionCreak() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(95, this.ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(130, this.ctx.currentTime + 0.15);
      osc.frequency.exponentialRampToValueAtTime(65, this.ctx.currentTime + 0.4);

      gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.4);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.4);
    } catch {
      // ignore
    }
  }
}

export const maritimeAudio = new MaritimeAudioSystem();
