/**
 * GpuTierBadge — surfaces the GPU speculation-capability boundary in the chat header.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Commit 2acf21a raised the draft-boot VRAM threshold from >=8GB to >=10GB so
 * the smallest TTS engine still fits alongside the main+draft LLM pair. On
 * 8GB-GPU laptops, chat now runs main-only (no speculative decoding) and is
 * silently ~1.3-2.0s slower per reply. Users blamed "the product". This badge
 * makes the root cause VISIBLE: it shows the GPU tier, explains the trade-off
 * in plain language, and points at the 10GB threshold as the unlock.
 *
 * A11Y CONTRACT
 * ─────────────
 * - Never color-alone: every tier pairs an icon + label + color.
 * - aria-label carries the full human description (not just the tier name).
 * - Tooltip respects `prefers-reduced-motion` (no enter/exit fade if set).
 * - Chip is keyboard-focusable via role="status" (ambient info, not a control).
 *
 * DATA SOURCE
 * ───────────
 * GET /backend/health — returns { gpu_tier, gpu_name, vram_total_gb,
 * vram_free_gb, speculation_enabled }. Re-polled every 60s to catch GPU
 * allocation changes (TTS loading/unloading shifts free_vram and can
 * temporarily move the speculation line even without a reboot).
 */

import {API_BASE_URL} from '../../config/apiBase';

import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import {Zap, Gauge, Cpu, AlertTriangle} from 'lucide-react';
import React, {useEffect, useState, useMemo} from 'react';


const POLL_INTERVAL_MS = 60_000;

// Tier → presentation. Color is never used alone: icon + text carry meaning too.
const TIER_META = {
  ultra: {
    label: 'Ultra GPU',
    bg: 'rgba(155, 148, 255, 0.18)',
    fg: '#9B94FF',
    border: 'rgba(155, 148, 255, 0.45)',
    Icon: Zap,
    short: 'Ultra',
    description:
      'Ultra GPU — 24GB+ VRAM. Top speed. Can run 70B-class models locally with speculative decoding.',
  },
  full: {
    label: 'Full GPU',
    bg: 'rgba(46, 204, 113, 0.16)',
    fg: '#2ECC71',
    border: 'rgba(46, 204, 113, 0.45)',
    Icon: Zap,
    short: 'Full',
    description:
      'Full GPU — 10GB+ VRAM. Draft + main speculative decoding active. Replies are roughly 40% faster than Standard.',
  },
  standard: {
    label: 'Standard GPU',
    bg: 'rgba(245, 166, 35, 0.16)',
    fg: '#F5A623',
    border: 'rgba(245, 166, 35, 0.45)',
    Icon: Gauge,
    short: 'Standard',
    description:
      'Standard GPU — heavy model only. Upgrade to 10GB+ VRAM for about 40% faster replies (speculative decoding unlocks at 10GB to leave room for voice).',
  },
  none: {
    label: 'CPU',
    bg: 'rgba(149, 165, 166, 0.16)',
    fg: '#95A5A6',
    border: 'rgba(149, 165, 166, 0.45)',
    Icon: Cpu,
    short: 'CPU',
    description:
      'No CUDA GPU detected (or under 4GB VRAM). Chat runs on CPU — replies are slower. A 10GB+ NVIDIA GPU unlocks speculative decoding.',
  },
  unknown: {
    label: 'GPU: checking',
    bg: 'rgba(149, 165, 166, 0.10)',
    fg: '#95A5A6',
    border: 'rgba(149, 165, 166, 0.30)',
    Icon: AlertTriangle,
    short: '...',
    description: 'Detecting GPU tier…',
  },
};

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export default function GpuTierBadge({className = '', style = {}}) {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(false);
  const reducedMotion = useMemo(prefersReducedMotion, []);

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const fetchHealth = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/backend/health`, {
          method: 'GET',
          headers: {Accept: 'application/json'},
          credentials: 'same-origin',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setHealth(data);
          setError(false);
        }
      } catch (e) {
        if (!cancelled) setError(true);
      }
    };

    fetchHealth();
    timer = setInterval(fetchHealth, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  const tierKey = error || !health ? 'unknown' : (health.gpu_tier || 'unknown');
  const meta = TIER_META[tierKey] || TIER_META.unknown;
  const {Icon} = meta;

  // Build the human tooltip + aria-label. Includes concrete numbers when
  // we have them so the user can see "why" at a glance.
  const detailLine = (() => {
    if (!health || error) return '';
    const parts = [];
    if (health.gpu_name) parts.push(health.gpu_name);
    if (typeof health.vram_total_gb === 'number' && health.vram_total_gb > 0) {
      parts.push(`${health.vram_total_gb.toFixed(1)}GB VRAM`);
    }
    if (typeof health.vram_free_gb === 'number' && health.vram_total_gb > 0) {
      parts.push(`${health.vram_free_gb.toFixed(1)}GB free`);
    }
    parts.push(
      health.speculation_enabled
        ? 'speculative decoding: on'
        : 'speculative decoding: off'
    );
    return parts.join(' · ');
  })();

  const fullDescription = detailLine
    ? `${meta.description} Current: ${detailLine}.`
    : meta.description;

  const chip = (
    <Chip
      role="status"
      aria-label={fullDescription}
      icon={
        <Icon
          size={14}
          aria-hidden="true"
          style={{color: meta.fg, marginLeft: 4}}
        />
      }
      label={meta.short}
      size="small"
      className={className}
      sx={{
        minHeight: 20,
        height: 24,
        borderRadius: '9999px', // pill — literal px to dodge MUI's 8px multiplier
        backgroundColor: meta.bg,
        color: meta.fg,
        border: `1px solid ${meta.border}`,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.2,
        px: 0.5,
        '& .MuiChip-label': {
          px: 0.75,
          color: meta.fg,
        },
        '& .MuiChip-icon': {
          color: meta.fg,
          marginRight: '-2px',
        },
        ...style,
      }}
    />
  );

  return (
    <Tooltip
      title={fullDescription}
      arrow
      placement="bottom"
      // prefers-reduced-motion: skip the fade animation.
      TransitionProps={reducedMotion ? {timeout: 0} : undefined}
      enterDelay={reducedMotion ? 0 : 200}
      leaveDelay={0}
    >
      {chip}
    </Tooltip>
  );
}
