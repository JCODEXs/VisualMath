class SoundEngine {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  }

  createOsc(type = "sine", frequency = 440) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    return osc;
  }

  createGain(volume = 0.3) {
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    return gain;
  }

  playTone({ type = "sine", frequency = 440, duration = 0.3, volume = 0.4 }) {
    const osc = this.createOsc(type, frequency);
    const gain = this.createGain(volume);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }
  playReward() {
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.4);

    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.4);
  }
  playBackgroundLoop() {
    const notes = [220, 330, 440, 550];
    let index = 0;

    setInterval(() => {
      this.playTone({
        type: "triangle",
        frequency: notes[index % notes.length],
        duration: 0.5,
        volume: 0.1,
      });

      index++;
    }, 600);
  }
}
