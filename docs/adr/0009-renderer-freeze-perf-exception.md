# 0009. Renderer-freeze exception for canvas allocation and indicator loading

- Status: Accepted
- Date: 2026-10-10
- Deciders: tseka (founder-authorized)
- Amends: ADR 0005, ADR 0008

## Context

The 2026-10-10 runtime audit found two costs inside the frozen renderer area.

1. **Canvas memory.** Each chart allocated every canvas layer up front:
   - a drawing layer on every pane;
   - a left-axis pair even when no left axis is shown, sized to the full plot when the host had no left-axis layer;
   - a full-plot crosshair canvas.

   The landing hero held 9 canvases (38.6 MiB at DPR 2).
2. **Indicator loading.** `createChartController` loaded every indicator module before mounting. The workbench made 81 JS requests on first load.

## Decision

The founder authorizes changes to the frozen paths (`engine/**`, `controllers/**`), limited to two areas.

**Canvas allocation and sizing.** This covers:
- when a pane, axis, drawing or crosshair surface is created or released;
- the size of its backing store, which is the drawn area times DPR;
- where the surface sits in the DOM, without changing stacking order.

**Indicator loading.** This covers:
- the build-time static catalog;
- on-demand loading of indicator modules;
- adding newly loaded definitions to the calculation runtimes;
- the async boundaries for adding an indicator, restoring a layout and running Agent tools.

The layout-autosave scheduling change (coalescing viewport-driven checks) is also covered, because it lives in the same controllers path.

These stay frozen:
- drawing algorithms (`engine/renderers/**` paint code);
- `engine/scale/**`;
- `foundation/tokens/fonts.ts`;
- any change to what a frame draws.

Before and after builds must produce pixel-identical output.

## Consequences

- PR 363045841/KLineChartQuant#309 ships the change.
- Screenshots of the hero and workbench harnesses are byte-identical before and after.
- Synchronous indicator methods accept only loaded definitions. Hosts call `loadIndicators` first, or opt into `indicatorLoading: 'all'`.
- Any other renderer change still needs its own ADR.
