/**
 * Renderer abstraction barrel.
 *
 * The two interfaces (`SurfaceBackend`, `Renderer`) define the contract every
 * GPU backend implements. v0's WebGL code (in `src/core/renderers/`) will be
 * refactored to fit behind these in a follow-up PR; this PR ships the contract
 * only, so subsequent PRs can land WebGPU and WebGL impls in parallel without
 * either blocking on the other's interface decisions.
 */

export type {
    SurfaceBackend,
    SurfaceRegion,
    CompositeOptions,
} from './SurfaceBackend'

export type {
    Renderer,
    RendererCapabilities,
    BufferHandle,
    PipelineHandle,
    ComputePipelineHandle,
    BufferUsage,
    DrawInstancesParams,
    DrawLinesParams,
    DispatchComputeParams,
} from './Renderer'
