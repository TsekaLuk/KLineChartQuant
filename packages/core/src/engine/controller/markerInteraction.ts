import type { MarkerEntity, CustomMarkerEntity, MarkerManager } from '../marker/registry'

/** Marker交互状态，管理标记 hover/click 状态和回调，与 InteractionController 正交。 */
export class MarkerInteractionState {
  hoveredMarkerId: string | null = null
  clickedMarkerId: string | null = null
  hoveredMarkerData: MarkerEntity | null = null
  clickedMarkerData: MarkerEntity | null = null
  hoveredCustomMarker: CustomMarkerEntity | null = null

  private onMarkerHoverCallback?: (marker: MarkerEntity | null) => void
  private onMarkerClickCallback?: (marker: MarkerEntity) => void
  private onCustomMarkerHoverCallback?: (marker: CustomMarkerEntity | null) => void
  private onCustomMarkerClickCallback?: (marker: CustomMarkerEntity) => void

  setOnMarkerHover(callback: (marker: MarkerEntity | null) => void) {
    this.onMarkerHoverCallback = callback
  }

  setOnMarkerClick(callback: (marker: MarkerEntity) => void) {
    this.onMarkerClickCallback = callback
  }

  setOnCustomMarkerHover(callback: (marker: CustomMarkerEntity | null) => void) {
    this.onCustomMarkerHoverCallback = callback
  }

  setOnCustomMarkerClick(callback: (marker: CustomMarkerEntity) => void) {
    this.onCustomMarkerClickCallback = callback
  }

  handleClick(hitMarker: MarkerEntity): void {
    this.clickedMarkerId = hitMarker.id
    this.clickedMarkerData = hitMarker
    this.onMarkerClickCallback?.(hitMarker)
  }

  /** 从坐标更新 hover 状态。返回 true 表示命中 marker/custom-marker，调用方应跳过后续 hover 逻辑。 */
  updateHoverFromPoint(
    worldX: number,
    mouseX: number,
    mouseY: number,
    markerManager: MarkerManager,
  ): boolean {
    const hitMarker = markerManager.hitTest(worldX, mouseY, 3)
    if (hitMarker) {
      return this.enterMarkerHover(hitMarker, markerManager)
    }
    this.leaveMarkerHover(markerManager)

    const hitCustomMarker = markerManager.hitTestCustomMarker(mouseX, mouseY)
    if (hitCustomMarker) {
      return this.enterCustomMarkerHover(hitCustomMarker, markerManager)
    }
    this.leaveCustomMarkerHover()

    return false
  }

  private enterMarkerHover(hitMarker: MarkerEntity, markerManager: MarkerManager): true {
    if (this.hoveredMarkerId !== hitMarker.id) {
      this.hoveredMarkerId = hitMarker.id
      this.hoveredMarkerData = hitMarker
      markerManager.setHover(hitMarker.id)
      this.onMarkerHoverCallback?.(hitMarker)
    }
    if (this.hoveredCustomMarker !== null) {
      this.hoveredCustomMarker = null
      this.onCustomMarkerHoverCallback?.(null)
    }
    return true
  }

  private leaveMarkerHover(markerManager: MarkerManager): void {
    if (this.hoveredMarkerId !== null) {
      this.hoveredMarkerId = null
      this.hoveredMarkerData = null
      markerManager.setHover(null)
      this.onMarkerHoverCallback?.(null)
    } else {
      this.hoveredMarkerData = null
    }
  }

  private enterCustomMarkerHover(hitCustomMarker: CustomMarkerEntity, markerManager: MarkerManager): true {
    if (this.hoveredCustomMarker?.id !== hitCustomMarker.id) {
      this.hoveredCustomMarker = hitCustomMarker
      this.onCustomMarkerHoverCallback?.(hitCustomMarker)
    }
    if (this.hoveredMarkerId !== null) {
      this.hoveredMarkerId = null
      this.hoveredMarkerData = null
      markerManager.setHover(null)
      this.onMarkerHoverCallback?.(null)
    }
    return true
  }

  private leaveCustomMarkerHover(): void {
    if (this.hoveredCustomMarker !== null) {
      this.hoveredCustomMarker = null
      this.onCustomMarkerHoverCallback?.(null)
    }
  }

  /** 清空 hover 状态并触发回调（拖拽/离开时调用）。需要 markerManager 以便同步清除 Native hover。 */
  clearAll(markerManager: MarkerManager): void {
    if (this.hoveredMarkerId !== null) {
      this.hoveredMarkerId = null
      this.hoveredMarkerData = null
      markerManager.setHover(null)
      this.onMarkerHoverCallback?.(null)
    } else {
      this.hoveredMarkerData = null
    }
    if (this.hoveredCustomMarker !== null) {
      this.hoveredCustomMarker = null
      this.onCustomMarkerHoverCallback?.(null)
    }
  }

  /** 全量重置（数据更新时调用，不触发热点回调） */
  reset(): void {
    this.hoveredMarkerId = null
    this.clickedMarkerId = null
    this.hoveredMarkerData = null
    this.clickedMarkerData = null
    this.hoveredCustomMarker = null
  }
}
