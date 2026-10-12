/** 独立宿主读取作用域布局时不得写回 IndexedDB。 */
import 'fake-indexeddb/auto'
import { expect, it, vi } from 'vitest'
import { configureBrowserPersistenceScope } from '@/foundation/persistence/persistence-scope.js'
import { createTestChartStateKernel } from '../../state/__tests__/helpers/createTestChartStateKernel.js'
import { LayoutManager, readActiveLayoutSettings } from '../impl/layoutManager.js'

it('读取账号与工作区的活动布局设置，不写回存储', async () => {
  configureBrowserPersistenceScope('account-one:workspace-one')
  const kernel = createTestChartStateKernel({ initialSettings: { theme: 'light' } })
  const manager = new LayoutManager({
    exportLayout: () => kernel.exportLayout(),
    applyLayout: (document) => kernel.applyLayout(document),
    createLayout: () => kernel.createLayout(),
  })
  try {
    await manager.initialize()
    kernel.settings.actions.patch({ theme: 'dark' })
    await manager.saveLayout({ name: 'Workspace theme' })
    const write = vi.spyOn(IDBObjectStore.prototype, 'put')
    expect(await readActiveLayoutSettings()).toMatchObject({ theme: 'dark' })
    expect(write).not.toHaveBeenCalled()
    write.mockRestore()
  } finally {
    await manager.dispose()
    kernel.dispose()
  }
})
