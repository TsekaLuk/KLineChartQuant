export interface TooltipPositionInput {
  mouseX: number
  mouseY: number
  viewWidth: number
  viewHeight: number
  plotWidth: number
  plotHeight: number
  tooltipSize: { width: number; height: number }
  useAnchorPositioning: boolean
}

export interface TooltipPositionOutput {
  pos: { x: number; y: number }
  anchorPlacement?: 'right-bottom' | 'left-bottom'
}

export function computeTooltipPosition(input: TooltipPositionInput): TooltipPositionOutput {
  const padding = 12
  const preferGap = 14

  if (input.useAnchorPositioning) {
    const tooltipW = input.tooltipSize.width
    const rightCandidateX = input.mouseX + preferGap
    const rightWouldOverflow = rightCandidateX + tooltipW + padding > input.plotWidth
    return {
      anchorPlacement: rightWouldOverflow ? 'left-bottom' : 'right-bottom',
      pos: {
        x: Math.min(Math.max(input.mouseX, padding), Math.max(padding, input.plotWidth - padding)),
        y: Math.min(Math.max(input.mouseY, padding), Math.max(padding, input.plotHeight - padding)),
      },
    }
  }

  const tooltipW = input.tooltipSize.width
  const tooltipH = input.tooltipSize.height
  const rightX = input.mouseX + preferGap
  const leftX = input.mouseX - preferGap - tooltipW
  const desiredX = rightX + tooltipW + padding <= input.viewWidth ? rightX : leftX
  const desiredY = input.mouseY + preferGap
  const maxX = Math.max(padding, input.viewWidth - tooltipW - padding)
  const maxY = Math.max(padding, input.viewHeight - tooltipH - padding)
  return {
    pos: {
      x: Math.min(Math.max(desiredX, padding), maxX),
      y: Math.min(Math.max(desiredY, padding), maxY),
    },
  }
}
