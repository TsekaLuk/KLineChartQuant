import { inject, provide, computed, type Ref, type InjectionKey } from 'vue'

const FULLSCREEN_TARGET_KEY: InjectionKey<Ref<HTMLElement | null>> =
  Symbol('fullscreen-teleport-target')

export function provideFullscreenTeleportTarget(targetRef: Ref<HTMLElement | null>): void {
  provide(FULLSCREEN_TARGET_KEY, targetRef)
}

export function useFullscreenTeleportTarget() {
  // null = no provider in ancestor tree (degraded scenario)
  const targetRef = inject(FULLSCREEN_TARGET_KEY, null)

  return computed<HTMLElement | string>(() => {
    // targetRef null → no provider; targetRef.value null → container not mounted yet
    return targetRef?.value ?? 'body'
  })
}
