/**
 * TRIBUNAL T3 (loop tick 5) — re-verify acceptance criteria of 4 DONE_LOG
 * items as a single vitest spec so subsequent tribunals automatically
 * re-run it. If anything here ever fails, an earlier "done" task has rotted.
 *
 * THIS FILE IS LOOP-OWNED. It will be regenerated / extended by future
 * tribunals. Do not hand-edit unless you understand the protocol.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import {
    createFootprintController,
    createHeatmapController,
    createAnchoredVwapController,
    createMtfController,
    createPriceScale,
    createTimeScale,
    binBarToBuckets,
    computeAnchoredZoom,
    resampleBars,
} from '../index'

describe('TRIBUNAL — DONE_LOG re-verification', () => {
    describe('SAMPLE 1: b-4 + b-4b intake verb identity equality', () => {
        it('FootprintController.ingest === ingestTrade', () => {
            const c = createFootprintController({
                tickSize: 0.01,
                barIntervalMs: 60_000,
                imbalanceRatio: 3,
                fallbackClassifier: 'tick-rule',
            })
            expect(c.ingest).toBe(c.ingestTrade)
            c.dispose()
        })

        it('HeatmapController.ingest === ingestDelta', () => {
            const c = createHeatmapController({
                tickSize: 0.01,
                snapshotIntervalMs: 100,
                snapshotRingCapacity: 600,
                deltaArchiveMaxSize: 1_000_000,
                logColorRange: { sizeMin: 1, sizeMax: 1000 },
            })
            expect(c.ingest).toBe(c.ingestDelta)
            c.dispose()
        })

        it('AnchoredVwapController.setData === setBars && append === appendBar', () => {
            const c = createAnchoredVwapController()
            expect(c.setData).toBe(c.setBars)
            expect(c.append).toBe(c.appendBar)
            c.dispose()
        })

        it('MtfController.setData === setBaseBars && append === appendBaseBar', () => {
            const c = createMtfController()
            expect(c.setData).toBe(c.setBaseBars)
            expect(c.append).toBe(c.appendBaseBar)
            c.dispose()
        })
    })

    describe('SAMPLE 2: pre-loop 426c330 — Scale dispose silent no-op', () => {
        it('PriceScale.setVisibleRange post-dispose is silent + state frozen', () => {
            const s = createPriceScale({
                initialVisibleMin: 0,
                initialVisibleMax: 100,
                initialHeight: 400,
            })
            const minBefore = s.visibleMin()
            s.dispose()
            // Must NOT throw — the silent-no-op contract.
            s.setVisibleRange(50, 200)
            expect(s.visibleMin()).toBe(minBefore)
        })

        it('TimeScale.setFirstVisibleIndex post-dispose is silent + state frozen', () => {
            const s = createTimeScale({
                initialFirstVisibleIndex: 0,
                initialBarWidth: 10,
                initialLeftPadding: 0,
            })
            const fviBefore = s.firstVisibleIndex()
            s.dispose()
            s.setFirstVisibleIndex(100)
            expect(s.firstVisibleIndex()).toBe(fviBefore)
        })
    })

    describe('SAMPLE 3: b-6 partial — @internal helpers still on root barrel (runtime)', () => {
        it('binBarToBuckets is callable from the root barrel', () => {
            expect(typeof binBarToBuckets).toBe('function')
        })

        it('computeAnchoredZoom is callable from the root barrel', () => {
            expect(typeof computeAnchoredZoom).toBe('function')
        })

        it('resampleBars is callable from the root barrel', () => {
            expect(typeof resampleBars).toBe('function')
        })
    })

    describe('SAMPLE 4: b-1 — bench files + script wired', () => {
        it('packages/core has the expected bench file set', async () => {
            const benchDir = path.resolve(__dirname, '..', '__bench__')
            const entries = await fs.readdir(benchDir)
            const benches = entries.filter((f) => f.endsWith('.bench.ts'))
            // Initial set landed in b-1; `indicators.bench.ts` added in b-28
            // to lock per-indicator throughput numbers (LEDGER tick 32).
            expect(benches.sort()).toEqual(
                [
                    'indicators.bench.ts',
                    'orderBookHeatmap.bench.ts',
                    'scale.bench.ts',
                    'signal.bench.ts',
                    'volumeProfile.bench.ts',
                ].sort(),
            )
        })

        it('packages/core/package.json scripts.bench wired to vitest', async () => {
            const pkgPath = path.resolve(__dirname, '..', '..', 'package.json')
            const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'))
            expect(pkg.scripts?.bench).toBe('vitest bench --run')
        })
    })
})
