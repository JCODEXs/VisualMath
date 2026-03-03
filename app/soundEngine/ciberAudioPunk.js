export class CyberArcadeAudio {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.tempo = 135; // bpm
    this.isPlaying = false;
    this.loopTimeout = null;

    // Master
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.65;

    // Filtro principal con LFO
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 1200;
    this.filter.Q.value = 5;

    // LFO para el filtro (para dar movimiento)
    this.lfo = this.ctx.createOscillator();
    this.lfo.frequency.value = 0.2; // 0.2 Hz
    this.lfo.type = "sine";
    this.lfoGain = this.ctx.createGain();
    this.lfoGain.gain.value = 600; // modulación de frecuencia
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.filter.frequency);

    // Conectar: master -> filter -> destination
    this.master.connect(this.filter);
    this.filter.connect(this.ctx.destination);

    // Efectos adicionales: reverb simulada con delay corto
    this.delay = this.ctx.createDelay();
    this.delay.delayTime.value = 0.3;
    this.delayFeedback = this.ctx.createGain();
    this.delayFeedback.gain.value = 0.25;
    this.delayMix = this.ctx.createGain();
    this.delayMix.gain.value = 0.15;

    this.master.connect(this.delayMix);
    this.delayMix.connect(this.delay);
    this.delay.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delay);
    this.delay.connect(this.filter); // Delay a la salida antes del filtro

    // Arrancar LFO (solo si se inicia)
  }

  // Utilidades
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

  // Nota con envolvente y opcionalmente modulación de frecuencia
  scheduleNote(
    freq,
    time,
    duration,
    type = "square",
    volume = 0.3,
    glide = false,
    glideTarget = null,
  ) {
    const osc = this.createOsc(type, freq);
    const gain = this.createGain(0);

    osc.connect(gain);
    gain.connect(this.master);

    // Envolvente
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    // Glide (portamento)
    if (glide && glideTarget) {
      osc.frequency.setValueAtTime(freq, time);
      osc.frequency.linearRampToValueAtTime(glideTarget, time + duration * 0.8);
    }

    osc.start(time);
    osc.stop(time + duration);
  }

  // Bass con patrón más complejo y slides
  playBassPattern(startTime) {
    const beat = 60 / this.tempo;
    const bar = beat * 4;

    // Patrón de 4 compases
    const pattern1 = [55, 55, 55, 55, 61.74, 61.74, 65.41, 65.41]; // A, C#, D
    const pattern2 = [55, 61.74, 55, 65.41, 55, 61.74, 55, 55];

    pattern1.forEach((freq, i) => {
      this.scheduleNote(
        freq,
        startTime + (i * beat) / 2,
        0.25,
        "sawtooth",
        0.22,
        false,
      );
    });

    // Segundo compás: añade un slide
    this.scheduleNote(
      55,
      startTime + beat * 2,
      0.5,
      "sawtooth",
      0.25,
      true,
      61.74,
    );
    this.scheduleNote(
      61.74,
      startTime + beat * 2.5,
      0.5,
      "sawtooth",
      0.25,
      true,
      65.41,
    );
    this.scheduleNote(65.41, startTime + beat * 3, 0.5, "sawtooth", 0.25);
    this.scheduleNote(55, startTime + beat * 3.5, 0.5, "sawtooth", 0.25);
  }

  // Lead más variado, con dos voces
  playLead(startTime) {
    const beat = 60 / this.tempo / 2; // semicorcheas
    const melody1 = [
      440, 440, 660, 440, 880, 660, 523, 523, 660, 523, 784, 660,
    ];
    const melody2 = [
      220, 220, 330, 220, 440, 330, 262, 262, 330, 262, 392, 330,
    ]; // una octava abajo

    melody1.forEach((freq, i) => {
      this.scheduleNote(freq, startTime + i * beat, 0.12, "square", 0.16);
    });
    // Segunda voz (contramelodía) con retraso de 2 semicorcheas
    melody2.forEach((freq, i) => {
      this.scheduleNote(
        freq,
        startTime + i * beat + beat * 2,
        0.12,
        "triangle",
        0.1,
      );
    });
  }

  // Arpegio más rápido y con variación
  playArp(startTime) {
    const beat = 60 / this.tempo / 4; // fusas
    const arp1 = [220, 277, 330, 277, 220, 277, 330, 277];
    const arp2 = [330, 415, 440, 415, 330, 415, 440, 415];

    arp1.forEach((freq, i) => {
      this.scheduleNote(freq, startTime + i * beat, 0.08, "triangle", 0.1);
    });
    arp2.forEach((freq, i) => {
      this.scheduleNote(
        freq,
        startTime + beat * 8 + i * beat,
        0.08,
        "triangle",
        0.1,
      );
    });
  }

  // Percusión
  playKick(time) {
    const osc = this.createOsc("sine", 120);
    const gain = this.createGain(0);
    osc.connect(gain);
    gain.connect(this.master);

    gain.gain.setValueAtTime(0.7, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);

    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.15);

    osc.start(time);
    osc.stop(time + 0.2);
  }

  playSnare(time) {
    const noise = this.ctx.createBufferSource();
    const buffer = this.ctx.createBuffer(
      1,
      this.ctx.sampleRate * 0.2,
      this.ctx.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < buffer.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    noise.buffer = buffer;

    const gain = this.createGain(0);
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 200;
    filter.Q.value = 1;

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);

    gain.gain.setValueAtTime(0.4, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

    noise.start(time);
    noise.stop(time + 0.15);
  }

  playHiHat(time, closed = true) {
    const noise = this.ctx.createBufferSource();
    const buffer = this.ctx.createBuffer(
      1,
      this.ctx.sampleRate * 0.1,
      this.ctx.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < buffer.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    noise.buffer = buffer;

    const gain = this.createGain(0);
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = closed ? 8000 : 4000;

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);

    gain.gain.setValueAtTime(closed ? 0.2 : 0.15, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

    noise.start(time);
    noise.stop(time + 0.05);
  }

  // Pad atmosférico adicional
  startPad() {
    const osc1 = this.createOsc("sawtooth", 110);
    const osc2 = this.createOsc("sawtooth", 111);
    const gain = this.createGain(0.12);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.master);

    osc1.start();
    osc2.start();
    this.pad = { osc1, osc2 };
  }

  stopPad() {
    if (this.pad) {
      this.pad.osc1.stop();
      this.pad.osc2.stop();
      this.pad = null;
    }
  }

  // Sweep de filtro controlado
  sweepFilter(duration = 4, from = 800, to = 3000) {
    const now = this.ctx.currentTime;
    this.filter.frequency.cancelScheduledValues(now);
    this.filter.frequency.setValueAtTime(from, now);
    this.filter.frequency.linearRampToValueAtTime(to, now + duration);
  }

  // Activar modo épico (más rápido y agresivo)
  activateEpicMode() {
    this.tempo = 150;
    this.sweepFilter(2, 600, 6000);
    // Aumentar feedback del delay
    this.delayFeedback.gain.linearRampToValueAtTime(
      0.4,
      this.ctx.currentTime + 1,
    );
  }

  // Main loop
  start() {
    if (this.isPlaying) return;
    this.isPlaying = true;

    // Arrancar LFO si no está running
    if (this.lfo.context && this.lfo.context.state === "running") {
      try {
        this.lfo.start();
      } catch (e) {}
    } else {
      // Si no se puede, lo creamos de nuevo (el contexto puede haberse suspendido)
      this.lfo = this.ctx.createOscillator();
      this.lfo.frequency.value = 0.2;
      this.lfo.type = "sine";
      this.lfoGain = this.ctx.createGain();
      this.lfoGain.gain.value = 600;
      this.lfo.connect(this.lfoGain);
      this.lfoGain.connect(this.filter.frequency);
      this.lfo.start();
    }

    this.startPad();
    this.sweepFilter(4, 800, 3000);

    const beat = 60 / this.tempo;
    let nextTime = this.ctx.currentTime + 0.1;
    let barCount = 0;

    const loop = () => {
      if (!this.isPlaying) return;

      // Cada 4 compases (16 beats) cambiamos algo
      if (barCount % 4 === 0) {
        // Variación en la percusión o melodía
        this.playLead(nextTime + beat * 2); // variante desplazada
      }

      this.playBassPattern(nextTime);
      this.playLead(nextTime);
      this.playArp(nextTime);

      // Batería
      for (let i = 0; i < 4; i++) {
        this.playKick(nextTime + i * beat);
        if (i % 2 === 0) this.playSnare(nextTime + i * beat + beat / 2);
        if (i % 1 === 0) this.playHiHat(nextTime + i * beat + beat / 4, true);
        if (i % 2 === 1)
          this.playHiHat(nextTime + i * beat + beat * 0.75, false);
      }

      nextTime += beat * 4;
      barCount++;

      // Programar siguiente loop
      this.loopTimeout = setTimeout(loop, beat * 4000);
    };

    loop();
  }

  stop() {
    this.isPlaying = false;
    clearTimeout(this.loopTimeout);
    this.stopPad();
    // Parar LFO
    try {
      this.lfo.stop();
    } catch (e) {}
  }
}
