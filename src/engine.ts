const CLASSIC_TILE_TYPES = ['pumpkin', 'hammer', 'tomato', 'pineapple', 'barrel', 'blueberry', 'fire', 'grapes', 'mushroom'] as const
const FARM_TILE_TYPES = ['pineapple', 'llama', 'cow', 'milk', 'lemon', 'fox', 'frog', 'bee', 'strawberry'] as const
export const TILE_TYPES = [...CLASSIC_TILE_TYPES, ...FARM_TILE_TYPES] as const
export type TileType = (typeof TILE_TYPES)[number]
export type Level = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
export const MAX_LEVEL: Level = 10
export const LEVEL_COLUMNS: Record<Level, number> = { 1: 4, 2: 5, 3: 6, 4: 7, 5: 8, 6: 9, 7: 10, 8: 10, 9: 10, 10: 10 }
export const LEVEL_ROWS: Record<Level, number> = { 1: 5, 2: 5, 3: 6, 4: 6, 5: 7, 6: 8, 7: 8, 8: 9, 9: 10, 10: 10 }
export const LEVEL_TYPES: Record<Level, number> = { 1: 3, 2: 4, 3: 5, 4: 6, 5: 7, 6: 8, 7: 9, 8: 9, 9: 9, 10: 9 }
export const LEVEL_CLUES: Record<Level, number> = { 1: 8, 2: 10, 3: 14, 4: 16, 5: 20, 6: 24, 7: 8, 8: 7, 9: 6, 10: 4 }
export const LEVEL_RESERVES: Record<Level, number> = { 1: 3, 2: 3, 3: 3, 4: 2, 5: 2, 6: 2, 7: 1, 8: 1, 9: 1, 10: 1 }
export const MAX_EXTRA_RESERVES = 1

export interface PuzzleQuality {
  accepted: boolean
  score: number
  longestSameTypeRun: number
  maxGroupConcentration: number
  averageColumnDiversity: number
  distributionScore: number
  preSolvedRatio: number
  revealPredictability: number
  reasons: string[]
}

type QualityThresholds = {
  maxRun: number
  maxConcentration: number
  minDiversity: number
  minDistribution: number
  maxPreSolved: number
  maxRevealRun: number
}

const QUALITY_THRESHOLDS: Record<Level, QualityThresholds> = {
  1: { maxRun: 10, maxConcentration: 1, minDiversity: 1, minDistribution: 0, maxPreSolved: 1, maxRevealRun: 10 },
  2: { maxRun: 5, maxConcentration: 1, minDiversity: 1, minDistribution: 0, maxPreSolved: 1, maxRevealRun: 5 },
  3: { maxRun: 6, maxConcentration: 1, minDiversity: 1, minDistribution: 0, maxPreSolved: 1, maxRevealRun: 6 },
  4: { maxRun: 6, maxConcentration: 1, minDiversity: 1, minDistribution: 0, maxPreSolved: 1, maxRevealRun: 6 },
  5: { maxRun: 7, maxConcentration: 1, minDiversity: 1, minDistribution: 0, maxPreSolved: 1, maxRevealRun: 7 },
  6: { maxRun: 8, maxConcentration: 1, minDiversity: 1, minDistribution: 0, maxPreSolved: 1, maxRevealRun: 8 },
  7: { maxRun: 2, maxConcentration: 0.7, minDiversity: 1.8, minDistribution: 0.2, maxPreSolved: 0.65, maxRevealRun: 2 },
  8: { maxRun: 2, maxConcentration: 0.7, minDiversity: 1.8, minDistribution: 0.2, maxPreSolved: 0.65, maxRevealRun: 2 },
  9: { maxRun: 2, maxConcentration: 0.7, minDiversity: 1.8, minDistribution: 0.2, maxPreSolved: 0.65, maxRevealRun: 2 },
  10: { maxRun: 2, maxConcentration: 0.7, minDiversity: 1.8, minDistribution: 0.2, maxPreSolved: 0.65, maxRevealRun: 2 },
}

const MAX_GENERATION_ATTEMPTS = 12

export interface Tile {
  id: string
  type: TileType
  hidden: boolean
}

export type Selection =
  | { kind: 'column'; column: number; row: number }
  | { kind: 'tray'; index: number }

export interface GameState {
  level: Level
  columns: Array<Array<Tile | null>>
  columnTypes: Array<TileType | null>
  tray: Array<Tile | null>
  reserveAdds: number
  selected: Selection[]
  moveCount: number
  revealedCount: number
  status: 'playing' | 'won' | 'no-legal-move'
}

let nextId = 0
const tile = (type: TileType, hidden = true): Tile => ({ id: `tile-${nextId++}`, type, hidden })

export function createLevel(level: Level = 1, random = Math.random): GameState {
  const rows = LEVEL_ROWS[level]
  const columns = LEVEL_COLUMNS[level]
  const tileTypes = level >= 7 ? FARM_TILE_TYPES : CLASSIC_TILE_TYPES
  const typeOrder = shuffle([...tileTypes], random).slice(0, LEVEL_TYPES[level])
  const totalTiles = (columns - 1) * rows
  const solvedPool = typeOrder.flatMap((type) => Array<TileType>(rows).fill(type))
  const solved = buildLevel(level, solvedPool, Array<boolean>(totalTiles).fill(true), typeOrder)
  const clues = LEVEL_CLUES[level]
  let scrambled: GameState
  let visibility: boolean[]
  if (level >= 7) {
    let best: { state: GameState; quality: PuzzleQuality } | null = null
    let attempts = 0
    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
      attempts = attempt + 1
      const candidate = resetGeneratedLevel(
        constrainedScrambleState(solved, random),
        level,
        sparseLaterVisibility(columns, rows, clues, random),
      )
      if (!hasLegalMove(candidate)) continue
      const quality = evaluatePuzzleQuality(candidate, level)
      if (!best || quality.score > best.quality.score) best = { state: candidate, quality }
      if (quality.accepted) {
        if (isLocalDevelopment() && attempts > 1) console.debug('[Sort It Out] regenerated later level', { level, attempts, quality })
        return candidate
      }
    }
    // The balanced cycle construction is a known reversible fallback. It is
    // intentionally returned instead of throwing if a custom RNG is hostile.
    if (isLocalDevelopment()) console.warn('[Sort It Out] later-level quality fallback', { level, attempts, quality: best?.quality })
    return best!.state
  } else {
    const legacy = legacyScrambleState(solved, random)
    if (reverseScramble(legacy.state, legacy.plan).status !== 'won') throw new Error('Generated level failed solvability validation')
    scrambled = legacy.state
    visibility = shuffle([...Array<boolean>(clues).fill(true), ...Array<boolean>(totalTiles - clues).fill(false)], random)
  }
  return resetGeneratedLevel(scrambled, level, visibility)
}

function isLocalDevelopment(): boolean {
  return typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
}

/** A reproducible RNG for generation tests, diagnostics, and bug reports. */
export function seededRandom(seed: number): () => number {
  let value = seed >>> 0
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 4294967296
  }
}

export function evaluatePuzzleQuality(state: GameState, level: Level = state.level): PuzzleQuality {
  const lanes = state.columns.slice(1).filter((column) => column.some(Boolean))
  const populatedItems = lanes.flatMap((column) => column.filter((item): item is Tile => Boolean(item)))
  const typeCounts = new Map<TileType, number>()
  const columnsByType = new Map<TileType, number>()
  let longestSameTypeRun = 0
  let revealPredictability = 0
  let diversityTotal = 0
  let preSolvedTiles = 0

  lanes.forEach((column, laneIndex) => {
    const types = column.filter((item): item is Tile => Boolean(item))
    diversityTotal += new Set(types.map((item) => item.type)).size
    const target = state.columnTypes[laneIndex + 1]
    preSolvedTiles += types.filter((item) => target && item.type === target).length
    let run = 0
    let hiddenRun = 0
    let previous: TileType | null = null
    let previousHidden = false
    types.forEach((item) => {
      typeCounts.set(item.type, (typeCounts.get(item.type) ?? 0) + 1)
      if (item.type === previous) run += 1
      else run = 1
      longestSameTypeRun = Math.max(longestSameTypeRun, run)
      if (item.hidden && previousHidden && item.type === previous) hiddenRun += 1
      else hiddenRun = item.hidden ? 1 : 0
      revealPredictability = Math.max(revealPredictability, hiddenRun)
      previous = item.type
      previousHidden = item.hidden
    })
    new Set(types.map((item) => item.type)).forEach((type) => columnsByType.set(type, (columnsByType.get(type) ?? 0) + 1))
  })

  const maxGroupConcentration = Math.max(0, ...Array.from(typeCounts, ([type, count]) => {
    const largestColumnCount = Math.max(...lanes.map((column) => column.filter((item) => item?.type === type).length), 0)
    return largestColumnCount / count
  }))
  const averageColumnDiversity = lanes.length ? diversityTotal / lanes.length : 0
  const distributionScore = typeCounts.size && lanes.length
    ? Array.from(columnsByType.values()).reduce((sum, count) => sum + count / lanes.length, 0) / typeCounts.size
    : 0
  const preSolvedRatio = populatedItems.length ? preSolvedTiles / populatedItems.length : 0
  const thresholds = QUALITY_THRESHOLDS[level]
  const reasons: string[] = []
  if (longestSameTypeRun > thresholds.maxRun) reasons.push(`same-type run ${longestSameTypeRun} > ${thresholds.maxRun}`)
  if (maxGroupConcentration > thresholds.maxConcentration) reasons.push(`group concentration ${(maxGroupConcentration * 100).toFixed(0)}% is too high`)
  if (averageColumnDiversity < thresholds.minDiversity) reasons.push(`average lane diversity ${averageColumnDiversity.toFixed(2)} is too low`)
  if (distributionScore < thresholds.minDistribution) reasons.push(`type distribution ${(distributionScore * 100).toFixed(0)}% is too narrow`)
  if (preSolvedRatio > thresholds.maxPreSolved) reasons.push(`pre-solved ratio ${(preSolvedRatio * 100).toFixed(0)}% is too high`)
  if (revealPredictability > thresholds.maxRevealRun) reasons.push(`predictable hidden run ${revealPredictability} > ${thresholds.maxRevealRun}`)
  const penalties = reasons.length
  const score = Math.max(0, Math.round(100 - (
    Math.max(0, longestSameTypeRun - thresholds.maxRun) * 12
    + Math.max(0, maxGroupConcentration - thresholds.maxConcentration) * 60
    + Math.max(0, thresholds.minDiversity - averageColumnDiversity) * 20
    + Math.max(0, thresholds.minDistribution - distributionScore) * 60
    + Math.max(0, preSolvedRatio - thresholds.maxPreSolved) * 60
    + Math.max(0, revealPredictability - thresholds.maxRevealRun) * 12
    + penalties * 5
  )))
  return { accepted: reasons.length === 0, score, longestSameTypeRun, maxGroupConcentration, averageColumnDiversity, distributionScore, preSolvedRatio, revealPredictability, reasons }
}

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

function sparseLaterVisibility(columns: number, rows: number, clues: number, random: () => number): boolean[] {
  // Later levels reveal one top clue per lane, never a completed stack.
  const visibility = Array<boolean>(columns * rows).fill(false)
  const lanes = shuffle(Array.from({ length: columns - 1 }, (_, index) => index), random)
  lanes.slice(0, Math.min(clues, lanes.length)).forEach((lane) => { visibility[lane * rows] = true })
  return visibility
}

function resetGeneratedLevel(state: GameState, level: Level, visibility: boolean[]): GameState {
  let index = 0
  const columns = state.columns.map((column) => column.map((item) => item ? { ...item, hidden: !visibility[index++] } : null))
  return { ...state, level, columns, tray: Array<Tile | null>(LEVEL_RESERVES[level]).fill(null), reserveAdds: 0, selected: [], moveCount: 0, revealedCount: columns.flat().filter((item) => item && !item.hidden).length, status: 'playing' }
}

function constrainedScrambleState(initial: GameState, random: () => number): GameState {
  // Build randomized three-lane cycles. Each cycle still has a bounded legal
  // solve path through the vacant lane, but the two types are distributed at
  // varied positions instead of repeating a recognizable A/B/A/B pattern.
  const columns = initial.columns.map((column) => [...column])
  const rows = columns[0].length
  const lanes = shuffle(Array.from({ length: columns.length - 1 }, (_, index) => index + 1), random)
  const tilesByType = new Map<TileType, Tile[]>()
  initial.columns.flat().forEach((item) => {
    if (!item) return
    const items = tilesByType.get(item.type) ?? []
    items.push(item)
    tilesByType.set(item.type, items)
  })
  for (let index = 0; index < lanes.length; index += 3) {
    const [a, b, c] = lanes.slice(index, index + 3)
    if (a === undefined || b === undefined || c === undefined) break
    const types = [
      [initial.columnTypes[b]!, initial.columnTypes[a]!],
      [initial.columnTypes[c]!, initial.columnTypes[b]!],
      [initial.columnTypes[a]!, initial.columnTypes[c]!],
    ]
    const sequences = randomizedCycleTypes(rows, types, random)
    ;[a, b, c].forEach((lane, laneIndex) => {
      for (let row = 0; row < rows; row += 1) {
        const type = sequences[laneIndex][row]
        const item = tilesByType.get(type)?.shift()
        if (!item) throw new Error('Later-level generator exhausted a tile bucket')
        columns[lane][row] = item
      }
    })
  }
  return { ...initial, columns, selected: [], status: 'playing' }
}

function randomizedCycleTypes(rows: number, pairs: TileType[][], random: () => number): TileType[][] {
  // Keep each type count balanced across the triplet: every lane takes the
  // same number of entries from its first pair member. This preserves the
  // original tile pool while allowing each lane's order to vary independently.
  const midpoint = Math.floor(rows / 2)
  for (let attempt = 0; attempt < 96; attempt += 1) {
    const firstCount = Math.max(1, Math.min(rows - 1, midpoint + Math.floor(random() * 3) - 1))
    const topChoice = random() < 0.5 ? 0 : 1
    const sequences = pairs.map((pair) => {
      const remaining = shuffle([
        ...Array<number>(firstCount - (topChoice === 0 ? 1 : 0)).fill(0),
        ...Array<number>(rows - firstCount - (topChoice === 1 ? 1 : 0)).fill(1),
      ], random)
      const choices = [topChoice, ...remaining]
      return choices.map((choice) => pair[choice])
    })
    if (sequences.some((sequence) => sequence[0] === sequence[1] || longestTypeRun(sequence) > 2)) continue
    if (sequences.every((sequence) => sequence.every((type, index) => index === 0 || type !== sequence[index - 1]))) continue
    if (solvesCycleTypes(sequences, pairs.map((pair) => pair[1]), rows)) return sequences
  }

  // A deterministic RNG can repeatedly produce the same choices. Preserve a
  // safe fallback for that case; normal gameplay uses Math.random and reaches
  // the varied branch above.
  const phase = random() < 0.5 ? 0 : 1
  return pairs.map((pair) => Array.from({ length: rows }, (_, row) => pair[(row + phase) % 2]))
}

function longestTypeRun(sequence: TileType[]): number {
  let longest = 0
  let run = 0
  let previous: TileType | null = null
  sequence.forEach((type) => {
    run = type === previous ? run + 1 : 1
    longest = Math.max(longest, run)
    previous = type
  })
  return longest
}

function solvesCycleTypes(sequences: TileType[][], targets: TileType[], rows: number): boolean {
  type Cell = TileType | null
  type Board = Cell[][]
  const start: Board = [Array<Cell>(rows).fill(null), ...sequences.map((sequence) => [...sequence])]
  const key = (board: Board) => JSON.stringify(board)
  const solved = (board: Board) => board[0].every((item) => item === null)
    && board.slice(1).every((column, index) => column.every((item) => item === targets[index]))
  const queue: Board[] = [start]
  const seen = new Set([key(start)])
  while (queue.length && seen.size <= 20000) {
    const board = queue.shift()!
    if (solved(board)) return true
    for (let source = 0; source < board.length; source += 1) {
      const first = board[source].findIndex(Boolean)
      if (first < 0) continue
      const type = board[source][first]!
      let run = 0
      while (first + run < rows && board[source][first + run] === type) run += 1
      for (let count = 1; count <= run; count += 1) {
        for (let target = 0; target < board.length; target += 1) {
          if (target === source) continue
          const destination = board[target]
          const top = destination.find(Boolean)
          if (destination.filter((item) => item === null).length < count || (top && top !== type)) continue
          const next = board.map((column) => [...column])
          for (let offset = 0; offset < count; offset += 1) next[source][first + offset] = null
          const slots: number[] = []
          for (let row = rows - 1; row >= 0 && slots.length < count; row -= 1) {
            if (next[target][row] === null) slots.push(row)
          }
          for (let offset = 0; offset < count; offset += 1) next[target][slots[offset]] = type
          const nextKey = key(next)
          if (!seen.has(nextKey)) {
            seen.add(nextKey)
            queue.push(next)
          }
        }
      }
    }
  }
  return false
}

type ScrambleMove = { first: number; second: number; firstRow: number; secondRow: number }

function legacyScrambleState(initial: GameState, random: () => number): { state: GameState; plan: ScrambleMove[] } {
  let state = initial
  const plan: ScrambleMove[] = []
  const movableColumns = state.columns.length - 1
  const rows = state.columns[0].length
  for (let move = 0; move < Math.max(12, movableColumns * rows); move += 1) {
    const first = 1 + Math.floor(random() * movableColumns)
    let second = 1 + Math.floor(random() * movableColumns)
    if (second === first) second = second === movableColumns ? 1 : second + 1
    const firstRow = Math.floor(random() * rows)
    const secondRow = Math.floor(random() * rows)
    const moved = state.columns[first][firstRow]
    if (!moved) continue
    state = { ...state, selected: [{ kind: 'column', column: first, row: firstRow }] }
    state = moveSelectedToColumnUnchecked(state, 0, true)
    const other = state.columns[second][secondRow]
    if (!other) continue
    state = { ...state, selected: [{ kind: 'column', column: second, row: secondRow }] }
    state = moveSelectedToColumnUnchecked(state, first, true)
    const bufferRow = state.columns[0].findIndex((item) => item?.id === moved.id)
    if (bufferRow < 0) continue
    state = { ...state, selected: [{ kind: 'column', column: 0, row: bufferRow }] }
    state = moveSelectedToColumnUnchecked(state, second, true)
    plan.push({ first, second, firstRow, secondRow })
  }
  return { state: { ...state, selected: [], status: 'playing' }, plan }
}

function reverseScramble(initial: GameState, plan: ScrambleMove[]): GameState {
  let state: GameState = { ...initial, selected: [], status: 'playing' }
  for (let index = plan.length - 1; index >= 0; index -= 1) {
    const move = plan[index]
    const moved = state.columns[move.second][move.secondRow]
    if (!moved) return state
    state = { ...state, selected: [{ kind: 'column', column: move.second, row: move.secondRow }] }
    state = moveSelectedToColumnUnchecked(state, 0, true)
    state = { ...state, selected: [{ kind: 'column', column: move.first, row: move.firstRow }] }
    state = moveSelectedToColumnUnchecked(state, move.second, true)
    const bufferRow = state.columns[0].findIndex((item) => item?.id === moved.id)
    if (bufferRow < 0) return state
    state = { ...state, selected: [{ kind: 'column', column: 0, row: bufferRow }] }
    state = moveSelectedToColumnUnchecked(state, move.first, true)
  }
  return { ...state, status: isSolved(state.columns, state.tray, state.columnTypes) ? 'won' : 'playing' }
}

function buildLevel(level: Level, pool: TileType[], visibility: boolean[], typeOrder: TileType[]): GameState {
  const emptyColumn = 0
  const columnCount = LEVEL_COLUMNS[level]
  const rowCount = LEVEL_ROWS[level]
  let tileIndex = 0
  const columns = Array.from({ length: columnCount }, (_, column) => column === emptyColumn
    ? Array<Tile | null>(rowCount).fill(null)
    : Array.from({ length: rowCount }, () => {
      const index = tileIndex++
      return tile(pool[index], !visibility[index])
    }),
  )

  return {
    level,
    columns,
    columnTypes: [null, ...typeOrder],
    tray: Array<Tile | null>(LEVEL_RESERVES[level]).fill(null),
    reserveAdds: 0,
    selected: [],
    moveCount: 0,
    revealedCount: columns.flat().filter((item) => item && !item.hidden).length,
    status: 'playing',
  }
}

export function firstHiddenRow(column: Array<Tile | null>): number {
  const firstOccupied = column.findIndex(Boolean)
  return firstOccupied >= 0 && column[firstOccupied]?.hidden ? firstOccupied : -1
}

export function revealTile(state: GameState, columnIndex: number, rowIndex: number): GameState {
  const item = state.columns[columnIndex]?.[rowIndex]
  if (state.status !== 'playing' || !item?.hidden || firstHiddenRow(state.columns[columnIndex]) !== rowIndex) return state

  const columns = state.columns.map((column) => [...column])
  columns[columnIndex][rowIndex] = { ...item, hidden: false }
  const next: GameState = {
    ...state,
    columns,
    selected: [{ kind: 'column', column: columnIndex, row: rowIndex }],
    revealedCount: state.revealedCount + 1,
    moveCount: state.moveCount + 1,
  }
  const solved = isSolved(next.columns, next.tray, next.columnTypes)
  return { ...next, status: solved ? 'won' : 'playing' }
}

export function selectTile(state: GameState, selection: Exclude<Selection, null>): GameState {
  const item = getSelectedTile(state, selection)
  if (!item || item.hidden || state.status !== 'playing') return state
  const selectedIndex = state.selected.findIndex((entry) => sameSelection(entry, selection))
  if (selectedIndex >= 0) return { ...state, selected: state.selected.filter((_, index) => index !== selectedIndex) }
  if (!canSelectTile(state, selection)) return state
  const first = state.selected[0]
  if (!first || first.kind !== 'column' || selection.kind !== 'column') return { ...state, selected: [selection] }
  const firstTile = getSelectedTile(state, first)
  if (first.column !== selection.column) return { ...state, selected: [selection] }
  if (!firstTile || firstTile.type !== item.type) return state
  return { ...state, selected: [...state.selected, selection] }
}

export function canSelectTile(state: GameState, selection: Selection): boolean {
  if (selection.kind === 'tray') return Boolean(state.tray[selection.index])
  const column = state.columns[selection.column]
  const item = column?.[selection.row]
  if (!column || !item || item.hidden) return false
  if (state.selected.some((entry) => sameSelection(entry, selection))) return true
  const firstOccupied = column.findIndex(Boolean)
  if (firstOccupied < 0 || selection.row < firstOccupied) return false
  const firstSelected = state.selected.find((entry) => entry.kind === 'column' && entry.column === selection.column)
  const firstSelectedTile = firstSelected ? getSelectedTile(state, firstSelected) : null
  if (!firstSelected && selection.row !== firstOccupied) return false
  if (firstSelectedTile && firstSelectedTile.type !== item.type) return false
  if (firstSelected && selection.row !== firstOccupied + state.selected.filter((entry) => entry.kind === 'column' && entry.column === selection.column).length) return false
  return column.slice(firstOccupied, selection.row).every((candidate, offset) => candidate && state.selected.some((entry) => entry.kind === 'column' && entry.column === selection.column && entry.row === firstOccupied + offset))
}

export function getSelectedTile(state: GameState, selection?: Selection): Tile | null {
  selection ??= state.selected[0]
  if (!selection) return null
  return selection.kind === 'tray'
    ? state.tray[selection.index]
    : state.columns[selection.column]?.[selection.row] ?? null
}

export function canMoveToColumn(state: GameState, columnIndex: number): boolean {
  const column = state.columns[columnIndex]
  const selected = state.selected.map((entry) => getSelectedTile(state, entry)).filter((item): item is Tile => Boolean(item))
  if (!selected.length || !column || column.filter((item) => item === null).length < selected.length) return false
  if (state.selected.some((entry) => entry.kind === 'column' && entry.column === columnIndex)) return false
  const topBlock = column.find((item): item is Tile => Boolean(item))
  return column.every((item) => !item) || Boolean(topBlock && !topBlock.hidden && topBlock.type === selected[0].type)
}

export function hasLegalMove(state: GameState): boolean {
  if (state.columns.some((column) => firstHiddenRow(column) >= 0)) return true
  if (state.tray.some((item) => !item)) {
    if (state.columns.some((column) => column.some((item) => item && !item.hidden))) return true
  }
  const trayCandidates = state.tray.flatMap((item, index) => item ? [{ kind: 'tray' as const, index }] : [])
  if (trayCandidates.some((selection) => state.columns.some((_, columnIndex) => canMoveToColumn({ ...state, selected: [selection] }, columnIndex)))) return true
  return state.columns.some((column, sourceColumn) => {
    const first = column.findIndex(Boolean)
    const firstItem = first >= 0 ? column[first] : null
    if (!firstItem || firstItem.hidden) return false
    let run = 0
    while (first + run < column.length && column[first + run]?.type === firstItem.type && !column[first + run]?.hidden) run += 1
    return Array.from({ length: run }, (_, length) => {
      const selected = Array.from({ length: length + 1 }, (_, offset) => ({ kind: 'column' as const, column: sourceColumn, row: first + offset }))
      const candidateState = { ...state, selected }
      if (selected.length === 1 && state.tray.some((item) => !item)) return true
      return state.columns.some((_, targetColumn) => canMoveToColumn(candidateState, targetColumn) && isProgressMove(candidateState, sourceColumn, targetColumn))
    }).some(Boolean)
  })
}

function isProgressMove(state: GameState, sourceColumn: number, targetColumn: number): boolean {
  const columns = state.columns.map((column) => [...column])
  const tray = [...state.tray]
  const items = state.selected.map((selection) => getSelectedTile(state, selection)).filter((item): item is Tile => Boolean(item))
  state.selected.forEach((selection) => {
    if (selection.kind === 'column') columns[selection.column][selection.row] = null
  })
  const targetRows: number[] = []
  for (let row = columns[targetColumn].length - 1; row >= 0 && targetRows.length < items.length; row -= 1) {
    if (columns[targetColumn][row] === null) targetRows.push(row)
  }
  items.forEach((item, index) => { columns[targetColumn][targetRows[index]] = item })
  const sourceBefore = state.columns[sourceColumn].find((item): item is Tile => Boolean(item))
  const sourceAfter = columns[sourceColumn].find((item): item is Tile => Boolean(item))
  if (!sourceAfter || !sourceBefore || sourceAfter.type !== sourceBefore.type || sourceAfter.hidden !== sourceBefore.hidden) return true
  if (state.columns[targetColumn].every((item) => !item)) return true
  return columns[targetColumn].every((item) => !item || (!item.hidden && item.type === items[0]?.type))
}

function finishMove(state: GameState, columns: GameState['columns'], tray: GameState['tray']): GameState {
  const won = isSolved(columns, tray, state.columnTypes)
  const next = { ...state, columns, tray, selected: [], moveCount: state.moveCount + 1 }
  return { ...next, status: won ? 'won' : hasLegalMove(next) ? 'playing' : 'no-legal-move' }
}

function isSolved(columns: GameState['columns'], tray: GameState['tray'], _columnTypes: GameState['columnTypes']): boolean {
  const emptyLanes = columns.filter((column) => column.every((item) => !item)).length
  return tray.every((item) => !item) && emptyLanes === 1 && columns.every((column) => {
    if (column.every((item) => !item)) return true
    const type = column.find((item) => item)?.type
    return column.every((item) => item && !item.hidden && item.type === type)
  })
}

function removeSelected(state: GameState, columns: GameState['columns'], tray: GameState['tray']): Tile[] {
  const items: Tile[] = []
  for (const selection of state.selected) {
    if (selection.kind === 'tray') {
      const item = tray[selection.index]
      if (item) items.push(item)
      tray[selection.index] = null
      continue
    }
    const item = columns[selection.column][selection.row]
    if (item) items.push(item)
    columns[selection.column][selection.row] = null
  }
  return items
}

export function moveSelectedToTray(state: GameState, trayIndex: number): GameState {
  if (state.selected.length !== 1 || state.tray[trayIndex] || state.selected[0].kind === 'tray') return state
  const columns = state.columns.map((column) => [...column])
  const tray = [...state.tray]
  const items = removeSelected(state, columns, tray)
  if (!items.length) return state
  tray[trayIndex] = items[0]
  return finishMove(state, columns, tray)
}

export function addReserveSlot(state: GameState): GameState {
  if (state.status !== 'no-legal-move' || state.reserveAdds >= MAX_EXTRA_RESERVES) return state
  return { ...state, tray: [...state.tray, null], reserveAdds: state.reserveAdds + 1, selected: [], status: 'playing' }
}

export function moveSelectedToColumn(state: GameState, columnIndex: number): GameState {
  if (!canMoveToColumn(state, columnIndex)) return state
  return moveSelectedToColumnUnchecked(state, columnIndex)
}

function moveSelectedToColumnUnchecked(state: GameState, columnIndex: number, setup = false): GameState {
  if (!state.columns[columnIndex]) return state
  const columns = state.columns.map((column) => [...column])
  const tray = [...state.tray]
  const items = removeSelected(state, columns, tray)
  if (!items.length) return state
  const targetRows: number[] = []
  for (let row = columns[columnIndex].length - 1; row >= 0 && targetRows.length < items.length; row -= 1) {
    if (columns[columnIndex][row] === null) targetRows.push(row)
  }
  if (targetRows.length !== items.length) return state
  items.forEach((item, index) => { columns[columnIndex][targetRows[index]] = item })
  const next = finishMove(state, columns, tray)
  return setup ? { ...next, status: 'playing' } : next
}

function sameSelection(a: Selection, b: Exclude<Selection, null>): boolean {
  if (!a || a.kind !== b.kind) return false
  return a.kind === 'tray'
    ? a.index === (b as { kind: 'tray'; index: number }).index
    : a.column === (b as { kind: 'column'; column: number; row: number }).column && a.row === (b as { kind: 'column'; column: number; row: number }).row
}
