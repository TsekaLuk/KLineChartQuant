# Order Book Heatmap — WGSL Render Path Spec

This document specifies the GPU side of the heatmap. **No `.wgsl` source ships
with this commit** — the JS controller in this module produces the snapshot
ring; the renderer (P1 deliverable) will translate the spec below into a real
pipeline once the WebGPU surface lands. The spec is authoritative for that
work.

## Inputs

### `snapshotRing` — storage buffer (read-only in shaders)

Logically a 2-D grid `intensity[col][row]` where:

- `col`  ∈ `[0, snapshotRingCapacity)` — time axis (oldest → newest)
- `row`  ∈ `[0, priceRowCount)` — price axis (low → high)

CPU-side layout (one upload per render frame for simplicity in v0):

```
struct SnapshotCell {
  intensity: f32,   // log-mapped, already in [0, 1]
};
@group(0) @binding(0) var<storage, read> ring: array<SnapshotCell>;
```

Index conversion: `cellIdx = col * priceRowCount + row`.

Empty levels (no resting size at that price/time) are written as `0.0`. The
fragment shader treats `0.0` as fully transparent.

### `viridisLUT` — 256-entry uniform color table

```
@group(0) @binding(1) var<uniform> viridisLUT: array<vec4<f32>, 256>;
```

`viridis` is the perceptually-uniform colormap from `d3-scale-chromatic`. Each
entry is `vec4<f32>(r, g, b, 1.0)` with channels in `[0, 1]` and gamma already
applied. The CPU sends it once at controller init and on theme change.

### `params` — uniform block

```
struct HeatmapParams {
  priceRowCount:        u32,
  snapshotColumnCount:  u32,
  // Scroll offset: when the ring buffer wraps, this is the col where the
  // oldest sample lives. The fragment shader rotates around this.
  ringHead:             u32,
  // Range used by the CPU when log-mapping; replicated here so the shader
  // can re-map should we move log mapping onto the GPU later (see §4).
  sizeMinLog:           f32,
  sizeMaxLog:           f32,
  _pad:                 f32,
};
@group(0) @binding(2) var<uniform> params: HeatmapParams;
```

## Fragment shader

```
@fragment
fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  // uv.x: 0 (left, oldest) → 1 (right, newest)
  // uv.y: 0 (bottom, lowest price) → 1 (top, highest price)
  let col = u32(floor(uv.x * f32(params.snapshotColumnCount)));
  let row = u32(floor(uv.y * f32(params.priceRowCount)));
  let rotated = (col + params.ringHead) % params.snapshotColumnCount;
  let idx = rotated * params.priceRowCount + row;
  let i = ring[idx].intensity;
  if (i <= 0.0) {
    return vec4<f32>(0.0, 0.0, 0.0, 0.0);
  }
  let lutIdx = u32(clamp(i * 255.0, 0.0, 255.0));
  return viridisLUT[lutIdx];
}
```

## Trade-off — full re-upload vs scrolling write

There are two reasonable upload strategies. The CPU controller currently
produces the data shape for **either**; the renderer picks at integration time.

### Option A — full re-upload every frame

Each render frame the CPU calls `snapshotRing.toArray()` and writes the whole
buffer. Simple, no GPU-side state, fast on small rings.

- Cost: `O(N · R · sizeof(SnapshotCell))` per frame
  (N = ring capacity, R = price rows). For N = 600, R = 400, 4 B per cell
  that's ~960 KB per frame — fine at 60 fps on any GPU we target.
- Pros: stateless, robust to seeking/replay, code is short.
- Cons: redundant uploads for the columns that didn't change.

### Option B — scrolling buffer with single-column write

Treat the storage buffer as a true ring. On each new snapshot:

1. CPU writes one column at offset `ringHead * R` (only the new data).
2. CPU bumps `params.ringHead = (ringHead + 1) % N`.

- Cost: `O(R · sizeof(SnapshotCell))` per snapshot.
- Pros: minimal bandwidth, scales to N >> 600.
- Cons: needs careful synchronization with frame timing; the fragment shader
  already accounts for `ringHead` rotation (see snippet above).

**Recommendation**: start with A in v0 (correct + easy to validate); migrate
to B once the renderer is on WebGPU and we want to drive much wider time
windows.

## Why CPU-side log mapping (today) and not GPU?

We do the log transform on CPU inside `logColorScale` because:

- The mapping is cheap (one `log` per cell, ~tens of µs per snapshot).
- Having the intensity already in `[0, 1]` keeps the fragment shader trivial
  and avoids passing raw size ranges through every uniform.

Once we move to Option B and want to scrub a long history with dynamic range
recalibration, we can move log mapping onto the GPU using `sizeMinLog` /
`sizeMaxLog` from `HeatmapParams`. The shader code path is one extra `log`
call and a divide — no change to the buffer shape is required.

## Composition with depth chart / order book ladder

The same `ring` storage buffer is consumed by §3.4's depth chart, which only
needs the *current* column (`ringHead - 1 mod N`) and a different fragment
shader that does a cumulative-sum sweep. We deliberately avoid duplicating
state for the two visualizations.
