/**
 * Vitest setup for @klinechart-quant/angular.
 *
 * Loads @angular/compiler so the JIT path is available for components
 * decorated with @Component when they run outside a TestBed (Angular's
 * partial-AOT artefacts otherwise fail with
 * "needs to be compiled using the JIT compiler").
 */

import '@angular/compiler'
