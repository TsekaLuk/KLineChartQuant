<template>
  <div
    class="canvas-toolbar-stack"
    @pointerdown.stop
    @pointermove.stop
    @pointerup.stop
  >
    <slot />
  </div>
</template>

<style scoped>
.canvas-toolbar-stack {
  position: absolute;
  left: 50%;
  top: 10px;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  z-index: 100;
  pointer-events: none;
}
</style>
