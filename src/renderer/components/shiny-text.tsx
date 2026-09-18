import { motion, useAnimationFrame, useMotionValue, useTransform } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { cn } from '@/shadcn/utils'

import { useAppReducedMotion } from './theme-provider'

interface ShinyTextProps {
  text: string
  disabled?: boolean
  speed?: number
  className?: string
  color?: string
  shineColor?: string
  spread?: number
  yoyo?: boolean
  pauseOnHover?: boolean
  direction?: 'left' | 'right'
  delay?: number
}

function ShinyText({
  text,
  disabled = false,
  speed = 2,
  className,
  color = 'color-mix(in oklab, var(--foreground-subtle), transparent 40%)',
  shineColor = 'var(--foreground)',
  spread = 120,
  yoyo = false,
  pauseOnHover = false,
  direction = 'left',
  delay = 1,
}: ShinyTextProps) {
  const [isPaused, setIsPaused] = useState(false)
  const progress = useMotionValue(0)
  const prefersReducedMotion = useAppReducedMotion()
  const elapsedRef = useRef(0)
  const lastTimeRef = useRef<number | null>(null)
  const directionRef = useRef(direction === 'left' ? 1 : -1)
  const animationDisabled = disabled || prefersReducedMotion
  const animationDuration = Math.max(speed, 0.1) * 1000
  const delayDuration = Math.max(delay, 0) * 1000

  useAnimationFrame((time) => {
    if (animationDisabled || isPaused) {
      lastTimeRef.current = null
      return
    }

    if (lastTimeRef.current === null) {
      lastTimeRef.current = time
      return
    }

    const deltaTime = time - lastTimeRef.current
    lastTimeRef.current = time
    elapsedRef.current += deltaTime

    if (yoyo) {
      const cycleDuration = animationDuration + delayDuration
      const fullCycle = cycleDuration * 2
      const cycleTime = elapsedRef.current % fullCycle

      if (cycleTime < animationDuration) {
        const value = (cycleTime / animationDuration) * 100
        progress.set(directionRef.current === 1 ? value : 100 - value)
      } else if (cycleTime < cycleDuration) {
        progress.set(directionRef.current === 1 ? 100 : 0)
      } else if (cycleTime < cycleDuration + animationDuration) {
        const reverseTime = cycleTime - cycleDuration
        const value = 100 - (reverseTime / animationDuration) * 100
        progress.set(directionRef.current === 1 ? value : 100 - value)
      } else {
        progress.set(directionRef.current === 1 ? 0 : 100)
      }
      return
    }

    const cycleDuration = animationDuration + delayDuration
    const cycleTime = elapsedRef.current % cycleDuration

    if (cycleTime < animationDuration) {
      const value = (cycleTime / animationDuration) * 100
      progress.set(directionRef.current === 1 ? value : 100 - value)
    } else {
      progress.set(directionRef.current === 1 ? 100 : 0)
    }
  })

  useEffect(() => {
    directionRef.current = direction === 'left' ? 1 : -1
    elapsedRef.current = 0
    lastTimeRef.current = null
    progress.set(direction === 'left' ? 0 : 100)
  }, [direction, progress])

  const backgroundPosition = useTransform(progress, (value) => `${150 - value * 2}% center`)

  const handleMouseEnter = useCallback(() => {
    if (pauseOnHover) setIsPaused(true)
  }, [pauseOnHover])

  const handleMouseLeave = useCallback(() => {
    if (pauseOnHover) setIsPaused(false)
  }, [pauseOnHover])

  return (
    <motion.span
      className={cn('shiny-text', className)}
      data-slot="shiny-text"
      style={{
        backgroundImage: `linear-gradient(${spread}deg, ${color} 0%, ${color} 40%, ${shineColor} 50%, ${color} 60%, ${color} 100%)`,
        backgroundPosition,
        backgroundSize: '200% auto',
        backgroundClip: 'text',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {text}
    </motion.span>
  )
}

export { ShinyText }
export type { ShinyTextProps }
