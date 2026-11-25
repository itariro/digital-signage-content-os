type Gap = { x: number; y: number; w: number; h: number }

export function CanvasBezelOverlay({
  mode,
  gaps,
}: {
  mode: 'show' | 'hide' | 'collapse'
  gaps: Gap[]
}) {
  if (mode !== 'show') return null
  return (
    <>
      {gaps.map((gap, index) => (
        <div
          key={`${gap.x}:${gap.y}:${index}`}
          data-canvas-bezel="true"
          style={{
            position: 'absolute',
            left: gap.x,
            top: gap.y,
            width: gap.w,
            height: gap.h,
            background: '#050505',
            pointerEvents: 'none',
          }}
        />
      ))}
    </>
  )
}
