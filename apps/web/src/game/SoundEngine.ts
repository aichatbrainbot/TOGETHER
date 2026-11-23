import type { SimEventType } from '@together/game-core';

/**
 * Procedural dark-neon Web Audio synthesizer with live volume & mute support.
 * Zero external audio dependencies and zero paid APIs.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private masterVolume = 0.7;

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  setVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
  }

  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
  }

  play(event: SimEventType): void {
    if (this.muted || this.masterVolume <= 0.001) return;
    this.unlock();
    if (!this.ctx || this.ctx.state !== 'running') return;

    const now = this.ctx.currentTime;
    switch (event) {
      case 'jump':
        this.tone(240, 420, 0.085, 'triangle', 0.09, now);
        break;
      case 'land':
        this.tone(110, 68, 0.045, 'sine', 0.045, now);
        break;
      case 'switch_on':
        this.tone(520, 680, 0.07, 'square', 0.05, now);
        break;
      case 'bridge_on':
        this.tone(330, 494, 0.14, 'triangle', 0.06, now);
        break;
      case 'bridge_lock':
        this.tone(523.25, 523.25, 0.1, 'triangle', 0.065, now);
        this.tone(659.25, 659.25, 0.14, 'triangle', 0.065, now + 0.07);
        this.tone(783.99, 783.99, 0.2, 'triangle', 0.075, now + 0.14);
        break;
      case 'door_unlock':
        this.tone(440, 440, 0.09, 'triangle', 0.07, now);
        this.tone(554.37, 554.37, 0.1, 'triangle', 0.07, now + 0.07);
        this.tone(659.25, 659.25, 0.12, 'triangle', 0.075, now + 0.14);
        this.tone(880, 880, 0.24, 'triangle', 0.08, now + 0.22);
        break;
      case 'respawn':
        this.tone(360, 120, 0.18, 'sawtooth', 0.055, now);
        break;
      case 'level_complete': {
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((freq, idx) => {
          this.tone(freq, freq, 0.18, 'triangle', 0.08, now + idx * 0.09);
        });
        break;
      }
    }
  }

  private tone(
    startFreq: number,
    endFreq: number,
    durationSec: number,
    type: OscillatorType,
    baseVolume: number,
    startTime: number,
  ): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const scaledVol = Math.max(0.0002, baseVolume * this.masterVolume);

    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, startTime);
    if (startFreq !== endFreq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), startTime + durationSec);
    }

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(scaledVol, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + durationSec + 0.02);
  }
}
