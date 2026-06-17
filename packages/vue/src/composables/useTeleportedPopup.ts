import { ref, type Ref } from 'vue'

export function useTeleportedPopup(
  triggerRef: Ref<HTMLElement | null>,
  popupRef: Ref<HTMLElement | null>,
  gap = 4,
) {
  const popupStyle = ref<Record<string, string>>({})

  function updatePosition() {
    const trigger = triggerRef.value
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    popupStyle.value = {
      position: 'fixed',
      top: `${rect.bottom + gap}px`,
      left: `${rect.left}px`,
    }
  }

  function startPositionSync() {
    updatePosition()
    document.addEventListener('scroll', updatePosition, { capture: true, passive: true })
    window.addEventListener('resize', updatePosition, { passive: true })
  }

  function stopPositionSync() {
    document.removeEventListener('scroll', updatePosition, { capture: true })
    window.removeEventListener('resize', updatePosition)
  }

  return { popupStyle, updatePosition, startPositionSync, stopPositionSync }
}
