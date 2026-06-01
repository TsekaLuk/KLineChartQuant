import type { IndicatorMetadata } from './indicatorMetadata'

/**
 * IndicatorRegistry - 指标注册表
 *
 * 管理所有已注册指标的元数据
 * 支持运行时动态注册/注销指标
 */
export class IndicatorRegistry {
    private indicators = new Map<string, IndicatorMetadata>()

    /**
     * 注册指标
     * @param meta - 指标元数据
     * @throws 如果 name 为空或元数据无效
     */
    register<T>(meta: IndicatorMetadata<T>): void {
        // 验证必填字段
        if (!meta.name || typeof meta.name !== 'string') {
            throw new Error('[IndicatorRegistry] Indicator name is required')
        }

        if (!meta.displayName) {
            throw new Error(`[IndicatorRegistry] displayName is required for indicator '${meta.name}'`)
        }

        if (!meta.rendererFactory || typeof meta.rendererFactory !== 'function') {
            throw new Error(`[IndicatorRegistry] rendererFactory is required for indicator '${meta.name}'`)
        }

        // 检查重复注册
        if (this.indicators.has(meta.name)) {
            console.warn(`[IndicatorRegistry] Indicator '${meta.name}' already registered, overwriting`)
        }

        this.indicators.set(meta.name, meta as IndicatorMetadata)
    }

    /**
     * 注销指标
     * @param name - 指标名称
     * @returns 是否成功注销
     */
    unregister(name: string): boolean {
        return this.indicators.delete(name)
    }

    /**
     * 获取指定指标的元数据
     * @param name - 指标名称
     * @returns 元数据或 undefined
     */
    get(name: string): IndicatorMetadata | undefined {
        return this.indicators.get(name)
    }

    /**
     * 检查指标是否已注册
     * @param name - 指标名称
     */
    has(name: string): boolean {
        return this.indicators.has(name)
    }

    /**
     * 获取所有已注册指标
     */
    getAll(): readonly IndicatorMetadata[] {
        return Array.from(this.indicators.values())
    }

    /**
     * 获取主图指标
     */
    getMainIndicators(): readonly IndicatorMetadata[] {
        return this.getAll().filter(m => m.category === 'main')
    }

    /**
     * 获取副图指标
     */
    getSubIndicators(): readonly IndicatorMetadata[] {
        return this.getAll().filter(m => m.category === 'sub')
    }

    /**
     * 获取指标名称列表
     */
    getNames(): string[] {
        return Array.from(this.indicators.keys())
    }

    /**
     * 清空所有注册指标
     */
    clear(): void {
        this.indicators.clear()
    }

    /**
     * 获取已注册指标数量
     */
    get size(): number {
        return this.indicators.size
    }
}
