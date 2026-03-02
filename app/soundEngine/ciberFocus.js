export class FocusCyberAudio {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.tempo = 90;
    this.isPlaying = false;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;

    // Filtro general
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 1200;

    this.master.connect(this.filter);
    this.filter.connect(this.ctx.destination);
  }

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

  // ===== PAD ATMOSFÉRICO =====
  startPad() {
    const osc1 = this.createOsc("sawtooth", 110);
    const osc2 = this.createOsc("triangle", 111); // leve detune

    const gain = this.createGain(0.15);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.master);

    osc1.start();
    osc2.start();

    this.pad = { osc1, osc2 };
  }

  // ===== SUB PULSE SUAVE =====
  schedulePulse(startTime) {
    const beat = 60 / this.tempo;

    const osc = this.createOsc("sine", 55);
    const gain = this.createGain(0);

    osc.connect(gain);
    gain.connect(this.master);

    gain.gain.setValueAtTime(0.2, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.8);

    osc.start(startTime);
    osc.stop(startTime + 0.8);
  }

  // ===== RUIDO ROSA =====
  createNoise() {
    const bufferSize = 2 * this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 800;

    const gain = this.createGain(0.05);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);

    noise.start();
    this.noise = noise;
  }

  start() {
    if (this.isPlaying) return;
    this.isPlaying = true;

    this.startPad();
    this.createNoise();

    const beat = 60 / this.tempo;
    let nextTime = this.ctx.currentTime;

    const loop = () => {
      if (!this.isPlaying) return;

      this.schedulePulse(nextTime);
      nextTime += beat * 2;

      setTimeout(loop, beat * 2000);
    };

    loop();
  }

  stop() {
    this.isPlaying = false;
    this.pad?.osc1.stop();
    this.pad?.osc2.stop();
    this.noise?.stop();
  }
}
