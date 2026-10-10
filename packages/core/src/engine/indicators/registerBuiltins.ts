/** 内置定义装配入口：静态目录随注册表同步可用，系统定义静态装配，指标实现按需或一次性加载。 */
import { GENERIC_ERROR_CODES, KLineChartError } from '../../errors.js'
import { registerBuiltinRenderers } from './generated/builtinRenderers.js'
import {
  getRegisteredIndicatorDefinitions,
  loadAllIndicatorDefinitions,
} from './indicatorDefinitionRegistry.js'

let loaded = false

/** 加载全部内置定义的实现；并发调用共享加载任务，失败可重试，注册按身份幂等。 */
export async function loadBuiltinIndicators(): Promise<void> {
  registerBuiltinRenderers()
  await loadAllIndicatorDefinitions()
  loaded = true
}

/** 装配图表视图自身需要的系统定义（K 线标注、最新价、分时主线等）。 */
export async function loadSystemIndicators(): Promise<void> {
  registerBuiltinRenderers()
}

/** 返回已完成装配的定义目录，未初始化时报告调用顺序错误。 */
export function getBuiltinIndicatorDefinitions() {
  if (!loaded) {
    throw new KLineChartError(
      GENERIC_ERROR_CODES.INVALID_STATE,
      'Builtin indicators not loaded yet. Call await loadBuiltinIndicators() first.',
    )
  }
  return getRegisteredIndicatorDefinitions()
}

/** 查询内置指标是否已成功完成首次装配。 */
export function isBuiltinIndicatorsLoaded(): boolean {
  return loaded
}
