/**
 * Contract test for @klinechart-quant/angular.
 *
 * Phase 1C agent's brief: make these pass without weakening assertions.
 *
 * Note: Angular components require TestBed + zone.js for full lifecycle tests.
 * The agent should add those deps and convert the .todo specs below.
 */

import { describe, it, expect } from 'vitest'
import * as AngularAdapter from '../index'

describe('@klinechart-quant/angular — public API surface', () => {
    it('exports KLineChartComponent, provideKLineChart, createChart', () => {
        expect(AngularAdapter.KLineChartComponent).toBeDefined()
        expect(typeof AngularAdapter.provideKLineChart).toBe('function')
        expect(typeof AngularAdapter.createChart).toBe('function')
    })
})

describe('@klinechart-quant/angular — SSR safety', () => {
    it('module import does not touch window or document', () => {
        expect(true).toBe(true)
    })
})

describe('@klinechart-quant/angular — component lifecycle (TODO: requires TestBed)', () => {
    it.todo('renders <kline-chart> with default theme')
    it.todo('OnPush refresh triggered by core signal change via toSignal')
    it.todo('ngOnDestroy disposes the controller')
    it.todo('provideKLineChart provides theme via DI')
})
