
// Simple Arcade Audio Synthesizer
// We use this to avoid needing external assets

let audioCtx: AudioContext | null = null;

const initAudio = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
};

const playTone = (freq: number, type: OscillatorType, duration: number, vol: number = 0.1) => {
  try {
    const ctx = initAudio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    // Audio context might not be ready
  }
};

const playNoise = (duration: number) => {
    try {
        const ctx = initAudio();
        const bufferSize = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
      
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
      
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
        
        noise.connect(gain);
        gain.connect(ctx.destination);
        noise.start();
    } catch (e) {
        // Audio context error
    }
};

export const AudioService = {
  shoot: (type: 'pistol' | 'machinegun' | 'shotgun' | 'sniper' | 'grenade' | 'rocket' | 'quantum') => {
    switch (type) {
        case 'pistol': 
            playTone(440, 'square', 0.1); 
            playTone(220, 'sawtooth', 0.1); 
            break;
        case 'machinegun': playTone(300, 'square', 0.05, 0.05); break;
        case 'shotgun': playNoise(0.2); break;
        case 'sniper': playTone(880, 'triangle', 0.3, 0.2); break;
        case 'grenade': playTone(150, 'sawtooth', 0.3); break;
        case 'rocket': 
            playTone(100, 'sawtooth', 0.5); 
            playNoise(0.1); 
            break;
        case 'quantum':
            playTone(50, 'sine', 1.0);
            playTone(1000, 'sine', 0.5);
            playNoise(1.0);
            break;
    }
  },
  jump: () => {
    try {
        const ctx = initAudio();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(300, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
    } catch (e) {}
  },
  hit: () => {
      playTone(100, 'sawtooth', 0.1);
      playNoise(0.05);
  },
  explosion: () => {
      playNoise(0.4);
      playTone(50, 'square', 0.4);
  },
  switch: () => {
      playTone(800, 'sine', 0.05);
  }
};
