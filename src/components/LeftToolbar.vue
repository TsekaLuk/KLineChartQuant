<template>
  <nav class="left-toolbar" aria-label="图表工具栏">
    <div class="left-toolbar__group">
      <div
        v-for="tool in primaryTools"
        :key="tool.id"
        class="tool-item"
      >
        <button
          type="button"
          class="left-toolbar__button"
          :class="{ active: isActive(tool) }"
          :title="tool.title"
          :aria-label="tool.title"
          @click="selectTool(tool)"
          @pointerdown.stop
          @pointermove.stop
          @pointerup.stop
        >
          <component :is="tool.icon" class="tool-icon" aria-hidden="true" />
          <span
            v-if="tool.children && tool.children.length"
            class="corner-indicator"
            :class="{ open: openGroupId === tool.id }"
            @click.stop="toggleExpand(tool.id)"
            aria-label="展开子菜单"
          ></span>
        </button>

        <Transition name="dropdown">
          <div
            v-if="openGroupId === tool.id && tool.children && tool.children.length"
            class="tool-dropdown"
            @pointerdown.stop
            @pointermove.stop
            @pointerup.stop
          >
            <button
              v-for="child in tool.children"
              :key="child.id"
              type="button"
              class="left-toolbar__button"
              :class="{ active: selectedToolId === child.id }"
              :title="child.title"
              :aria-label="child.title"
              @click="selectChild(child)"
            >
              <component :is="child.icon" class="tool-icon" aria-hidden="true" />
            </button>
          </div>
        </Transition>
      </div>
    </div>

    <span class="left-toolbar__divider"></span>

    <div class="left-toolbar__group">
      <button
        type="button"
        class="left-toolbar__button"
        title="放大"
        aria-label="放大"
        @click="$emit('zoomIn')"
        @pointerdown.stop
        @pointermove.stop
        @pointerup.stop
      >
        <IconTablerZoomIn class="tool-icon" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="left-toolbar__button"
        title="缩小"
        aria-label="缩小"
        @click="$emit('zoomOut')"
        @pointerdown.stop
        @pointermove.stop
        @pointerup.stop
      >
        <IconTablerZoomOut class="tool-icon" aria-hidden="true" />
      </button>
    </div>

    <span class="left-toolbar__divider"></span>

    <div class="left-toolbar__group">
      <button
        type="button"
        class="left-toolbar__button"
        :title="isFullscreen ? '退出全屏' : '全屏显示'"
        :aria-label="isFullscreen ? '退出全屏' : '全屏显示'"
        @click="$emit('toggleFullscreen')"
        @pointerdown.stop
        @pointermove.stop
        @pointerup.stop
      >
        <IconTablerMinimize v-if="isFullscreen" class="tool-icon" aria-hidden="true" />
        <IconTablerMaximize v-else class="tool-icon" aria-hidden="true" />
      </button>
    </div>

    <span class="left-toolbar__divider"></span>

    <div class="left-toolbar__group">
      <button
        type="button"
        class="left-toolbar__button"
        title="设置"
        aria-label="设置"
        @click="openSettings"
        @pointerdown.stop
        @pointermove.stop
        @pointerup.stop
      >
        <IconTablerSettings class="tool-icon" aria-hidden="true" />
      </button>
    </div>
  </nav>

  <!-- 设置弹窗 -->
  <Teleport to="body">
    <Transition name="overlay">
      <div v-if="showSettings" class="settings-overlay" @click="closeSettings">
        <Transition name="modal">
          <div class="settings-modal" @click.stop>
            <!-- 头部 -->
            <div class="settings-header">
              <div class="header-left">
                <span class="settings-title">图表设置</span>
                <span class="settings-subtitle">个性化配置</span>
              </div>
              <div class="header-right">
                <button class="settings-close" @click="closeSettings">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <!-- 体部 -->
            <div class="settings-body">
              <div class="settings-item">
                <label class="settings-label">
                  <span>显示量价关系标记</span>
                  <input
                    type="checkbox"
                    class="settings-checkbox"
                    v-model="settings.showVolumePriceMarkers"
                  />
                </label>
              </div>
            </div>

            <!-- 底部 -->
            <div class="settings-footer">
              <button class="settings-btn reset" @click="resetSettings">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
                重置
              </button>
              <div class="footer-right">
                <button class="settings-btn cancel" @click="closeSettings">取消</button>
                <button class="settings-btn confirm" @click="confirmSettings">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  确定
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import IconTablerPointer from '~icons/tabler/pointer'
import IconTablerChartLine from '~icons/tabler/chart-line'
import IconTablerArrowUpRight from '~icons/tabler/arrow-up-right'
import IconTablerArrowRight from '~icons/tabler/arrow-right'
import IconTablerMinus from '~icons/tabler/minus'
import IconTablerSeparator from '~icons/tabler/separator'
import IconTablerCrosshair from '~icons/tabler/crosshair'
import IconTablerInfoCircle from '~icons/tabler/info-circle'
import IconTablerMaximize from '~icons/tabler/maximize'
import IconTablerMinimize from '~icons/tabler/minimize'
import IconTablerZoomIn from '~icons/tabler/zoom-in'
import IconTablerZoomOut from '~icons/tabler/zoom-out'
import IconTablerShape from '~icons/tabler/shape'
import IconTablerChartDots3 from '~icons/tabler/chart-dots-3'
import IconTablerCaretUpDown from '~icons/tabler/caret-up-down'
import IconTablerBrackets from '~icons/tabler/brackets'
import IconTablerSettings from '~icons/tabler/settings'
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY, type SettingItem } from '../config/chartSettings'

export interface ToolDef {
  id: string
  title: string
  icon: unknown
  children?: ToolDef[]
}

defineProps<{
  isFullscreen?: boolean
}>()

const emit = defineEmits<{
  (e: 'selectTool', toolId: string): void
  (e: 'toggleFullscreen'): void
  (e: 'zoomIn'): void
  (e: 'zoomOut'): void
  (e: 'settingsChange', settings: Record<string, boolean>): void
}>()

const primaryTools: ToolDef[] = [
  { id: 'cursor', title: '光标', icon: IconTablerPointer },
  {
    id: 'lines',
    title: '线条',
    icon: IconTablerChartLine,
    children: [
      { id: 'trend-line', title: '线段', icon: IconTablerChartLine },
      { id: 'ray', title: '射线', icon: IconTablerArrowUpRight },
      { id: 'h-line', title: '水平线', icon: IconTablerMinus },
      { id: 'h-ray', title: '水平射线', icon: IconTablerArrowRight },
      { id: 'v-line', title: '垂直线', icon: IconTablerSeparator },
      { id: 'crosshair-line', title: '十字线', icon: IconTablerCrosshair },
      { id: 'info-line', title: '信息线', icon: IconTablerInfoCircle },
    ],
  },
  {
    id: 'channels',
    title: '通道',
    icon: IconTablerShape,
    children: [
      { id: 'parallel-channel', title: '平行通道', icon: IconTablerShape },
      { id: 'regression-channel', title: '回归趋势', icon: IconTablerChartDots3 },
      { id: 'flat-line', title: '平滑顶底', icon: IconTablerCaretUpDown },
      { id: 'disjoint-channel', title: '不相交通道', icon: IconTablerBrackets },
    ],
  },
]

// ═══ 类型导出（供父组件使用）═══
export type { SettingItem } from '../config/chartSettings'

const selectedToolId = ref('cursor')
const openGroupId = ref<string | null>(null)
const showSettings = ref(false)

// 从 localStorage 加载设置，或使用默认值
function loadSettings(): Record<string, boolean> {
  try {
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      // 确保所有默认设置项都存在
      const result: Record<string, boolean> = {}
      DEFAULT_SETTINGS.forEach((item) => {
        result[item.key] = parsed[item.key] ?? item.default
      })
      return result
    }
  } catch {
    // 解析失败，使用默认值
  }
  // 返回默认设置
  const defaults: Record<string, boolean> = {}
  DEFAULT_SETTINGS.forEach((item) => {
    defaults[item.key] = item.default
  })
  return defaults
}

// 保存设置到 localStorage
function saveSettings(settings: Record<string, boolean>) {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // 保存失败，静默处理
  }
}

const settings = ref<Record<string, boolean>>(loadSettings())

function isActive(tool: ToolDef): boolean {
  if (selectedToolId.value === tool.id) return true
  if (tool.children) {
    return tool.children.some((c) => c.id === selectedToolId.value)
  }
  return false
}

function selectTool(tool: ToolDef) {
  if (tool.children?.length) {
    const hasActiveChild = tool.children.some((c) => c.id === selectedToolId.value)
    if (!hasActiveChild) {
      const first = tool.children[0]!
      selectedToolId.value = first.id
      emit('selectTool', first.id)
    }
    toggleExpand(tool.id)
    return
  }
  selectedToolId.value = tool.id
  emit('selectTool', tool.id)
  openGroupId.value = null
}

function selectChild(child: ToolDef) {
  selectedToolId.value = child.id
  emit('selectTool', child.id)
  openGroupId.value = null
}

function toggleExpand(groupId: string) {
  openGroupId.value = openGroupId.value === groupId ? null : groupId
}

function openSettings() {
  // 打开时重新加载保存的设置
  settings.value = loadSettings()
  showSettings.value = true
}

function closeSettings() {
  showSettings.value = false
}

function resetSettings() {
  // 重置为默认值
  const defaults: Record<string, boolean> = {}
  DEFAULT_SETTINGS.forEach((item) => {
    defaults[item.key] = item.default
  })
  settings.value = defaults
}

function confirmSettings() {
  // 保存到 localStorage
  saveSettings(settings.value)
  // 触发事件通知父组件
  emit('settingsChange', { ...settings.value })
  closeSettings()
}

// 暴露方法给父组件
function getCurrentSettings(): Record<string, boolean> {
  return { ...settings.value }
}

defineExpose({
  getSettings: getCurrentSettings,
})

function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.tool-item')) {
    openGroupId.value = null
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside, true)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside, true)
})
</script>

<style scoped>
.left-toolbar {
  flex: 0 0 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px 5px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fafbfc;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  box-sizing: border-box;
  user-select: none;
}

.left-toolbar__group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.left-toolbar__divider {
  width: 18px;
  height: 1px;
  background: #e5e7eb;
}

/* --- 工具按钮 --- */
.left-toolbar__button {
  position: relative;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    color 0.15s ease;
}

.left-toolbar__button:hover {
  border-color: #d1d5db;
  background: #f3f4f6;
  color: #374151;
}

.left-toolbar__button.active {
  border-color: #9ca3af;
  background: #e5e7eb;
  color: #1f2937;
}

.left-toolbar__button:focus-visible {
  outline: none;
  border-color: #6b7280;
}

.tool-icon {
  width: 16px;
  height: 16px;
}

/* --- 角标三角（TradingView 风格） --- */
.corner-indicator {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 8px;
  height: 8px;
  cursor: pointer;
  overflow: hidden;
}

.corner-indicator::after {
  content: '';
  position: absolute;
  right: 0;
  bottom: 0;
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-bottom: 5px solid currentColor;
  opacity: 0.45;
  transition: opacity 0.15s ease;
}

.left-toolbar__button:hover .corner-indicator::after {
  opacity: 0.7;
}

.left-toolbar__button.active .corner-indicator::after {
  opacity: 0.7;
}

.corner-indicator.open::after {
  opacity: 0.8;
}

/* --- 下拉菜单（与工具栏同配色、同按钮样式，高度对齐工具栏宽度） --- */
.tool-dropdown {
  position: absolute;
  left: calc(100% + 13px);
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  padding: 0 5px;
  height: 40px;
  background: rgba(250, 251, 252, 0.82);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  box-sizing: border-box;
  z-index: 100;
}

/* --- 工具项容器 --- */
.tool-item {
  position: relative;
}

/* --- 下拉动画 --- */
.dropdown-enter-active,
.dropdown-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-50%) translateX(-6px);
}

/* --- 响应式 --- */
@media (max-width: 768px), (max-height: 640px) {
  .left-toolbar {
    flex-basis: 36px;
    padding: 6px 4px;
    gap: 5px;
    border-radius: 5px;
  }

  .left-toolbar__group {
    gap: 3px;
  }

  .left-toolbar__button {
    width: 26px;
    height: 26px;
    border-radius: 3px;
  }

  .left-toolbar__divider {
    width: 16px;
  }

  .corner-indicator {
    width: 7px;
    height: 7px;
  }

  .corner-indicator::after {
    border-left-width: 4px;
    border-bottom-width: 4px;
  }

  .tool-dropdown {
    height: 36px;
  }
}

/* ═══ 设置弹窗样式（参考 IndicatorParams.vue）═══ */
.settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.settings-modal {
  background: #ffffff;
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.15);
  min-width: 340px;
  max-width: 420px;
  width: 90vw;
  overflow: hidden;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #f8f8f8;
  border-bottom: 1px solid #e8e8e8;
}

.header-left {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-title {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
  letter-spacing: 0.2px;
}

.settings-subtitle {
  font-size: 11px;
  color: #999;
}

.settings-close {
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #888;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  padding: 0;
}

.settings-close:hover {
  background: #f0f0f0;
  color: #333;
  border-color: #ccc;
}

.settings-close svg {
  width: 14px;
  height: 14px;
}

.settings-body {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.settings-item {
  padding: 8px 12px;
  border-radius: 8px;
  background: #f8f8f8;
  border: 1px solid #e8e8e8;
}

.settings-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: #333;
  cursor: pointer;
}

.settings-checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: #1a1a1a;
}

.settings-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: #f8f8f8;
  border-top: 1px solid #e8e8e8;
}

.footer-right {
  display: flex;
  gap: 8px;
}

.settings-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 14px;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s;
  line-height: 1.4;
}

.settings-btn svg {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}

.settings-btn.reset {
  background: transparent;
  border-color: #d0d0d0;
  color: #666;
}

.settings-btn.reset:hover {
  border-color: #c0392b;
  color: #e74c3c;
  background: rgba(231, 76, 60, 0.08);
}

.settings-btn.cancel {
  background: transparent;
  border-color: #d0d0d0;
  color: #666;
}

.settings-btn.cancel:hover {
  background: #f0f0f0;
  color: #333;
  border-color: #bbb;
}

.settings-btn.confirm {
  background: #1a1a1a;
  border-color: #1a1a1a;
  color: #fff;
}

.settings-btn.confirm:hover {
  background: #333;
  border-color: #333;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
  transform: translateY(-1px);
}

.settings-btn.confirm:active {
  transform: translateY(0);
  box-shadow: none;
}
</style>
