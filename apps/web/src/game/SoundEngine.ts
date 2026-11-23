import type { SimEventType } from '@together/game-core';

export type SoundCue = SimEventType | 'emote';

const AMBIENT_PROGRESSION = [
  [146.83, 220.0, 261.63], // Dm7 feel
  [130.81, 196.0, 246.94], // Cmaj7 feel
  [116.54, 174.61, 220.0], // Bbmaj7 feel
  [130.81, 196.0, 233.08], // Cm7 feel
] as const;

/**
 * Procedural dark-neon Web Audio synthesizer with optional lightweight ambient synth loop.
 * Zero external audio assets, zero CPU bloat.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private musicEnabled = false;
  private masterVolume = 0.7;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private chordStep = 0;

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.syncMusicLoop();
  }

  setMusicEnabled(enabled: boolean): void {
    this.musicEnabled = enabled;
    this.syncMusicLoop();
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
      void this.ctx.resume().then(() => {
        this.syncMusicLoop();
      }).catch(() => {});
    } else {
      this.syncMusicLoop();
    }
  }

  dispose(): void {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }

  private syncMusicLoop(): void {
    const shouldPlay = this.musicEnabled && !this.muted && this.masterVolume > 0.005;
    if (!shouldPlay) {
      if (this.musicTimer) {
        clearInterval(this.musicTimer);
        this.musicTimer = null;
      }
      return;
    }
    if (!this.ctx || this.ctx.state !== 'running' || this.musicTimer) return;

    const triggerPad = () => {
      if (!this.ctx || this.ctx.state !== 'running' || this.muted || !this.musicEnabled) return;
      const chord = AMBIENT_PROGRESSION[this.chordStep % AMBIENT_PROGRESSION.length]!;
      this.chordStep += 1;
      const now = this.ctx.currentTime;
      for (const freq of chord) {
        this.ambientNote(freq, 2.9, now);
      }
    };

    triggerPad();
    this.musicTimer = setInterval(triggerPad, 3000);
  }

  play(event: SoundCue): void {
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
      case 'bounce':
        this.tone(220, 680, 0.16, 'sine', 0.095, now);
        this.tone(330, 880, 0.14, 'triangle', 0.055, now + 0.03);
        break;
      case 'crumble':
        this.tone(190, 72, 0.16, 'sawtooth', 0.055, now);
        break;
      case 'checkpoint':
        this.tone(523.25, 523.25, 0.09, 'triangle', 0.07, now);
        this.tone(783.99, 783.99, 0.14, 'triangle', 0.075, now + 0.07);
        this.tone(1046.5, 1046.5, 0.18, 'sine', 0.07, now + 0.14);
        break;
      case 'coin_pickup':
        this.tone(880, 880, 0.07, 'triangle', 0.075, now);
        this.tone(1174.66, 1174.66, 0.08, 'triangle', 0.08, now + 0.05);
        this.tone(1567.98, 1567.98, 0.14, 'sine', 0.075, now + 0.1);
        break;
      case 'switch_on':
        this.tone(520, 680, 0.07, 'square', 0.045, now);
        break;
      case 'bridge_on':
        this.tone(330, 494, 0.14, 'triangle', 0.06, now);
        break;
      case 'bridge_lock':
        this.tone(523.25, 523.25, 0.1, 'triangle', 0.065, now);
        this.tone(659.25, 659.25, 0.14, 'triangle', 0.065, now + 0.07);
        this.tone(783.99, 783.99, 0.2, 'triangle', 0.075, now + 0.14);
        break;
      case 'key_pickup':
        this.tone(659.25, 659.25, 0.08, 'triangle', 0.065, now);
        this.tone(987.77, 987.77, 0.12, 'triangle', 0.07, now + 0.06);
        this.tone(1318.5, 1318.5, 0.16, 'sine', 0.06, now + 0.12);
        break;
      case 'gate_unlock':
        this.tone(329.63, 440, 0.1, 'square', 0.045, now);
        this.tone(554.37, 659.25, 0.16, 'triangle', 0.065, now + 0.08);
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
      case 'emote':
        this.tone(480, 720, 0.07, 'sine', 0.05, now);
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

  private ambientNote(freq: number, durationSec: number, startTime: number): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const vol = Math.max(0.0002, 0.022 * this.masterVolume);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(vol, startTime + 0.8);
    gain.gain.linearRampToValueAtTime(vol * 0.65, startTime + durationSec - 0.8);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + durationSec + 0.05);
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
