<template>
  <div class="canvas-toolbar" @pointerdown.stop @pointermove.stop @pointerup.stop>
    <slot />
  </div>
</template>

<style scoped>
.canvas-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  background: color-mix(in srgb, var(--klc-color-background) 92%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--klc-color-border-button);
  border-radius: 8px;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.08),
    0 1px 2px rgba(0, 0, 0, 0.04);
  user-select: none;
  pointer-events: auto;
}

.canvas-toolbar :deep(.toolbar-btn) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 26px;
  padding: 0 10px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--klc-color-axis-text);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.canvas-toolbar :deep(.toolbar-btn:hover) {
  background: var(--klc-color-grid-minor);
  color: var(--klc-color-foreground);
}

.canvas-toolbar :deep(.toolbar-btn--delete) {
  width: 26px;
  padding: 0;
}

.canvas-toolbar :deep(.toolbar-btn--delete:hover) {
  color: #dc2626;
  background: color-mix(in srgb, #dc2626 10%, transparent);
}

.canvas-toolbar :deep(.delete-icon) {
  width: 14px;
  height: 14px;
}
</style>
