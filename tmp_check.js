    const { useState, useEffect, useRef } = React;

    const DEFAULT_PRESETS = [
      { label: 'SPARK', settings: null },
      { label: 'WARP', settings: null },
      { label: 'NIGHT', settings: null }
    ];

    function openLogoDB() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('vj-cyberdb', 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('assets')) {
            db.createObjectStore('assets');
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    async function saveLogoImage(dataUrl) {
      const db = await openLogoDB();
      const tx = db.transaction('assets', 'readwrite');
      tx.objectStore('assets').put(dataUrl, 'logo');
      return tx.complete;
    }

    async function loadLogoImage() {
      const db = await openLogoDB();
      return new Promise((resolve) => {
        const tx = db.transaction('assets', 'readonly');
        const request = tx.objectStore('assets').get('logo');
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      });
    }

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }

    const SAMPLE_RATE = 44100;
    const BAND_RANGES = {
      bass: [20, 150],
      mid: [150, 2000],
      high: [2000, 20000]
    };

    function averageFrequency(data, sampleRate, startHz, endHz) {
      const binCount = data.length;
      const nyquist = sampleRate / 2;
      const startIndex = Math.floor((startHz / nyquist) * binCount);
      const endIndex = Math.min(binCount - 1, Math.floor((endHz / nyquist) * binCount));
      let sum = 0;
      let count = 0;
      for (let i = startIndex; i <= endIndex; i += 1) {
        sum += data[i];
        count += 1;
      }
      return count ? sum / count / 255 : 0;
    }

    function App() {
      const canvasRef = useRef(null);
      const audioRef = useRef(null);
      const videoRef = useRef(null);
      const animationRef = useRef(null);
      const audioContextRef = useRef(null);
      const analyserRef = useRef(null);
      const sourceRef = useRef(null);
      const dataRef = useRef(null);
      const bandStateRef = useRef({ bass: 0, mid: 0, high: 0 });
      const lastFrameRef = useRef(0);
      const lastBpmTapRef = useRef([]);
      const fpsTimerRef = useRef(0);
      const [uiVisible, setUiVisible] = useState(true);
      const [paused, setPaused] = useState(false);
      const [fullscreen, setFullscreen] = useState(false);
      const [selectedStyle, setSelectedStyle] = useState('Hypnotic Tunnel');
      const [activeEffects, setActiveEffects] = useState({ aberration: true, vhs: true, strobe: false, scanlines: true, vignette: true, noise: false, pulse: true });
      const [animationSettings, setAnimationSettings] = useState({ tickerWave: true, titlePulse: true, logoPulse: true, backgroundDrift: true });
      const [selectedFont, setSelectedFont] = useState('Orbitron');
      const [selectedScheme, setSelectedScheme] = useState('Cyber');
      const [frameRate, setFrameRate] = useState(60);
      const [trackTicker, setTrackTicker] = useState('LIVE FROM THE UNDERGROUND // MIX 042');
      const [currentTrack, setCurrentTrack] = useState('UNKNOWN PROJECTION SET');
      const [logoData, setLogoData] = useState(null);
      const [logoMeta, setLogoMeta] = useState({ scale: 0.9, opacity: 0.84, x: 0, y: 0, glitch: true, glow: true, glowColor: '#5bf18e', glowSize: 20 });
      const [audioMode, setAudioMode] = useState('microphone');
      const [audioFileUrl, setAudioFileUrl] = useState('');
      const [audioUrl, setAudioUrl] = useState('');
      const [bandSettings, setBandSettings] = useState({ bass: 1.4, mid: 1.0, high: 1.2, bassSmooth: true, midSmooth: true, highSmooth: true });
      const [dispBandLevels, setDispBandLevels] = useState({ bass: 0, mid: 0, high: 0 });
      const [bpmState, setBpmState] = useState({ bpm: 128, lastTap: null, autoStrobe: false });
      const [strobeStrength, setStrobeStrength] = useState(0.5);
      const [presets, setPresets] = useState(DEFAULT_PRESETS);
      const [status, setStatus] = useState('READY // hook audio, load logo, and launch the dashboard.');
      const [themeAccent, setThemeAccent] = useState('toxic-green');
      const [externalVideoSource, setExternalVideoSource] = useState('');
      const [logoDropActive, setLogoDropActive] = useState(false);

      const styleOptions = ['Hypnotic Tunnel', 'Cyber Grid', 'Particle Swarm', 'External Media'];
      const fontOptions = ['Inter', 'Orbitron', 'Exo 2', 'Saira Condensed', 'Audiowide'];
      const fontFamilyStack = {
        'Inter': 'Inter, ui-sans-serif, system-ui, sans-serif',
        'Orbitron': 'Orbitron, ui-sans-serif, system-ui, sans-serif',
        'Exo 2': 'Exo 2, ui-sans-serif, system-ui, sans-serif',
        'Saira Condensed': 'Saira Condensed, ui-sans-serif, system-ui, sans-serif',
        'Audiowide': 'Audiowide, ui-sans-serif, system-ui, sans-serif'
      };
      const accentPalette = {
        'toxic-green': { bg: '#07080f', accent: '#6cffb8', alt: '#ff7e18' },
        'neon-orange': { bg: '#09070d', accent: '#ff8c3d', alt: '#6bff9e' }
      };

      const COLOR_SCHEMES = {
        'Cyber': { bg: '#05080f', accent: '#6cffb8', alt: '#ff7e18', glow: '#6cffb8' },
        'Void': { bg: '#070612', accent: '#8ab4ff', alt: '#b28cff', glow: '#8ab4ff' },
        'Acid': { bg: '#081006', accent: '#b7ff4d', alt: '#00ffd1', glow: '#b7ff4d' },
        'Blood': { bg: '#12060a', accent: '#ff5a7a', alt: '#ffb86b', glow: '#ff5a7a' }
      };

      const setStatusMessage = (text) => {
        setStatus(text);
      };

      const loadPresetSlot = (slot) => {
        const saved = JSON.parse(localStorage.getItem('vj-presets') || '[]');
        if (saved[slot]) {
          const settings = saved[slot];
          setSelectedStyle(settings.selectedStyle);
          setActiveEffects(settings.activeEffects);
          setAnimationSettings(settings.animationSettings || animationSettings);
          setSelectedFont(settings.selectedFont || selectedFont);
          setFrameRate(settings.frameRate);
          setTrackTicker(settings.trackTicker);
          setCurrentTrack(settings.currentTrack);
          setLogoMeta(settings.logoMeta);
          setBandSettings(settings.bandSettings);
          setBpmState(settings.bpmState);
          setStatusMessage(`Loaded preset ${slot + 1}: ${settings.label}`);
        } else {
          setStatusMessage(`Preset ${slot + 1} is empty.`);
        }
      };

      const savePresetSlot = (slot) => {
        const saved = JSON.parse(localStorage.getItem('vj-presets') || '[]');
        saved[slot] = {
          label: presets[slot].label,
          selectedStyle,
          activeEffects,
          animationSettings,
          selectedFont,
          frameRate,
          trackTicker,
          currentTrack,
          logoMeta,
          bandSettings,
          bpmState
        };
        localStorage.setItem('vj-presets', JSON.stringify(saved));
        const updated = presets.slice();
        updated[slot] = { ...updated[slot], settings: saved[slot] };
        setPresets(updated);
        setStatusMessage(`Saved preset ${slot + 1}: ${updated[slot].label}`);
      };

      const handleLogoUpload = async (file) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
          const dataUrl = event.target.result;
          setLogoData(dataUrl);
          await saveLogoImage(dataUrl);
          setStatusMessage('DJ logo stored in IndexedDB and ready.');
        };
        reader.readAsDataURL(file);
      };

      const loadStoredLogo = async () => {
        const stored = await loadLogoImage();
        if (stored) {
          setLogoData(stored);
          setStatusMessage('Cached logo loaded from IndexedDB.');
        }
      };

      const teardownAudio = () => {
        if (audioContextRef.current) {
          audioContextRef.current.close().catch(() => {});
          audioContextRef.current = null;
          analyserRef.current = null;
          sourceRef.current = null;
        }
      };

      const createAudioGraph = async () => {
        try {
          teardownAudio();
          const context = new (window.AudioContext || window.webkitAudioContext)();
          const analyser = context.createAnalyser();
          analyser.fftSize = 2048;
          analyser.smoothingTimeConstant = 0.85;
          const sourceNode = audioRef.current;

          if (audioMode === 'microphone') {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            sourceRef.current = context.createMediaStreamSource(stream);
            sourceRef.current.connect(analyser);
            analyser.connect(context.destination);
            setStatusMessage('Microphone input active.');
          } else {
            if (!sourceNode) return;
            analyser.disconnect();
            sourceRef.current = context.createMediaElementSource(sourceNode);
            sourceRef.current.connect(analyser);
            analyser.connect(context.destination);
            sourceNode.loop = true;
            try { await sourceNode.play(); } catch (err) {
              console.warn(err);
            }
            setStatusMessage('Audio source ready.');
          }
          audioContextRef.current = context;
          analyserRef.current = analyser;
          dataRef.current = new Uint8Array(analyser.frequencyBinCount);
        } catch (err) {
          console.warn(err);
          setStatusMessage('Audio engine could not connect. Check mic permission or audio source.');
        }
      };

      useEffect(() => {
        loadStoredLogo();

        const handleKey = (event) => {
          if (event.key === 'f' || event.key === 'F') {
            if (!document.fullscreenElement) {
              document.documentElement.requestFullscreen();
              setFullscreen(true);
            } else {
              document.exitFullscreen();
              setFullscreen(false);
            }
          }
          if (event.key === ' ') {
            event.preventDefault();
            setPaused((value) => !value);
          }
          if (event.key === 'Escape') {
            setUiVisible(true);
          }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
      }, []);

      useEffect(() => {
        createAudioGraph();
        return () => teardownAudio();
      }, [audioMode, audioFileUrl, audioUrl]);

      useEffect(() => {
        let lastTick = performance.now();
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        const resize = () => {
          const parent = canvas.parentElement;
          if (!parent) return;
          const { width, height } = parent.getBoundingClientRect();
          const dpr = window.devicePixelRatio || 1;
          canvas.width = Math.floor(width * dpr);
          canvas.height = Math.floor(height * dpr);
          canvas.style.width = `${Math.floor(width)}px`;
          canvas.style.height = `${Math.floor(height)}px`;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };

        resize();
        window.addEventListener('resize', resize);

        const drawScene = (time) => {
          const width = canvas.clientWidth;
          const height = canvas.clientHeight;
          const now = time / 1000;
          ctx.clearRect(0, 0, width, height);
          ctx.save();

          const accent = activeColors || accentPalette[themeAccent] || accentPalette['toxic-green'];
          const hexToRgba = (hex, a) => {
            const h = hex.replace('#','');
            const bigint = parseInt(h.length===3?h.split('').map(c=>c+c).join(''):h,16);
            const r = (bigint >> 16) & 255;
            const g = (bigint >> 8) & 255;
            const b = bigint & 255;
            return `rgba(${r},${g},${b},${a})`;
          };
          const fontFamily = fontFamilyStack[selectedFont] || fontFamilyStack.Inter;
          const pulseFactor = activeEffects.pulse ? 0.82 + Math.sin(now * 2.6) * 0.18 : 1;
          const motionDrift = animationSettings.backgroundDrift ? Math.sin(now * 0.36) * 0.15 : 0;
          const textFit = (text, maxWidth, maxSize, minSize, weight) => {
            let size = maxSize;
            do {
              ctx.font = `${weight} ${size}px ${fontFamily}`;
              if (ctx.measureText(text).width <= maxWidth) break;
              size -= 1;
            } while (size >= minSize);
            return Math.max(size, minSize);
          };
          const wrapText = (text, maxWidth, size, weight) => {
            ctx.font = `${weight} ${size}px ${fontFamily}`;
            const words = text.split(' ');
            const lines = [];
            let current = '';
            for (const word of words) {
              const candidate = current ? `${current} ${word}` : word;
              if (ctx.measureText(candidate).width <= maxWidth) {
                current = candidate;
              } else {
                if (current) lines.push(current);
                current = word;
              }
            }
            if (current) lines.push(current);
            return lines.slice(0, 2);
          };

          const bassTarget = analyserRef.current ? averageFrequency(dataRef.current, SAMPLE_RATE, ...BAND_RANGES.bass) : 0;
          const midTarget = analyserRef.current ? averageFrequency(dataRef.current, SAMPLE_RATE, ...BAND_RANGES.mid) : 0;
          const highTarget = analyserRef.current ? averageFrequency(dataRef.current, SAMPLE_RATE, ...BAND_RANGES.high) : 0;

          const smoothValue = (current, target, enabled) => enabled ? current * 0.82 + target * 0.18 : target;
          const bass = smoothValue(bandStateRef.current.bass, bassTarget * bandSettings.bass, bandSettings.bassSmooth);
          const mid = smoothValue(bandStateRef.current.mid, midTarget * bandSettings.mid, bandSettings.midSmooth);
          const high = smoothValue(bandStateRef.current.high, highTarget * bandSettings.high, bandSettings.highSmooth);
          bandStateRef.current = { bass, mid, high };
          if (performance.now() - fpsTimerRef.current > 120) {
            setDispBandLevels({ bass, mid, high });
            fpsTimerRef.current = performance.now();
          }

          const intensity = bass * 1.2;
          const rotationOffset = now * (0.4 + mid * 1.6);
          const particleAlpha = clamp(0.16 + high * 0.28, 0.16, 0.85);

          const flashAlpha = activeEffects.strobe ? clamp(Math.sin(now * (bpmState.autoStrobe ? bpmState.bpm / 60 : bpmState.bpm / 60) * Math.PI) * 0.5 + 0.5, 0, 1) * strobeStrength : 0;

          const drawFlash = () => {
            if (!activeEffects.strobe) return;
            ctx.save();
            ctx.fillStyle = `rgba(255,255,255,${flashAlpha * 0.06})`;
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
          };

          const drawBackground = () => {
            if (selectedStyle === 'External Media' && videoRef.current && videoRef.current.readyState >= 2) {
              ctx.drawImage(videoRef.current, 0, 0, width, height);
              return;
            }
            if (selectedStyle === 'Hypnotic Tunnel') {
              const columns = 14;
              const centerX = width / 2 + motionDrift * 24;
              const centerY = height / 2;
              for (let i = 0; i < columns; i += 1) {
                const progress = i / columns;
                const z = ((progress + now * 0.4) % 1) * 0.9 + 0.08;
                const sizeX = width * (0.45 - z * 0.4);
                const sizeY = height * (0.2 + z * 0.35);
                const offset = Math.sin(now * 1.5 + progress * 4.2) * 140 * bass;
                ctx.strokeStyle = hexToRgba(accent.accent, 0.16 + 0.12 * (1 - z));
                ctx.lineWidth = (1 + mid * 2) * pulseFactor;
                ctx.beginPath();
                ctx.moveTo(centerX - sizeX + offset, centerY - sizeY);
                ctx.lineTo(centerX + sizeX + offset, centerY - sizeY);
                ctx.lineTo(centerX + sizeX - offset, centerY + sizeY);
                ctx.lineTo(centerX - sizeX - offset, centerY + sizeY);
                ctx.closePath();
                ctx.stroke();
              }
            } else if (selectedStyle === 'Cyber Grid') {
              const horizon = height * (0.38 + motionDrift * 0.06);
              const pitch = 0.8 + bass * 0.28;
              const depth = 18;
              ctx.strokeStyle = hexToRgba(accent.alt || accent.accent, 0.18 + bass * 0.12);
              ctx.lineWidth = 1 * pulseFactor;
              for (let i = 0; i < depth; i += 1) {
                const z = 1 - i / depth;
                const lineY = horizon + z * height * 0.7;
                const offset = Math.sin(now * 0.8 + i * 0.6) * 18 * bass;
                ctx.beginPath();
                ctx.moveTo(0, lineY);
                ctx.lineTo(width, lineY);
                ctx.stroke();
                const cols = 12;
                for (let ix = 0; ix <= cols; ix += 1) {
                  const x = (ix / cols) * width;
                  const warp = Math.pow(z, 1.8) * 260;
                  const px = centerLine(x, width, z, offset);
                  ctx.beginPath();
                  ctx.moveTo(px, lineY);
                  ctx.lineTo(width / 2 + (px - width / 2) * 0.82, horizon + (lineY - horizon) * 0.1);
                  ctx.stroke();
                }
              }
              function centerLine(x, w, z, offset) {
                const spread = (x - w / 2) * (1 + 0.85 * z);
                return w / 2 + spread * (0.35 + bass * 0.5) + offset * z;
              }
            } else {
              const count = 220;
              for (let i = 0; i < count; i += 1) {
                const progress = i / count;
                const radius = 2 + Math.sin(progress * Math.PI * 4 + now * 1.8) * 1.3;
                const angle = progress * Math.PI * 2 + now * (0.17 + mid * 0.3) + motionDrift * 2.4;
                const radiusOffset = 160 + progress * 360 + bass * 100;
                const x = width / 2 + Math.cos(angle) * radiusOffset;
                const y = height / 2 + Math.sin(angle) * radiusOffset * 0.42;
                ctx.fillStyle = hexToRgba(accent.accent, particleAlpha * (0.14 + progress * 0.18));
                ctx.beginPath();
                ctx.arc(x, y, radius * (1 + high * 0.9), 0, Math.PI * 2);
                ctx.fill();
              }
            }
          };

          const drawLogoLayer = () => {
            if (!logoData) return;
            const img = new Image();
            img.src = logoData;
            const pulseScale = animationSettings.logoPulse ? 1 + Math.sin(now * 2.1) * 0.02 : 1;
            const baseSize = Math.min(width, height) * 0.22 * logoMeta.scale * pulseScale;
            const x = width / 2 + logoMeta.x * width * 0.16;
            const y = height / 2 + logoMeta.y * height * 0.12;
            ctx.save();
            ctx.globalAlpha = logoMeta.opacity;
            if (logoMeta.glow) {
              ctx.shadowColor = logoMeta.glowColor;
              ctx.shadowBlur = 18 + bass * logoMeta.glowSize * pulseScale;
            }
            if (logoMeta.glitch && bass > 0.3) {
              for (let i = 0; i < 3; i += 1) {
                const sliceHeight = (img.height / 6) * (0.7 + Math.random() * 0.3);
                const yOffset = y + (Math.random() - 0.5) * 20 * bass * (i + 1);
                const xOffset = ((Math.random() - 0.5) * 24) * bass * (i + 1);
                ctx.drawImage(img, 0, i * sliceHeight, img.width, sliceHeight, x - baseSize / 2 + xOffset, yOffset, baseSize, sliceHeight * (baseSize / img.width));
              }
            }
            ctx.drawImage(img, x - baseSize / 2, y - baseSize / 2, baseSize, baseSize);
            ctx.restore();
          };

          const drawOverlay = () => {
            ctx.save();
            const gradient = ctx.createRadialGradient(width * 0.8, height * 0.22, 0, width * 0.8, height * 0.22, width * 0.6);
            gradient.addColorStop(0, 'rgba(94,255,169,0.14)');
            gradient.addColorStop(0.65, 'rgba(0,0,0,0.0)');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);
            ctx.restore();

            ctx.save();
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = 0.08;
            for (let y = 0; y < height; y += 6) {
              ctx.fillRect(0, y, width, 1);
            }
            ctx.restore();

            if (selectedStyle !== 'External Media') {
              ctx.save();
              ctx.strokeStyle = `rgba(255,255,255,${0.04 + bass * 0.08})`;
              ctx.lineWidth = 1;
              ctx.setLineDash([7, 6]);
              ctx.strokeRect(16, 16, width - 32, height - 32);
              ctx.restore();
            }

            if (activeEffects.scanlines) {
              ctx.save();
              ctx.globalAlpha = 0.16 + bass * 0.08;
              ctx.fillStyle = '#ffffff';
              for (let y = 0; y < height; y += 4) {
                ctx.fillRect(0, y, width, 1);
              }
              ctx.restore();
            }
            if (activeEffects.vhs) {
              ctx.save();
              ctx.globalAlpha = 0.08 + Math.sin(now * 14) * 0.05;
              ctx.fillStyle = '#fff';
              for (let i = 0; i < 22; i += 1) {
                const y = Math.random() * height;
                const h = 1 + Math.random() * 2;
                ctx.fillRect(0, y, width, h);
              }
              ctx.restore();
              ctx.save();
              ctx.lineWidth = 1;
              ctx.strokeStyle = `rgba(255,255,255,${0.08 + bass * 0.1})`;
              const glitchOffset = Math.sin(now * 5) * 8 * high;
              ctx.beginPath();
              ctx.moveTo(0, height * 0.18 + glitchOffset);
              ctx.lineTo(width, height * 0.18 - glitchOffset);
              ctx.moveTo(0, height * 0.52 - glitchOffset);
              ctx.lineTo(width, height * 0.52 + glitchOffset);
              ctx.stroke();
              ctx.restore();
            }
            if (activeEffects.vignette) {
              ctx.save();
              const vig = ctx.createRadialGradient(width / 2, height / 2, width * 0.2, width / 2, height / 2, width * 0.92);
              vig.addColorStop(0, 'rgba(0,0,0,0)');
              vig.addColorStop(1, 'rgba(0,0,0,0.56)');
              ctx.fillStyle = vig;
              ctx.globalCompositeOperation = 'multiply';
              ctx.fillRect(0, 0, width, height);
              ctx.restore();
            }
            if (activeEffects.noise) {
              ctx.save();
              ctx.globalAlpha = 0.08;
              ctx.fillStyle = '#ffffff';
              for (let n = 0; n < 900; n += 1) {
                const rx = Math.random() * width;
                const ry = Math.random() * height;
                ctx.fillRect(rx, ry, 1, 1);
              }
              ctx.restore();
            }
          };

          const drawChromatic = () => {
            if (!activeEffects.aberration) return;
            const temp = document.createElement('canvas');
            temp.width = width;
            temp.height = height;
            const tempCtx = temp.getContext('2d');
            tempCtx.drawImage(canvas, 0, 0, width, height);
            ctx.clearRect(0, 0, width, height);
            const shift = 8 + high * 14;
            ctx.globalAlpha = 0.85;
            ctx.drawImage(temp, shift * 0.18, 0, width, height);
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.26;
            ctx.fillStyle = '#ff6d2e';
            ctx.drawImage(temp, -shift * 0.28, 0, width, height);
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = 0.28;
            ctx.fillStyle = '#67ffbf';
            ctx.drawImage(temp, 0, shift * 0.18, width, height);
            ctx.globalCompositeOperation = 'source-over';
          };

          const drawHud = () => {
            const fitWidth = width - 44;
            const topText = trackTicker.toUpperCase();
            const topSize = textFit(topText, fitWidth, 20, 12, '600');
            const topLines = wrapText(topText, fitWidth, topSize, '600');
            ctx.save();
            ctx.fillStyle = `rgba(200, 255, 225, ${animationSettings.tickerWave ? 0.96 + Math.sin(now * 2.1) * 0.04 : 0.96})`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            topLines.forEach((line, index) => {
              ctx.font = `600 ${topSize}px ${fontFamily}`;
              ctx.fillText(line, 22, 20 + index * (topSize + 4));
            });
            ctx.restore();

            const titleMax = width - 44;
            const titleSize = textFit(currentTrack, titleMax, 34, 16, '700');
            const titleLines = wrapText(currentTrack, titleMax, titleSize, '700');
            const titleTop = height - 46 - titleLines.length * (titleSize + 6);
            ctx.save();
            ctx.fillStyle = `rgba(247, 255, 204, ${animationSettings.titlePulse ? 0.94 + Math.sin(now * 1.8) * 0.06 : 0.94})`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            titleLines.forEach((line, index) => {
              ctx.font = `700 ${titleSize}px ${fontFamily}`;
              ctx.fillText(line, 22, titleTop + index * (titleSize + 6));
            });
            ctx.restore();

            ctx.save();
            ctx.fillStyle = 'rgba(255,255,255,0.24)';
            ctx.font = `500 12px ${fontFamily}`;
            ctx.fillText(`BASS ${Math.round(bass * 100)} — MID ${Math.round(mid * 100)} — HIGH ${Math.round(high * 100)}`, 22, height - 18);
            ctx.restore();
          };

          drawBackground();
          drawOverlay();
          drawLogoLayer();
          drawHud();
          if (activeEffects.strobe) drawFlash();
          if (activeEffects.aberration) drawChromatic();
          ctx.restore();
        };

        const animate = (time) => {
          if (!paused) {
            if (analyserRef.current) analyserRef.current.getByteFrequencyData(dataRef.current);
            const interval = 1000 / frameRate;
            if (time - lastFrameRef.current >= interval) {
              drawScene(time);
              lastFrameRef.current = time;
            }
          }
          animationRef.current = requestAnimationFrame(animate);
        };
        animationRef.current = requestAnimationFrame(animate);
        return () => {
          cancelAnimationFrame(animationRef.current);
          window.removeEventListener('resize', resize);
        };
      }, [selectedStyle, activeEffects, animationSettings, selectedFont, frameRate, paused, themeAccent, trackTicker, currentTrack, logoData, logoMeta, audioMode, audioFileUrl, audioUrl, bpmState, bandSettings, strobeStrength]);

      const handleAudioFileChange = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        setAudioFileUrl(url);
        setAudioMode('upload');
        setStatusMessage('Loaded local mix. Starting audio engine...');
      };

      const handleAudioUrlAccept = () => {
        setAudioUrl(audioUrl);
        setAudioMode('url');
        setStatusMessage('Using external audio URL. Press play if needed.');
      };

      const handleBpmTap = () => {
        const now = performance.now();
        const taps = [now, ...lastBpmTapRef.current].slice(0, 10);
        lastBpmTapRef.current = taps;
        if (taps.length < 2) return;
        const intervals = taps.slice(0, taps.length - 1).map((t, index) => taps[index] - taps[index + 1]);
        const averageInterval = intervals.reduce((sum, i) => sum + i, 0) / intervals.length;
        const bpm = clamp(Math.round(60000 / averageInterval), 60, 220);
        setBpmState((prev) => ({ ...prev, bpm, lastTap: bpm }));
        setStatusMessage(`BPM tap ${bpm} detected.`);
      };

      const logStyleClass = (style) => selectedStyle === style ? 'ring-1 ring-cyan-400/30 bg-cyan-500/8' : 'bg-slate-900/80 hover:bg-slate-800';
      const activeFontFamily = fontFamilyStack[selectedFont] || fontFamilyStack.Inter;
      const activeColors = COLOR_SCHEMES[selectedScheme] || COLOR_SCHEMES.Cyber;

      return (
        React.createElement('div', { className: 'min-h-screen text-slate-100', style: { fontFamily: activeFontFamily, background: activeColors.bg, ['--accent']: activeColors.accent, ['--alt']: activeColors.alt } },
          React.createElement('div', { className: 'max-w-[1700px] mx-auto px-4 py-4' },
            React.createElement('header', { className: 'flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-4' },
              React.createElement('div', { className: 'space-y-2' },
                React.createElement('div', { className: 'flex items-center gap-3' },
                  React.createElement('span', { className: 'w-3 h-3 rounded-full bg-[#76ffb3] ring-2 ring-[#76ffb3]/30' }),
                  React.createElement('div', null,
                    React.createElement('p', { className: 'text-xs uppercase tracking-[0.3em] text-[#7df9b2]' }, 'CYBER VJ DASHBOARD'),
                    React.createElement('h1', { className: 'text-2xl md:text-3xl font-semibold text-white' }, 'Generative VJ Cyber-Dashboard')
                  )
                ),
                React.createElement('p', { className: 'text-sm text-slate-400 max-w-2xl' }, 'Ultra-sleek realtime canvas engine with frequency band mapping, logo layering, FX rack, and OBS-ready live mode for techno DJs.')
              ),
              React.createElement('div', { className: 'space-y-2 text-right' },
                React.createElement('div', { className: 'inline-flex items-center gap-2 rounded-full bg-slate-900/80 px-3 py-2 text-xs uppercase tracking-[0.2em] text-slate-300' },
                  React.createElement('span', { className: 'inline-flex items-center justify-center w-4 h-4 text-cyan-400' }, '⚡'),
                  'Realtime Engine'
                ),
                React.createElement('p', { className: 'text-xs text-slate-500' }, status)
              )
            ),
            React.createElement('div', { className: `grid gap-4 lg:grid-cols-[1.55fr_0.95fr] ${uiVisible ? 'show-ui' : 'hidden-ui'}` },
              React.createElement('div', { className: 'space-y-4' },
                React.createElement('div', { className: 'relative rounded-3xl overflow-hidden border border-white/10 glass-panel aspect-[16/9]' },
                  React.createElement('canvas', { ref: canvasRef, className: 'absolute inset-0 w-full h-full bg-black' }),
                  React.createElement('video', {
                    ref: videoRef,
                    src: externalVideoSource,
                    className: 'hidden',
                    muted: true,
                    loop: true,
                    playsInline: true
                  }),
                  React.createElement('audio', {
                    ref: audioRef,
                    className: 'hidden',
                    controls: false,
                    hidden: true,
                    src: audioMode === 'upload' ? audioFileUrl : audioMode === 'url' ? audioUrl : undefined,
                    loop: true
                  }),
                  React.createElement('div', { className: 'absolute inset-x-0 top-4 px-5' },
                    React.createElement('div', { className: 'marquee h-6 overflow-hidden rounded-full bg-black/40 px-3 border border-cyan-400/15' },
                      React.createElement('span', null, trackTicker.toUpperCase(), ' // LIVE FROM THE UNDERGROUND // MIX 042 // ')
                    )
                  ),
                  React.createElement('div', { className: 'absolute bottom-6 left-6 space-y-2' },
                    React.createElement('p', { className: 'text-sm font-semibold uppercase tracking-[0.3em] text-cyan-200' }, currentTrack),
                    React.createElement('p', { className: 'text-xs text-slate-300 max-w-xs' }, 'Broadcast overlay optimized for OBS and club visuals with adaptive glow and techno typography.')
                  ),
                  React.createElement('div', { className: 'absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_right,_rgba(94,255,169,0.12),_transparent_25%),radial-gradient(circle_at_bottom_left,_rgba(255,126,33,0.12),_transparent_22%)]' }),
                  activeEffects.strobe && React.createElement('div', { className: 'strobe-flash' })
                ),
                React.createElement('div', { className: 'grid gap-4 lg:grid-cols-2' },
                  React.createElement('div', { className: 'p-4 rounded-3xl glass-panel border border-white/10' },
                    React.createElement('p', { className: 'control-heading mb-3' }, 'Live Overlays'),
                    React.createElement('label', { className: 'block text-sm font-medium text-slate-300 mb-2' }, 'Ticker Text'),
                    React.createElement('textarea', {
                      value: trackTicker,
                      onChange: (e) => setTrackTicker(e.target.value),
                      rows: 2,
                      className: 'w-full rounded-2xl border border-slate-800 bg-slate-950/90 px-3 py-3 text-sm text-slate-200 focus:border-cyan-400 outline-none'
                    }),
                    React.createElement('label', { className: 'block text-sm font-medium text-slate-300 mt-4 mb-2' }, 'Current Track'),
                    React.createElement('input', {
                      type: 'text',
                      value: currentTrack,
                      onChange: (e) => setCurrentTrack(e.target.value),
                      className: 'w-full rounded-2xl border border-slate-800 bg-slate-950/90 px-3 py-3 text-sm text-slate-200 focus:border-cyan-400 outline-none'
                    }),
                    React.createElement('label', { className: 'block text-sm font-medium text-slate-300 mt-4 mb-2' }, 'Font Family'),
                    React.createElement('select', {
                      value: selectedFont,
                      onChange: (e) => setSelectedFont(e.target.value),
                      className: 'w-full rounded-2xl border border-slate-800 bg-slate-950/90 px-3 py-3 text-sm text-slate-200 focus:border-cyan-400 outline-none'
                    },
                      fontOptions.map((font) => (
                        React.createElement('option', { key: font, value: font }, font)
                      ))
                    ),
                    React.createElement('label', { className: 'block text-sm font-medium text-slate-300 mt-4 mb-2' }, 'Color Scheme'),
                    React.createElement('select', {
                      value: selectedScheme,
                      onChange: (e) => setSelectedScheme(e.target.value),
                      className: 'w-full rounded-2xl border border-slate-800 bg-slate-950/90 px-3 py-3 text-sm text-slate-200 focus:border-cyan-400 outline-none'
                    },
                      Object.keys(COLOR_SCHEMES).map((s) => (
                        React.createElement('option', { key: s, value: s }, s)
                      ))
                    ),
                    React.createElement('div', { className: 'grid grid-cols-2 gap-2 mt-4' },
                      Object.entries(animationSettings).map(([key, enabled]) => (
                        React.createElement('label', { key, className: 'inline-flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-950/90 px-3 py-3 text-sm text-slate-300' },
                          React.createElement('input', {
                            type: 'checkbox',
                            checked: enabled,
                            onChange: (e) => setAnimationSettings((prev) => ({ ...prev, [key]: e.target.checked }))
                          }),
                          key === 'tickerWave' ? 'Ticker Wave' : key === 'titlePulse' ? 'Title Pulse' : key === 'logoPulse' ? 'Logo Pulse' : 'Background Drift'
                        )
                      ))
                    )
                  ),
                  React.createElement('div', { className: 'p-4 rounded-3xl glass-panel border border-white/10' },
                    React.createElement('p', { className: 'control-heading mb-3' }, 'Status Meter'),
                    React.createElement('div', { className: 'grid grid-cols-3 gap-3' },
                      ['bass', 'mid', 'high'].map((band) => (
                        React.createElement('div', { key: band, className: 'rounded-3xl bg-slate-950/80 p-4 border border-slate-800' },
                          React.createElement('p', { className: 'text-xs uppercase tracking-[0.2em] text-slate-500 mb-2' }, band.toUpperCase()),
                          React.createElement('div', { className: 'h-24 rounded-3xl bg-black/30 overflow-hidden' },
                            React.createElement('div', {
                              className: `h-full bg-gradient-to-t ${band === 'bass' ? 'from-emerald-400 to-cyan-200' : band === 'mid' ? 'from-orange-400 to-rose-200' : 'from-sky-300 to-violet-200'} rounded-3xl`,
                              style: { transform: `translateY(${100 - clamp(dispBandLevels[band] * 100, 0, 100)}%)` }
                            })
                          ),
                          React.createElement('span', { className: 'text-xs text-slate-400 mt-2 block text-right' }, `${Math.round(dispBandLevels[band] * 100)}%`)
                        )
                      ))
                    )
                  )
                )
              ),
              React.createElement('aside', { className: 'space-y-4' },
                React.createElement('div', { className: 'p-4 rounded-3xl glass-panel border border-white/10' },
                  React.createElement('p', { className: 'control-heading mb-3' }, 'Generator Engine'),
                  React.createElement('div', { className: 'grid gap-2' },
                    styleOptions.map((style) => (
                      React.createElement('button', {
                        key: style,
                        onClick: () => {
                          setSelectedStyle(style);
                          if (style === 'External Media') setStatusMessage('External media mode ready. load video below.');
                        },
                        className: `rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${logStyleClass(style)}`
                      },
                        React.createElement('div', { className: 'flex items-center justify-between' },
                          React.createElement('span', null, style),
                          React.createElement('span', { className: 'inline-flex items-center justify-center w-4 h-4 text-slate-300' }, '▶')
                        ),
                        React.createElement('p', { className: 'mt-1 text-xs text-slate-500' }, style === 'Hypnotic Tunnel' ? 'Infinite vortex with geometric distortion' : style === 'Cyber Grid' ? 'Retro synth floor with horizon pitch' : style === 'Particle Swarm' ? 'Dust field driven by high frequencies' : 'Upload or stream a looped video')
                      )
                    )),
                  ),
                  selectedStyle === 'External Media' && React.createElement('div', { className: 'mt-4 space-y-3' },
                    React.createElement('label', { className: 'block text-sm font-medium text-slate-300' }, 'Video URL / Local File'),
                    React.createElement('input', {
                      type: 'text',
                      value: externalVideoSource,
                      onChange: (e) => setExternalVideoSource(e.target.value),
                      placeholder: 'https://example.com/loop.mp4',
                      className: 'w-full rounded-2xl border border-slate-800 bg-slate-950/90 px-3 py-3 text-sm text-slate-200 focus:border-cyan-400 outline-none'
                    }),
                    React.createElement('button', {
                      onClick: () => {
                        if (videoRef.current) {
                          videoRef.current.src = externalVideoSource;
                          videoRef.current.play().catch(() => {});
                          setStatusMessage('External video loading...');
                        }
                      },
                      className: 'w-full rounded-2xl bg-cyan-500/15 border border-cyan-500/30 py-3 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20 transition'
                    }, 'Load Video')
                  )
                ),
                React.createElement('div', { className: 'p-4 rounded-3xl glass-panel border border-white/10' },
                  React.createElement('p', { className: 'control-heading mb-3' }, '3-Band Audio Engine'),
                  React.createElement('div', { className: 'space-y-3 text-sm' },
                    React.createElement('div', null,
                      React.createElement('label', { className: 'block text-slate-300 mb-2 font-medium' }, 'Audio Source'),
                      React.createElement('div', { className: 'grid grid-cols-3 gap-2' },
                        ['microphone', 'upload', 'url'].map((mode) => (
                          React.createElement('button', {
                            key: mode,
                            onClick: () => setAudioMode(mode),
                            className: `rounded-2xl border px-3 py-2 text-xs ${audioMode === mode ? 'bg-cyan-500/18 border-cyan-400 text-cyan-100' : 'bg-slate-950/80 border-slate-800 text-slate-300'}`
                          }, mode === 'microphone' ? 'Microphone' : mode === 'upload' ? 'Upload MP3' : 'Audio URL')
                        ))
                      )
                    ),
                    audioMode === 'upload' && React.createElement('input', {
                      type: 'file',
                      accept: 'audio/*',
                      onChange: handleAudioFileChange,
                      className: 'w-full rounded-2xl border border-slate-800 bg-slate-950/90 px-3 py-3 text-sm text-slate-200 file:rounded-xl file:border-0 file:bg-cyan-500/15 file:text-cyan-200 file:font-semibold'
                    }),
                    audioMode === 'url' && React.createElement('div', { className: 'space-y-2' },
                      React.createElement('input', {
                        type: 'text',
                        value: audioUrl,
                        onChange: (e) => setAudioUrl(e.target.value),
                        placeholder: 'https://example.com/loop.mp3',
                        className: 'w-full rounded-2xl border border-slate-800 bg-slate-950/90 px-3 py-3 text-sm text-slate-200 focus:border-cyan-400 outline-none'
                      }),
                      React.createElement('button', {
                        onClick: handleAudioUrlAccept,
                        className: 'w-full rounded-2xl bg-orange-500/15 border border-orange-400/30 py-3 text-sm font-semibold text-orange-200 hover:bg-orange-500/20 transition'
                      }, 'Activate URL Source')
                    ),
                    React.createElement('div', { className: 'grid gap-3 mt-3' },
                      ['bass', 'mid', 'high'].map((band) => (
                        React.createElement('div', { key: band, className: 'space-y-2' },
                          React.createElement('div', { className: 'flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-500' },
                            React.createElement('span', null, band),
                            React.createElement('span', null, `${bandSettings[band].toFixed(1)}x`)
                          ),
                          React.createElement('input', {
                            type: 'range',
                            min: 0.5,
                            max: 2.6,
                            step: 0.1,
                            value: bandSettings[band],
                            onChange: (e) => setBandSettings((prev) => ({ ...prev, [band]: parseFloat(e.target.value) })),
                            className: 'w-full accent-cyan-400'
                          }),
                          React.createElement('label', { className: 'inline-flex items-center gap-2 text-xs text-slate-400' },
                            React.createElement('input', {
                              type: 'checkbox',
                              checked: bandSettings[`${band}Smooth`],
                              onChange: (e) => setBandSettings((prev) => ({ ...prev, [`${band}Smooth`]: e.target.checked }))
                            }),
                            'Smoothing'
                          )
                        )
                      ))
                    )
                  )
                ),
                React.createElement('div', { className: 'p-4 rounded-3xl glass-panel border border-white/10' },
                  React.createElement('p', { className: 'control-heading mb-3' }, 'Logo Layer'),
                  React.createElement('div', { className: 'rounded-3xl border border-dashed border-cyan-500/25 p-4 text-center logo-drop' },
                    React.createElement('p', { className: 'text-sm text-slate-300 mb-3' }, 'Drop a transparent DJ logo here or click to browse'),
                    React.createElement('input', {
                      type: 'file',
                      accept: 'image/png',
                      onChange: (event) => handleLogoUpload(event.target.files?.[0]),
                      className: 'opacity-0 absolute inset-0 cursor-pointer'
                    }),
                    React.createElement('div', { className: 'mx-auto inline-flex items-center gap-2 rounded-full bg-slate-950/80 px-3 py-2 text-xs text-slate-300' },
                      React.createElement('span', { className: 'inline-flex items-center justify-center w-4 h-4 text-cyan-300' }, '⤴'),
                      'Upload PNG'
                    )
                  ),
                  React.createElement('div', { className: 'mt-4 space-y-4' },
                    React.createElement('div', { className: 'grid gap-3' },
                      ['scale', 'opacity', 'x', 'y'].map((control) => (
                        React.createElement('label', { key: control, className: 'space-y-2 text-sm' },
                          React.createElement('span', { className: 'text-slate-300' }, control.charAt(0).toUpperCase() + control.slice(1)),
                          React.createElement('input', {
                            type: 'range',
                            min: control === 'opacity' ? 0.2 : control === 'scale' ? 0.7 : -0.35,
                            max: control === 'opacity' ? 1 : control === 'scale' ? 1.4 : 0.35,
                            step: 0.01,
                            value: logoMeta[control],
                            onChange: (e) => setLogoMeta((prev) => ({ ...prev, [control]: parseFloat(e.target.value) })),
                            className: 'w-full accent-cyan-400'
                          })
                        )
                      ))
                    ),
                    React.createElement('div', { className: 'grid grid-cols-2 gap-3' },
                      React.createElement('label', { className: 'inline-flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-950/90 px-3 py-3 text-sm' },
                        React.createElement('input', { type: 'checkbox', checked: logoMeta.glitch, onChange: (e) => setLogoMeta((prev) => ({ ...prev, glitch: e.target.checked })) }),
                        'Audio Glitch'
                      ),
                      React.createElement('label', { className: 'inline-flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-950/90 px-3 py-3 text-sm' },
                        React.createElement('input', { type: 'checkbox', checked: logoMeta.glow, onChange: (e) => setLogoMeta((prev) => ({ ...prev, glow: e.target.checked })) }),
                        'Neon Glow'
                      )
                    ),
                    React.createElement('div', { className: 'grid gap-3' },
                      React.createElement('label', { className: 'text-sm text-slate-300' }, 'Glow Color'),
                      React.createElement('input', {
                        type: 'color',
                        value: logoMeta.glowColor,
                        onChange: (e) => setLogoMeta((prev) => ({ ...prev, glowColor: e.target.value })),
                        className: 'h-12 w-full rounded-2xl border border-slate-800 bg-slate-950/90 p-1'
                      })
                    )
                  )
                ),
                React.createElement('div', { className: 'p-4 rounded-3xl glass-panel border border-white/10' },
                  React.createElement('p', { className: 'control-heading mb-3' }, 'FX Rack'),
                  React.createElement('div', { className: 'grid gap-3' },
                    ['aberration', 'vhs', 'strobe', 'scanlines', 'vignette', 'noise', 'pulse'].map((effect) => (
                      React.createElement('button', {
                        key: effect,
                        onClick: () => setActiveEffects((prev) => ({ ...prev, [effect]: !prev[effect] })),
                        className: `rounded-2xl px-4 py-3 text-left text-sm transition ${activeEffects[effect] ? 'bg-emerald-500/15 border border-emerald-400/20 text-emerald-100' : 'bg-slate-950/80 border border-slate-800 text-slate-300 hover:bg-slate-900/90'}`
                      },
                        React.createElement('div', { className: 'flex items-center justify-between gap-3' },
                          React.createElement('span', null, effect === 'aberration' ? 'Chromatic Aberration' : effect === 'vhs' ? 'VHS Glitch' : effect === 'strobe' ? 'Strobe Light' : effect === 'scanlines' ? 'Scanlines' : effect === 'vignette' ? 'Vignette Glow' : effect === 'noise' ? 'Analog Noise' : 'Neon Pulse'),
                          React.createElement('span', { className: 'inline-flex items-center justify-center w-4 h-4' }, activeEffects[effect] ? '✔' : '✖')
                        ),
                        React.createElement('p', { className: 'mt-1 text-xs text-slate-500' }, effect === 'aberration' ? 'RGB split intensity with high-band spikes' : effect === 'vhs' ? 'CRT noise, glitches and scan overlays' : effect === 'strobe' ? 'Manual or BPM-synced flashes' : effect === 'scanlines' ? 'Retro analog raster effect' : effect === 'vignette' ? 'Soft darkened vignette for cinematic depth' : effect === 'noise' ? 'Subtle analog grain and scan noise' : 'Pulsing neon halo effects'))
                      )
                    ))
                  ),
                  React.createElement('div', { className: 'mt-4 space-y-3' },
                    React.createElement('label', { className: 'text-sm text-slate-300' }, 'Frame Rate'),
                    React.createElement('div', { className: 'grid grid-cols-3 gap-2' },
                      [15, 24, 60].map((rate) => (
                        React.createElement('button', {
                          key: rate,
                          onClick: () => setFrameRate(rate),
                          className: `rounded-2xl py-3 text-sm font-semibold transition ${frameRate === rate ? 'bg-cyan-500/15 border border-cyan-400/20 text-cyan-100' : 'bg-slate-950/80 border border-slate-800 text-slate-300'}`
                        }, `${rate} fps`)
                      ))
                    ),
                    activeEffects.strobe && React.createElement('div', { className: 'space-y-3' },
                      React.createElement('div', { className: 'flex items-center justify-between text-sm text-slate-300' },
                        React.createElement('span', null, 'BPM Tap'),
                        React.createElement('button', {
                          onClick: handleBpmTap,
                          className: 'rounded-full bg-slate-900/85 px-3 py-1.5 text-xs uppercase tracking-[0.22em] text-cyan-200 hover:bg-cyan-400/10 transition'
                        }, 'TAP')
                      ),
                      React.createElement('div', { className: 'flex items-center gap-3' },
                        React.createElement('span', { className: 'text-xs text-slate-500' }, 'BPM'),
                        React.createElement('span', { className: 'text-lg font-semibold text-cyan-200' }, bpmState.bpm),
                        React.createElement('span', { className: 'text-xs text-slate-400' }, bpmState.lastTap ? 'last tap' : '')
                      ),
                      React.createElement('div', { className: 'space-y-2' },
                        React.createElement('label', { className: 'text-xs uppercase tracking-[0.2em] text-slate-500' }, 'Strobe Strength'),
                        React.createElement('input', {
                          type: 'range',
                          min: 0.05,
                          max: 1,
                          step: 0.01,
                          value: strobeStrength,
                          onChange: (e) => setStrobeStrength(parseFloat(e.target.value)),
                          className: 'w-full accent-amber-400'
                        })
                      )
                    )
                  )
                ),
                React.createElement('div', { className: 'p-4 rounded-3xl glass-panel border border-white/10' },
                  React.createElement('p', { className: 'control-heading mb-3' }, 'Pro DJ Mode'),
                  React.createElement('div', { className: 'grid gap-3' },
                    React.createElement('button', {
                      onClick: () => setUiVisible((value) => !value),
                      className: 'rounded-3xl bg-slate-900/90 border border-slate-800 px-4 py-4 text-sm font-semibold text-cyan-100 hover:bg-slate-800 transition'
                    }, uiVisible ? 'GO LIVE (Hide UI)' : 'RETURN TO CONTROL MODE'),
                    React.createElement('div', { className: 'rounded-3xl border border-slate-800 bg-slate-950/80 p-4 text-sm text-slate-400' },
                      React.createElement('p', null, 'Keybinds:'),
                      React.createElement('ul', { className: 'mt-2 space-y-2 text-slate-500' },
                        React.createElement('li', null, 'F = Fullscreen toggle'),
                        React.createElement('li', null, 'Space = Freeze / resume scene'),
                        React.createElement('li', null, 'Escape = reveal the UI')
                      )
                    )
                  )
                ),
                React.createElement('div', { className: 'p-4 rounded-3xl glass-panel border border-white/10' },
                  React.createElement('p', { className: 'control-heading mb-3' }, 'Preset Manager'),
                  React.createElement('div', { className: 'grid gap-3' },
                    presets.map((preset, index) => (
                      React.createElement('div', { key: preset.label, className: 'grid grid-cols-[1fr_auto_auto] gap-2' },
                        React.createElement('button', {
                          onClick: () => loadPresetSlot(index),
                          className: 'rounded-2xl border border-slate-800 bg-slate-950/90 px-4 py-3 text-left text-sm text-slate-200 hover:border-cyan-400/20'
                        },
                          React.createElement('p', { className: 'font-semibold text-slate-100' }, preset.label),
                          React.createElement('p', { className: 'text-xs text-slate-500' }, preset.settings ? 'stored' : 'empty')
                        ),
                        React.createElement('button', {
                          onClick: () => savePresetSlot(index),
                          className: 'rounded-2xl bg-cyan-500/15 border border-cyan-400/20 px-4 py-3 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/25'
                        }, 'Save')
                      )
                      )
                  )
                )
              )
            )
          )
        )
      );
    }

    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
