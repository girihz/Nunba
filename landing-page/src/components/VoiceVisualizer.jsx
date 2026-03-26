import React, { useRef, useEffect, useCallback } from 'react';

/**
 * VoiceVisualizer — Animated spectrogram/waveform when AI speaks.
 *
 * Uses Web Audio API AnalyserNode to get real-time frequency data from the
 * audio element, rendered as a beautiful radial/bar visualizer with the
 * Nunba brand colors (#6C63FF purple, #FF6B6B coral, #4CAF50 green).
 *
 * Props:
 *   audioRef  — ref to the <audio> element playing TTS
 *   isActive  — boolean, true when AI is speaking
 *   size      — diameter in px (default 200)
 *   style     — optional container style override
 */
const VoiceVisualizer = ({ audioRef, isActive, size = 200, style }) => {
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const ctxRef = useRef(null);

  // Connect Web Audio analyser to the audio element
  const connectAnalyser = useCallback(() => {
    if (!audioRef?.current || sourceRef.current) return;
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      ctxRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      const source = audioCtx.createMediaElementSource(audioRef.current);
      source.connect(analyser);
      analyser.connect(audioCtx.destination);
      analyserRef.current = analyser;
      sourceRef.current = source;
    } catch (e) {
      // Fallback: generate synthetic animation if Web Audio fails
      console.debug('VoiceVisualizer: Web Audio unavailable, using synthetic mode');
    }
  }, [audioRef]);

  // Main render loop
  useEffect(() => {
    if (!isActive) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      // Draw idle state
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        drawIdle(ctx, canvas.width, canvas.height);
      }
      return;
    }

    connectAnalyser();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const analyser = analyserRef.current;
    const bufferLength = analyser ? analyser.frequencyBinCount : 64;
    const dataArray = new Uint8Array(bufferLength);
    let phase = 0;

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);
      const W = canvas.width;
      const H = canvas.height;
      const cx = W / 2;
      const cy = H / 2;

      // Get frequency data (or synthetic if no analyser)
      if (analyser) {
        analyser.getByteFrequencyData(dataArray);
      } else {
        // Synthetic pulsing when Web Audio unavailable
        for (let i = 0; i < bufferLength; i++) {
          dataArray[i] = Math.floor(
            80 + 100 * Math.sin(phase * 0.03 + i * 0.2) *
            Math.sin(phase * 0.01 + i * 0.1)
          );
        }
      }
      phase++;

      // Clear with slight trail for glow effect
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.fillRect(0, 0, W, H);

      const barCount = Math.min(bufferLength, 64);
      const baseRadius = Math.min(cx, cy) * 0.3;
      const maxBarHeight = Math.min(cx, cy) * 0.55;

      // ── Radial bars ──
      for (let i = 0; i < barCount; i++) {
        const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
        const value = dataArray[i] / 255;
        const barHeight = baseRadius + value * maxBarHeight;

        // Color gradient: purple → coral → green based on frequency
        const t = i / barCount;
        let r, g, b;
        if (t < 0.33) {
          // Purple (#6C63FF) → Coral (#FF6B6B)
          const p = t / 0.33;
          r = Math.floor(108 + (255 - 108) * p);
          g = Math.floor(99 + (107 - 99) * p);
          b = Math.floor(255 + (107 - 255) * p);
        } else if (t < 0.66) {
          // Coral (#FF6B6B) → Green (#4CAF50)
          const p = (t - 0.33) / 0.33;
          r = Math.floor(255 + (76 - 255) * p);
          g = Math.floor(107 + (175 - 107) * p);
          b = Math.floor(107 + (80 - 107) * p);
        } else {
          // Green (#4CAF50) → Purple (#6C63FF)
          const p = (t - 0.66) / 0.34;
          r = Math.floor(76 + (108 - 76) * p);
          g = Math.floor(175 + (99 - 175) * p);
          b = Math.floor(80 + (255 - 80) * p);
        }

        const alpha = 0.6 + value * 0.4;
        const barWidth = (Math.PI * 2 / barCount) * 0.6;

        // Inner point
        const x1 = cx + Math.cos(angle) * baseRadius;
        const y1 = cy + Math.sin(angle) * baseRadius;
        // Outer point
        const x2 = cx + Math.cos(angle) * barHeight;
        const y2 = cy + Math.sin(angle) * barHeight;

        // Glow
        ctx.shadowBlur = 8 + value * 12;
        ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${alpha * 0.6})`;

        // Bar
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.lineWidth = 2 + value * 2;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Mirror bar (opposite side, dimmer)
        const mirrorAngle = angle + Math.PI;
        const mx1 = cx + Math.cos(mirrorAngle) * baseRadius;
        const my1 = cy + Math.sin(mirrorAngle) * baseRadius;
        const mx2 = cx + Math.cos(mirrorAngle) * (baseRadius + value * maxBarHeight * 0.5);
        const my2 = cy + Math.sin(mirrorAngle) * (baseRadius + value * maxBarHeight * 0.5);

        ctx.beginPath();
        ctx.moveTo(mx1, my1);
        ctx.lineTo(mx2, my2);
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.3})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      ctx.shadowBlur = 0;

      // ── Center circle with pulse ──
      const avgLevel = dataArray.reduce((a, b) => a + b, 0) / bufferLength / 255;
      const pulseRadius = baseRadius * (0.6 + avgLevel * 0.4);

      // Outer glow ring
      const gradient = ctx.createRadialGradient(cx, cy, pulseRadius * 0.5, cx, cy, pulseRadius);
      gradient.addColorStop(0, `rgba(108, 99, 255, ${0.2 + avgLevel * 0.3})`);
      gradient.addColorStop(0.7, `rgba(108, 99, 255, ${0.05 + avgLevel * 0.1})`);
      gradient.addColorStop(1, 'rgba(108, 99, 255, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, pulseRadius, 0, Math.PI * 2);
      ctx.fill();

      // Inner solid circle
      ctx.fillStyle = `rgba(108, 99, 255, ${0.3 + avgLevel * 0.4})`;
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius * 0.35, 0, Math.PI * 2);
      ctx.fill();

      // Center dot
      ctx.fillStyle = `rgba(255, 255, 255, ${0.5 + avgLevel * 0.5})`;
      ctx.beginPath();
      ctx.arc(cx, cy, 3 + avgLevel * 3, 0, Math.PI * 2);
      ctx.fill();
    };

    draw();

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isActive, connectAnalyser]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (ctxRef.current && ctxRef.current.state !== 'closed') {
        try { ctxRef.current.close(); } catch (e) { /* ignore */ }
      }
    };
  }, []);

  return (
    <div
      style={{
        width: size,
        height: size,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        width={size * 2}
        height={size * 2}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
        }}
      />
      {isActive && (
        <div
          style={{
            position: 'absolute',
            bottom: -8,
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: 10,
            color: '#9B94FF',
            letterSpacing: 2,
            textTransform: 'uppercase',
            fontWeight: 600,
            opacity: 0.7,
          }}
        >
          Speaking
        </div>
      )}
    </div>
  );
};

function drawIdle(ctx, W, H) {
  const cx = W / 2;
  const cy = H / 2;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // Subtle breathing circle
  const gradient = ctx.createRadialGradient(cx, cy, 10, cx, cy, W * 0.25);
  gradient.addColorStop(0, 'rgba(108, 99, 255, 0.15)');
  gradient.addColorStop(1, 'rgba(108, 99, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, W * 0.25, 0, Math.PI * 2);
  ctx.fill();

  // Center dot
  ctx.fillStyle = 'rgba(108, 99, 255, 0.3)';
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();
}

export default VoiceVisualizer;
