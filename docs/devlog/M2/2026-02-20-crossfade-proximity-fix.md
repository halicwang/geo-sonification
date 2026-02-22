# 2026-02-20 — Fix: Crossfade Controller Proximity Attenuation

## Problem

The crossfade controller multiplied all 11 smoothed outputs by `proximity` before sending them to outlets (`smoothed[i] * proximity`). When zoomed out (`proximity ≈ 0`), this zeroed every land-cover bus. Meanwhile, `water_bus.js` independently output 1.0 for open ocean — producing inverted behavior: water bus on, everything else silent, even over land areas that should still have ambient sound.

## Fix

Removed the `* proximity` attenuation from the crossfade controller output. Smoothed values now pass through directly. Proximity-based mixing is handled downstream where appropriate (e.g., `water_bus.js` already manages its own proximity logic).

## Files changed

- **Modified**: `sonification/crossfade_controller.js` — remove `* proximity` from outlet loop
