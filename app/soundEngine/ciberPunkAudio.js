export class CyberArcadeAudio {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.tempo = 135;
    this.isPlaying = false;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 1200;

    this.master.disconnect();
    this.master.connect(this.filter);
    this.filter.connect(this.ctx.destination);
  }

  // ===== Utils =====
  createOsc(type, freq) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    return osc;
  }

  createGain(value = 0.5) {
    const g = this.ctx.createGain();
    g.gain.value = value;
    return g;
  }

  scheduleNote(freq, time, duration, type = "square", volume = 0.3) {
    const osc = this.createOsc(type, freq);
    const gain = this.createGain(0);

    osc.connect(gain);
    gain.connect(this.master);

    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.start(time);
    osc.stop(time + duration);
  }

  // ===== Bass =====
  playBassPattern(startTime) {
    const pattern = [55, 55, 82, 55]; // A1 / E2 vibes
    const beat = 60 / this.tempo;

    pattern.forEach((freq, i) => {
      this.scheduleNote(freq, startTime + i * beat, 0.3, "sawtooth", 0.25);
    });
  }

  // ===== Lead Melody (Mario-inspired but electric) =====
  playLead(startTime) {
    const melody = [440, 660, 880, 660, 523, 660, 784, 988];
    const beat = 60 / this.tempo / 2;

    melody.forEach((freq, i) => {
      this.scheduleNote(freq, startTime + i * beat, 0.15, "square", 0.18);
    });
  }

  // ===== Arpeggio Atmosphere =====
  playArp(startTime) {
    const arp = [220, 330, 440, 660];
    const beat = 60 / this.tempo / 4;

    arp.forEach((freq, i) => {
      this.scheduleNote(freq, startTime + i * beat, 0.1, "triangle", 0.1);
    });
  }

  // ===== Kick =====
  playKick(time) {
    const osc = this.createOsc("sine", 120);
    const gain = this.createGain(0);

    osc.connect(gain);
    gain.connect(this.master);

    gain.gain.setValueAtTime(0.8, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);

    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.2);

    osc.start(time);
    osc.stop(time + 0.2);
  }

  // ===== Main Loop =====
  start() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.sweepFilter(4, 800, 3000); // 🔥 aquí

    const beat = 60 / this.tempo;
    let nextTime = this.ctx.currentTime;

    const loop = () => {
      if (!this.isPlaying) return;

      this.playBassPattern(nextTime);
      this.playLead(nextTime);
      this.playArp(nextTime);

      this.playKick(nextTime);
      this.playKick(nextTime + beat * 2);

      nextTime += beat * 4;
      setTimeout(loop, beat * 4000);
    };

    loop();
  }
  sweepFilter(duration = 4, from = 800, to = 3000) {
    const now = this.ctx.currentTime;

    this.filter.frequency.cancelScheduledValues(now);
    this.filter.frequency.setValueAtTime(from, now);
    this.filter.frequency.linearRampToValueAtTime(to, now + duration);
  }
  activateEpicMode() {
    this.tempo = 150;

    this.sweepFilter(2, 600, 6000); // más agresivo
  }

  stop() {
    this.isPlaying = false;
  }
}
