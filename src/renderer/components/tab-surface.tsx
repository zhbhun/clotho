import { type MotionStyle, motion } from 'motion/react'

import './session-tabs.css'

export function TabSurface({ visible = true, style }: { visible?: boolean; style?: MotionStyle }) {
  return (
    <motion.div
      className="session-tab-active-surface"
      data-visible={visible ? 'true' : undefined}
      data-session-tab-active-surface
      style={style}
    >
      {/* Chrome-style bottom flares: quarter-circle fillets that leave the
              side edge vertically and meet the divider horizontally, tangent on
              both ends. Fixed size so the width spring never distorts them. The
              curve endpoints sit on the 1px divider lines' centers (0.5px in
              from the svg edges) so the strokes join without a pixel offset. */}
      <svg aria-hidden className="session-tab-active-flank" data-side="left" viewBox="0 0 13 12">
        <path
          className="session-tab-active-flank-fill"
          d="M0.5 11.5 C7.13 11.5 12.5 6.63 12.5 0 L13 0 L13 12 L0 12 Z"
        />
        <path className="session-tab-active-flank-edge" d="M0.5 11.5 C7.13 11.5 12.5 6.63 12.5 0" />
      </svg>
      <svg aria-hidden className="session-tab-active-flank" data-side="right" viewBox="0 0 13 12">
        <path
          className="session-tab-active-flank-fill"
          d="M12.5 11.5 C5.87 11.5 0.5 6.63 0.5 0 L0 0 L0 12 L13 12 Z"
        />
        <path className="session-tab-active-flank-edge" d="M12.5 11.5 C5.87 11.5 0.5 6.63 0.5 0" />
      </svg>
    </motion.div>
  )
}
