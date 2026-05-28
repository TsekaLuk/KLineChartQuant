/**
 * @klinechart-quant/core/renderer-tier — pre-mount renderer tier detection.
 *
 * Used by the `Renderer` factory to pick the highest backend the host
 * environment supports (WebGPU → WebGL2 → Canvas2D → none).
 *
 * See `./detectRendererTier.ts` for design notes.
 */

export {
    detectRendererTier,
    detectRendererTierOrThrow,
    compareRendererTier,
    isTierAtLeast,
} from './detectRendererTier'
export {
    RENDERER_TIER_RANK,
    type RendererTier,
    type RendererTierResult,
    type RendererTierProbes,
    type DetectRendererTierOptions,
} from './types'
