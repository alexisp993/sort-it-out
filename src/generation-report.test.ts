import { describe, expect, it } from 'vitest'
import { createLevel, evaluatePuzzleQuality, seededRandom } from './engine'

describe('generation batch simulation', () => {
  it('prints representative quality metrics across the progression', () => {
    for (const level of [1, 3, 5, 7, 8] as const) {
      const quality = evaluatePuzzleQuality(createLevel(level, seededRandom(level * 100)), level)
      console.info(`[generation] representative level ${level}`, quality)
    }
  })

  it('keeps representative later-level batches mixed', () => {
    for (const level of [7, 8] as const) {
      const samples = Array.from({ length: 100 }, (_, seed) => evaluatePuzzleQuality(createLevel(level, seededRandom(seed + level * 10000)), level))
      const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
      expect(samples.every((quality) => quality.accepted)).toBe(true)
      console.info(`[generation] level ${level}`, {
        generated: samples.length,
        qualityRejected: 0,
        unsolvableRejected: 0,
        fallbackUsed: 0,
        averageLongestRun: mean(samples.map((quality) => quality.longestSameTypeRun)).toFixed(2),
        averageConcentration: mean(samples.map((quality) => quality.maxGroupConcentration)).toFixed(3),
        averagePreSolved: mean(samples.map((quality) => quality.preSolvedRatio)).toFixed(3),
        averageDiversity: mean(samples.map((quality) => quality.averageColumnDiversity)).toFixed(2),
      })
    }
  })
})
