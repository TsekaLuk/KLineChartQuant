import type { IndicatorMetadata, IndicatorCategory, StateKey, RendererFactory } from './indicatorMetadata'
import type { PluginHost } from '../../plugin'

export interface IndicatorDefinitionConfig {
    name: string
    displayName: string
    category: IndicatorCategory
    stateKey: StateKey
    defaultPaneId: string
    paneIdField?: keyof import('./workerProtocol').IndicatorConfigSnapshot
    allowMainPane?: boolean
    applyResult?: (host: PluginHost, state: unknown, paneId: string) => void
}

type IndicatorDefinitionClass = {
    new(...args: never[]): unknown
    rendererFactory?: RendererFactory
}

const indicatorDefinitions = new Map<string, IndicatorMetadata>()

/**
 * 标准类装饰器：在模块加载时收集指标定义
 *
 * 使用方式：
 * @Indicator({ name: 'ma', ... })
 * class MADefinition {
 *   static rendererFactory = createMARendererPlugin
 * }
 */
export function Indicator(config: IndicatorDefinitionConfig) {
    return function <T extends IndicatorDefinitionClass>(value: T, context: ClassDecoratorContext<T>): T {
        context.addInitializer(function (this: T) {
            const rendererFactory = this.rendererFactory
            if (typeof rendererFactory !== 'function') {
                throw new Error(`[Indicator] '${config.name}' definition must expose static rendererFactory`)
            }

            indicatorDefinitions.set(config.name, {
                ...config,
                rendererFactory,
                paneIdField: config.paneIdField,
                allowMainPane: config.allowMainPane,
                applyResult: config.applyResult,
            })
        })

        return value
    }
}

export function getRegisteredIndicatorDefinitions(): readonly IndicatorMetadata[] {
    return Array.from(indicatorDefinitions.values())
}

export function getRegisteredIndicatorDefinition(name: string): IndicatorMetadata | undefined {
    return indicatorDefinitions.get(name)
}

export function clearRegisteredIndicatorDefinitionsForTest(): void {
    indicatorDefinitions.clear()
}
