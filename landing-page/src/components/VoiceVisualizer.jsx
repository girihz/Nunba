import React, { useRef, useEffect, useCallback } from 'react';

/**
 * VoiceVisualizer — Butter-smooth neon circular amplitude.
 *
 * Key techniques for smoothness:
 * 1. Catmull-Rom spline interpolation (no jagged peaks)
 * 2. Per-band lerp smoothing (previous frame → current, 0.18 blend)
 * 3. Log-scale FFT mapping (more bass detail, fewer treble spikes)
 * 4. Multi-frequency organic deformation (2x + 5x + 9x harmonics)
 * 5. 256-point ring resolution for silk-smooth curves
 * 6. Additive blending (globalCompositeOperation: 'lighter')
 * 7. Trail persistence for neon glow afterimage
 */
const BANDS = 128;

const VoiceVisualizer = ({ audioRef, isActive, size = 200, style }) => {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const audioCtxRef = useRef(null);
  const smoothRef = useRef(new Float32Array(BANDS));
  const targetRef = useRef(new Float32Array(BANDS));
  const particlesRef = useRef([]);
  const phaseRef = useRef(0);

  const connectAnalyser = useCallback(() => {
    if (!audioRef?.current || sourceRef.current) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.88;
      const source = ctx.createMediaElementSource(audioRef.current);
      source.connect(analyser);
      analyser.connect(ctx.destination);
      analyserRef.current = analyser;
      sourceRef.current = source;
    } catch { /* synthetic fallback */ }
  }, [audioRef]);

  useEffect(() => {
    const pts = [];
    for (let i = 0; i < 80; i++) pts.push({
      a: Math.random() * Math.PI * 2, r: 0.35 + Math.random() * 0.55,
      s: 0.001 + Math.random() * 0.003, sz: 0.3 + Math.random() * 1.2,
      br: 0.2 + Math.random() * 0.6, h: Math.random() * 80 - 40,
    });
    particlesRef.current = pts;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const X = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2, R = Math.min(cx, cy) * 0.88;
    const smooth = smoothRef.current;
    const target = targetRef.current;
    const freq = new Uint8Array(512);
    const wave = new Uint8Array(512);

    if (isActive) connectAnalyser();

    function catmull(p0, p1, p2, p3, t) {
      const t2 = t * t, t3 = t2 * t;
      return 0.5 * (2*p1 + (p2-p0)*t + (2*p0-5*p1+4*p2-p3)*t2 + (-p0+3*p1-3*p2+p3)*t3);
    }

    function getSmooth(arr, pos) {
      const len = arr.length, i = pos * len;
      const i0 = ((Math.floor(i)-1)%len+len)%len;
      const i1 = Math.floor(i) % len;
      const i2 = (Math.floor(i)+1) % len;
      const i3 = (Math.floor(i)+2) % len;
      return catmull(arr[i0], arr[i1], arr[i2], arr[i3], i - Math.floor(i));
    }

    function avg(arr, s, e) {
      let sum = 0; for (let i = s; i < e; i++) sum += arr[i];
      return (e-s) > 0 ? sum / (e-s) : 0;
    }

    function drawNeonRing(radiusF, ampF, color, lineW, glow, speed, lvl, t) {
      const baseR = R * radiusF, amp = R * ampF;
      const [cr, cg, cb] = color;
      X.beginPath();
      for (let i = 0; i <= 256; i++) {
        const frac = i / 256, angle = frac * Math.PI * 2;
        const v = getSmooth(smooth, frac);
        const deform = v * amp
          + Math.sin(angle*2 + t*speed) * amp * 0.08 * (1+lvl)
          + Math.sin(angle*5 + t*speed*1.7) * amp * 0.03
          + Math.sin(angle*9 + t*speed*0.4) * amp * 0.015;
        const r = baseR + deform;
        const x = cx + Math.cos(angle) * r, y = cy + Math.sin(angle) * r;
        i === 0 ? X.moveTo(x, y) : X.lineTo(x, y);
      }
      X.closePath();
      const alpha = 0.4 + lvl * 0.6;
      X.strokeStyle = `rgba(${cr},${cg},${cb},${alpha})`;
      X.lineWidth = lineW + lvl * 1.5;
      X.shadowBlur = glow + lvl * 25;
      X.shadowColor = `rgba(${cr},${cg},${cb},${0.5+lvl*0.5})`;
      X.stroke();
      X.strokeStyle = `rgba(${Math.min(255,cr+40)},${Math.min(255,cg+40)},${Math.min(255,cb+20)},${alpha*0.3})`;
      X.lineWidth = (lineW + lvl * 1.5) * 2.5;
      X.shadowBlur = glow * 2 + lvl * 30;
      X.stroke();
    }

    const draw = () => {
      animRef.current = requestAnimationFrame(draw);
      const t = (phaseRef.current += 0.012);
      const an = analyserRef.current;

      if (isActive && an) {
        an.getByteFrequencyData(freq);
        an.getByteTimeDomainData(wave);
        for (let i = 0; i < BANDS; i++) {
          const frac = i / BANDS;
          const fi = Math.floor(Math.pow(frac, 1.5) * freq.length * 0.8);
          let sum = 0, count = 0;
          for (let j = Math.max(0, fi-2); j <= Math.min(freq.length-1, fi+2); j++) { sum += freq[j]; count++; }
          target[i] = (sum / count) / 255;
        }
      } else if (isActive) {
        for (let i = 0; i < BANDS; i++)
          target[i] = 0.3 + 0.5 * Math.abs(Math.sin(t*1.8+i*0.12) * Math.cos(t*0.9+i*0.06) * Math.sin(t*0.5+i*0.2));
      } else {
        for (let i = 0; i < BANDS; i++) target[i] *= 0.92;
      }

      const lerp = isActive ? 0.18 : 0.06;
      for (let i = 0; i < BANDS; i++) smooth[i] += (target[i] - smooth[i]) * lerp;

      const bass = avg(smooth, 0, 16), mid = avg(smooth, 16, 64), hi = avg(smooth, 64, BANDS);
      const lvl = bass * 0.5 + mid * 0.35 + hi * 0.15;

      X.globalCompositeOperation = 'source-over';
      X.fillStyle = `rgba(10,9,20,${isActive ? 0.18 : 0.06})`;
      X.fillRect(0, 0, W, H);

      if (!isActive && lvl < 0.01) {
        // Idle
        X.globalCompositeOperation = 'lighter';
        const b = 0.5 + Math.sin(t) * 0.08;
        X.beginPath(); X.arc(cx, cy, R*b, 0, Math.PI*2);
        X.strokeStyle = `rgba(108,99,255,${0.06+Math.sin(t)*0.03})`;
        X.lineWidth = 1.2; X.shadowBlur = 18; X.shadowColor = 'rgba(108,99,255,0.25)'; X.stroke();
        X.beginPath(); X.arc(cx, cy, R*b*0.65, 0, Math.PI*2);
        X.strokeStyle = `rgba(0,210,255,${0.04+Math.sin(t*1.2)*0.02})`;
        X.lineWidth = 0.8; X.shadowBlur = 12; X.shadowColor = 'rgba(0,210,255,0.15)'; X.stroke();
        X.globalCompositeOperation = 'source-over'; X.shadowBlur = 0;
        const g = X.createRadialGradient(cx, cy, 0, cx, cy, R*0.12);
        g.addColorStop(0, `rgba(108,99,255,${0.1+Math.sin(t)*0.04})`); g.addColorStop(1, 'rgba(108,99,255,0)');
        X.fillStyle = g; X.beginPath(); X.arc(cx, cy, R*0.12, 0, Math.PI*2); X.fill();
        X.fillStyle = `rgba(180,175,255,${0.2+Math.sin(t)*0.08})`; X.beginPath(); X.arc(cx, cy, 2.5, 0, Math.PI*2); X.fill();
        return;
      }

      // Halo
      const hr = R * (0.9 + lvl * 0.3);
      const hg = X.createRadialGradient(cx, cy, 0, cx, cy, hr);
      hg.addColorStop(0, `rgba(108,99,255,${0.04+lvl*0.06})`);
      hg.addColorStop(0.5, `rgba(80,40,200,${0.02+lvl*0.03})`);
      hg.addColorStop(1, 'rgba(10,9,20,0)');
      X.fillStyle = hg; X.beginPath(); X.arc(cx, cy, hr, 0, Math.PI*2); X.fill();

      X.globalCompositeOperation = 'lighter';
      drawNeonRing(0.6, 0.18, [108,99,255], 3, 35, 1.0, lvl, t);
      drawNeonRing(0.48, 0.10, [0,210,255], 2, 22, -0.6, lvl, t);
      drawNeonRing(0.72, 0.14, [160,50,255], 2.2, 28, 0.4, lvl, t);

      // Waveform
      if (isActive && an) {
        const wr = R * 0.28;
        X.beginPath();
        for (let i = 0; i <= 200; i++) {
          const a = (i/200) * Math.PI * 2;
          const wi = Math.floor((i/200) * wave.length) % wave.length;
          const v = (wave[wi] - 128) / 128;
          const r = wr + v * R * 0.06;
          const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
          i === 0 ? X.moveTo(x, y) : X.lineTo(x, y);
        }
        X.closePath();
        X.strokeStyle = `rgba(255,107,107,${0.25+lvl*0.4})`;
        X.lineWidth = 1.2; X.shadowBlur = 10 + lvl*12;
        X.shadowColor = `rgba(255,107,107,${0.4+lvl*0.3})`; X.stroke();
      }

      // Particles
      X.shadowBlur = 0;
      for (const p of particlesRef.current) {
        p.a += p.s * (1 + lvl * 3);
        const pr = R * p.r * (0.85 + lvl * 0.25);
        const px = cx + Math.cos(p.a) * pr, py = cy + Math.sin(p.a) * pr;
        const al = p.br * (0.15 + lvl * 0.6);
        const sz = p.sz * (0.8 + lvl * 1.5);
        X.fillStyle = `rgba(${Math.max(0,Math.min(255,160+p.h))},${Math.max(0,Math.min(255,140+p.h*0.5))},255,${al})`;
        X.shadowBlur = sz * 5; X.shadowColor = `rgba(108,99,255,${al*0.6})`;
        X.beginPath(); X.arc(px, py, sz, 0, Math.PI*2); X.fill();
      }

      // Core
      X.globalCompositeOperation = 'source-over'; X.shadowBlur = 0;
      const cr = R * 0.15 * (1 + lvl * 0.6 + Math.sin(t*2.5) * 0.03);
      const cg1 = X.createRadialGradient(cx, cy, 0, cx, cy, cr*3);
      cg1.addColorStop(0, `rgba(108,99,255,${0.08+lvl*0.12})`); cg1.addColorStop(1, 'rgba(108,99,255,0)');
      X.fillStyle = cg1; X.beginPath(); X.arc(cx, cy, cr*3, 0, Math.PI*2); X.fill();
      const cg2 = X.createRadialGradient(cx, cy, 0, cx, cy, cr);
      cg2.addColorStop(0, `rgba(220,215,255,${0.5+lvl*0.5})`);
      cg2.addColorStop(0.4, `rgba(108,99,255,${0.3+lvl*0.4})`);
      cg2.addColorStop(1, 'rgba(60,50,180,0)');
      X.fillStyle = cg2; X.beginPath(); X.arc(cx, cy, cr, 0, Math.PI*2); X.fill();
      X.fillStyle = `rgba(255,255,255,${0.3+lvl*0.7})`; X.beginPath(); X.arc(cx, cy, 2+lvl*2.5, 0, Math.PI*2); X.fill();
    };

    draw();
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [isActive, connectAnalyser]);

  useEffect(() => () => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    if (audioCtxRef.current?.state !== 'closed') {
      try { audioCtxRef.current?.close(); } catch { /* */ }
    }
  }, []);

  return (
    <div style={{
      width: size, height: size, position: 'relative',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      filter: isActive ? 'drop-shadow(0 0 40px rgba(108,99,255,0.35))' : 'none',
      transition: 'filter 0.6s ease', ...style,
    }}>
      <canvas ref={canvasRef} width={size*2} height={size*2}
        style={{ width: size, height: size, borderRadius: '50%' }} />
      {isActive && (
        <div style={{
          position: 'absolute', bottom: -14, left: '50%', transform: 'translateX(-50%)',
          fontSize: 8, letterSpacing: 4, textTransform: 'uppercase', fontWeight: 700,
          background: 'linear-gradient(90deg,#6C63FF,#00D2FF,#B43CE6)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          animation: 'vizPulse 2s ease-in-out infinite',
        }}>Speaking</div>
      )}
      <style>{`@keyframes vizPulse{0%,100%{opacity:.6;filter:brightness(1)}50%{opacity:1;filter:brightness(1.5)}}`}</style>
    </div>
  );
};

export default VoiceVisualizer;
