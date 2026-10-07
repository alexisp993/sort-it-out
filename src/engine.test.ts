import { describe, expect, it } from 'vitest'
import { addReserveSlot, canMoveToColumn, canSelectTile, createLevel, evaluatePuzzleQuality, firstHiddenRow, hasLegalMove, LEVEL_CLUES, LEVEL_COLUMNS, LEVEL_RESERVES, LEVEL_ROWS, LEVEL_TYPES, moveSelectedToColumn, revealTile, seededRandom, selectTile, type GameState, type Tile } from './engine'

function canSolveVisibleBoard(game: GameState, maxStates = 5000): boolean {
  const targetByType = new Map<Tile['type'], number>()
  game.columnTypes.forEach((type, index) => { if (type) targetByType.set(type, index) })
  const visited = new Set<number>()
  for (let start = 1; start < game.columns.length; start += 1) {
    if (visited.has(start)) continue
    const cycle: number[] = []
    let lane = start
    while (!visited.has(lane)) {
      visited.add(lane)
      cycle.push(lane)
      const ownType = game.columnTypes[lane]
      const otherType = game.columns[lane].find((item) => item && item.type !== ownType)?.type
      const nextLane = otherType ? targetByType.get(otherType) : undefined
      if (!nextLane) return false
      lane = nextLane
    }
    if (lane !== start || cycle.length !== 3 || !canSolveCycle(game, cycle, maxStates)) return false
  }
  return true
}

function canSolveCycle(game: GameState, lanes: number[], maxStates: number): boolean {
  const rows = game.columns[0].length
  const active = [0, ...lanes]
  const start = active.map((index) => game.columns[index].map((item) => item?.type ?? null))
  const key = (columns: Array<Array<Tile['type'] | null>>) => JSON.stringify(columns)
  const solved = (columns: Array<Array<Tile['type'] | null>>) => columns[0].every((item) => !item)
    && lanes.every((lane, index) => columns[index + 1].every((item) => item === game.columnTypes[lane]))
  const queue = [start]
  const seen = new Set([key(start)])
  while (queue.length && seen.size <= maxStates) {
    const columns = queue.shift()!
    if (solved(columns)) return true
    for (let source = 0; source < columns.length; source += 1) {
      const first = columns[source].findIndex(Boolean)
      if (first < 0) continue
      const type = columns[source][first]
      let run = 0
      while (first + run < rows && columns[source][first + run] === type) run += 1
      for (let count = 1; count <= run; count += 1) {
        for (let target = 0; target < columns.length; target += 1) {
          if (target === source) continue
          const destination = columns[target]
          const top = destination.find(Boolean)
          if (destination.filter((item) => !item).length < count || (top && top !== type)) continue
          const next = columns.map((column) => [...column])
          for (let offset = 0; offset < count; offset += 1) next[source][first + offset] = null
          const slots: number[] = []
          for (let row = rows - 1; row >= 0 && slots.length < count; row -= 1) if (!next[target][row]) slots.push(row)
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

function canSolveRingCycle(game: GameState): boolean {
  type Cell = Tile['type'] | null
  type Board = Cell[][]
  const rows = game.columns[0].length
  const targetByType = new Map<Tile['type'], number>()
  game.columnTypes.forEach((type, index) => { if (type) targetByType.set(type, index) })
  const laneOrder: number[] = []
  let lane = 1
  while (!laneOrder.includes(lane)) {
    laneOrder.push(lane)
    const ownType = game.columnTypes[lane]
    const foreignType = game.columns[lane].find((item) => item && item.type !== ownType)?.type
    const nextLane = foreignType ? targetByType.get(foreignType) : undefined
    if (nextLane === undefined) return false
    lane = nextLane
  }
  if (lane !== 1 || laneOrder.length !== game.columns.length - 1) return false
  const targets = laneOrder.map((index) => game.columnTypes[index]!).filter(Boolean)
  let board: Board = [[...Array<Cell>(rows).fill(null)], ...laneOrder.map((index) => game.columns[index].map((item) => item?.type ?? null))]
  const solved = (candidate: Board) => candidate[0].every((item) => item === null)
    && candidate.slice(1).every((column, index) => column.every((item) => item === targets[index]))
  const addLane = (lane: number, offset: number) => ((lane - 1 + offset + targets.length) % targets.length) + 1
  const applyCycle = (start: number, direction: -1 | 1): Board | null => {
    let current = board.map((column) => [...column])
    const move = (source: number, target: number, count: number): boolean => {
      const first = current[source].findIndex(Boolean)
      if (first < 0) return false
      const type = current[source][first]!
      let run = 0
      while (first + run < rows && current[source][first + run] === type) run += 1
      if (count > run) return false
      const destination = current[target]
      const top = destination.find(Boolean)
      if (destination.filter((item) => item === null).length < count || (top && top !== type)) return false
      const next = current.map((column) => [...column])
      for (let offset = 0; offset < count; offset += 1) next[source][first + offset] = null
      const slots: number[] = []
      for (let row = rows - 1; row >= 0 && slots.length < count; row -= 1) if (next[target][row] === null) slots.push(row)
      for (let offset = 0; offset < count; offset += 1) next[target][slots[offset]] = type
      current = next
      return true
    }
    const first = current[start].findIndex(Boolean)
    if (first < 0) return null
    const firstType = current[start][first]!
    let run = 0
    while (first + run < rows && current[start][first + run] === firstType) run += 1
    if (!move(start, 0, run)) return null
    for (let offset = 1; offset < targets.length; offset += 1) {
      const source = addLane(start, direction * offset)
      const target = addLane(source, -direction)
      const sourceFirst = current[source].findIndex(Boolean)
      if (sourceFirst < 0) return null
      const sourceType = current[source][sourceFirst]!
      let sourceRun = 0
      while (sourceFirst + sourceRun < rows && current[source][sourceFirst + sourceRun] === sourceType) sourceRun += 1
      if (!move(source, target, Math.min(run, sourceRun))) return null
    }
    if (!move(0, addLane(start, -direction), run)) return null
    return current
  }
  const seen = new Set<string>()
  const search = (candidate: Board, depth: number): boolean => {
    if (solved(candidate)) return true
    if (depth >= rows * 4) return false
    const key = JSON.stringify(candidate)
    if (seen.has(key)) return false
    seen.add(key)
    board = candidate
    for (let start = 1; start < candidate.length; start += 1) {
      for (const direction of [-1, 1] as const) {
        const next = applyCycle(start, direction)
        if (next && search(next, depth + 1)) return true
      }
    }
    return false
  }
  return search(board, 0)
}

describe('sorting engine', () => {
  it('starts small with balanced tiles, clues, and one vacant column', () => {
    const game = createLevel(1, () => 0.5)
    expect(game.tray).toEqual([null, null, null])
    expect(game.columns).toHaveLength(LEVEL_COLUMNS[1])
    expect(game.columns[0]).toHaveLength(LEVEL_ROWS[1])
    expect(game.revealedCount).toBe(LEVEL_CLUES[1])
    expect(game.columns.filter((column) => column.every((item) => !item))).toHaveLength(1)
    expect(game.columns.filter((column) => column.every(Boolean))).toHaveLength(LEVEL_TYPES[1])
    const counts = game.columns.flat().reduce<Record<string, number>>((result, item) => {
      if (item) result[item.type] = (result[item.type] ?? 0) + 1
      return result
    }, {})
    expect(Object.values(counts)).toEqual(Array(LEVEL_TYPES[1]).fill(LEVEL_ROWS[1]))
  })

  it('level 2 adds a lane and begins with a mixed set of visible tiles', () => {
    const game = createLevel(2, () => 0.5)
    expect(game.columns).toHaveLength(LEVEL_COLUMNS[2])
    expect(game.columns[0]).toHaveLength(LEVEL_ROWS[2])
    expect(game.columns.flat().filter((item) => item && !item.hidden)).toHaveLength(LEVEL_CLUES[2])
    expect(game.revealedCount).toBe(LEVEL_CLUES[2])
  })

  it('adds progressively harder clue levels', () => {
    for (const level of [3, 4, 5, 6, 7, 8, 9, 10] as const) {
      const game = createLevel(level, () => 0.5)
      expect(game.columns).toHaveLength(LEVEL_COLUMNS[level])
      expect(game.columns[0]).toHaveLength(LEVEL_ROWS[level])
      expect(game.revealedCount).toBe(LEVEL_CLUES[level])
    }
  })

  it('uses the farm icon set for later levels', () => {
    const game = createLevel(7, () => 0.5)
    const types = new Set(game.columns.flatMap((column) => column.flatMap((item) => item ? [item.type] : [])))
    expect(types).toContain('llama')
    expect(types).toContain('strawberry')
    expect(types).not.toContain('hammer')
  })

  it('tightens reserve slots on harder levels', () => {
    expect(createLevel(1, () => 0.5).tray).toHaveLength(LEVEL_RESERVES[1])
    expect(createLevel(4, () => 0.5).tray).toHaveLength(LEVEL_RESERVES[4])
    expect(createLevel(7, () => 0.5).tray).toHaveLength(LEVEL_RESERVES[7])
  })

  it('allows one emergency reserve after a dead end', () => {
    const stuck = { ...createLevel(1, () => 0.5), status: 'no-legal-move' as const }
    const helped = addReserveSlot(stuck)
    expect(helped.tray).toHaveLength(4)
    expect(helped.reserveAdds).toBe(1)
    expect(helped.status).toBe('playing')
    expect(addReserveSlot(helped)).toBe(helped)
  })

  it('keeps a hidden exposed tile playable even with a full reserve', () => {
    const base = createLevel(1, () => 0.5)
    const columns = base.columns.map((column) => column.map((item) => item ? { ...item, hidden: false } : null))
    columns[1][0] = { ...columns[1][0]!, hidden: true }
    const fullReserve = base.tray.map((item, index) => item ?? { id: `reserve-${index}`, type: 'tomato' as const, hidden: false })
    expect(hasLegalMove({ ...base, columns, tray: fullReserve })).toBe(true)
  })

  it('blocks tiles underneath an exposed stack', () => {
    const base = createLevel(1, () => 0.5)
    const columns = base.columns.map((column) => [...column])
    columns[1] = columns[1].map((item, row) => item ? { ...item, type: row < 3 ? 'pineapple' : 'hammer', hidden: false } : null)
    const game = { ...base, columns, selected: [] }
    expect(canSelectTile(game, { kind: 'column', column: 1, row: 3 })).toBe(false)
    expect(canSelectTile(game, { kind: 'column', column: 1, row: 0 })).toBe(true)
  })

  it('does not replace a selected stack with a different blocked tile', () => {
    const base = createLevel(1, () => 0.5)
    const columns = base.columns.map((column) => [...column])
    columns[1] = columns[1].map((item, row) => item ? { ...item, type: row === 0 ? 'hammer' : 'tomato', hidden: false } : null)
    let game = { ...base, columns, selected: [] as GameState['selected'] }
    game = selectTile(game, { kind: 'column', column: 1, row: 0 })
    expect(selectTile(game, { kind: 'column', column: 1, row: 1 })).toBe(game)
  })

  it('keeps matching-lane staging moves playable', () => {
    const tile = (type: Tile['type'], hidden = false): Tile => ({ id: `${type}-${Math.random()}`, type, hidden })
    const full = (type: Tile['type']) => Array.from({ length: 7 }, () => tile(type))
    const columns = [
      full('tomato'), full('mushroom'), full('barrel'), full('pumpkin'),
      [null, null, tile('hammer'), tile('hammer'), tile('hammer'), tile('tomato', true), tile('tomato', true)],
      full('fire'), full('pineapple'),
      [null, tile('hammer'), tile('hammer'), tile('mushroom'), tile('tomato', true), tile('mushroom'), tile('tomato', true)],
    ]
    const state: GameState = { level: 5, columns, columnTypes: Array(9).fill(null), tray: [tile('barrel'), tile('barrel')], reserveAdds: 0, selected: [], moveCount: 0, revealedCount: 0, status: 'playing' }
    expect(hasLegalMove(state)).toBe(true)
  })

  it('rejects a same-type shuffle that cannot expose or complete anything', () => {
    const tile = (type: Tile['type'], hidden = false): Tile => ({ id: `${type}-${Math.random()}`, type, hidden })
    const stack = (type: Tile['type']) => Array.from({ length: 7 }, () => tile(type))
    const state: GameState = {
      level: 5,
      columns: [
        [null, ...Array.from({ length: 6 }, () => tile('pineapple'))],
        [...Array.from({ length: 5 }, () => tile('barrel')), tile('tomato', true), tile('tomato', true)],
        [...Array.from({ length: 5 }, () => tile('fire')), tile('pumpkin'), tile('mushroom')],
        [null, null, ...Array.from({ length: 5 }, () => tile('mushroom'))],
        [null, ...Array.from({ length: 4 }, () => tile('pumpkin')), tile('blueberry'), tile('blueberry')],
        [null, ...Array.from({ length: 6 }, () => tile('blueberry'))],
        [null, null, null, null, tile('barrel'), tile('grapes'), tile('tomato', true)],
        [tile('grapes'), tile('grapes'), tile('grapes'), tile('grapes'), tile('tomato', true), tile('fire'), tile('grapes')],
      ],
      columnTypes: Array(9).fill(null),
      tray: [tile('fire'), tile('tomato')],
      reserveAdds: 0,
      selected: [],
      moveCount: 0,
      revealedCount: 0,
      status: 'playing',
    }
    expect(hasLegalMove(state)).toBe(false)
  })

  it('keeps a full exposed matching group playable after a reveal', () => {
    const tile = (type: Tile['type'], hidden = false): Tile => ({ id: `${type}-${Math.random()}`, type, hidden })
    const full = (type: Tile['type']) => Array.from({ length: 7 }, () => tile(type))
    const columns = [
      full('tomato'),
      [null, tile('mushroom'), tile('mushroom'), tile('mushroom'), tile('mushroom'), tile('tomato', true), tile('tomato', true)],
      full('barrel'), full('pumpkin'), full('hammer'), full('fire'), full('pineapple'),
      [null, null, null, null, tile('mushroom'), tile('mushroom'), tile('mushroom')],
    ]
    const state: GameState = { level: 5, columns, columnTypes: Array(9).fill(null), tray: [tile('barrel'), tile('barrel')], reserveAdds: 0, selected: [], moveCount: 0, revealedCount: 0, status: 'playing' }
    expect(hasLegalMove(state)).toBe(true)
  })

  it('rejects a selected group that does not fit the destination', () => {
    const base = createLevel(1, () => 0.5)
    const columns = base.columns.map((column) => [...column])
    columns[1][0] = null
    columns[1][1] = null
    columns[2] = columns[2].map((item, row) => row < 3 && item ? { ...item, type: 'grapes', hidden: false } : item)
    let game = { ...base, columns, selected: [] as GameState['selected'] }
    game = selectTile(game, { kind: 'column', column: 2, row: 0 })
    game = selectTile(game, { kind: 'column', column: 2, row: 1 })
    game = selectTile(game, { kind: 'column', column: 2, row: 2 })
    expect(canMoveToColumn(game, 1)).toBe(false)
  })

  it('randomizes level 1 blocks while preserving the solvable lane targets', () => {
    let seed = 7
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
    const game = createLevel(1, random)
    const mixedLane = game.columns.slice(1).some((column) => new Set(column.flatMap((item) => item ? [item.type] : [])).size > 1)
    expect(mixedLane).toBe(true)
    expect(game.columns[0].every((item) => !item)).toBe(true)
    expect(game.columnTypes.filter(Boolean)).toHaveLength(LEVEL_TYPES[1])
  })

  it('builds later levels from one varied solvable ring', () => {
    for (const level of [7, 8, 9, 10] as const) {
      const game = createLevel(level, () => 0.5)
      const topTypes = new Set(game.columns.slice(1).map((column) => column[0]?.type))
      expect(topTypes.size).toBe(LEVEL_TYPES[level])
      for (const column of game.columns.slice(1)) {
        const types = column.flatMap((item) => item ? [item.type] : [])
        expect(new Set(types).size).toBe(2)
        expect(types[0]).not.toBe(types[1])
      }
      for (const column of game.columns.slice(1)) {
        const firstVisible = column.findIndex((item) => item && !item.hidden)
        if (firstVisible >= 0) {
          expect(firstVisible).toBe(0)
          expect(column.filter((item) => item && !item.hidden)).toHaveLength(1)
        }
      }
      const targetByType = new Map(game.columnTypes.map((type, index) => [type, index]))
      const visited = new Set<number>()
      let lane = 1
      while (!visited.has(lane)) {
        visited.add(lane)
        const ownType = game.columnTypes[lane]
        const foreignType = game.columns[lane].find((item) => item && item.type !== ownType)?.type
        lane = foreignType ? (targetByType.get(foreignType) ?? -1) : -1
      }
      expect(lane).toBe(1)
      expect(visited.size).toBe(LEVEL_TYPES[level])
    }
  })

  it('rejects pre-built later-level layouts with quality diagnostics', () => {
    const game = createLevel(7, seededRandom(7))
    const prebuilt = {
      ...game,
      columns: game.columns.map((column, index) => index === 1 ? column.map((item) => item ? { ...item, type: game.columnTypes[1]!, hidden: false } : null) : column),
    }
    const quality = evaluatePuzzleQuality(prebuilt, 7)
    expect(quality.accepted).toBe(false)
    expect(quality.maxGroupConcentration).toBeGreaterThanOrEqual(0.6)
    expect(quality.reasons.length).toBeGreaterThan(0)
  })

  it('rejects even short adjacent runs on later levels', () => {
    const game = createLevel(8, seededRandom(8080))
    const columns = game.columns.map((column, index) => index === 1
      ? column.map((item, row) => row === 1 && item ? { ...item, type: column[0]!.type } : item)
      : column)
    const quality = evaluatePuzzleQuality({ ...game, columns }, 8)
    expect(quality.longestSameTypeRun).toBeGreaterThan(1)
    expect(quality.accepted).toBe(false)
  })

  it('uses difficulty-aware quality thresholds instead of one blanket rule', () => {
    const game = createLevel(7, seededRandom(19))
    const longRun = {
      ...game,
      columns: game.columns.map((column, index) => index === 1 ? column.map((item) => item ? { ...item, type: game.columnTypes[1]!, hidden: false } : null) : column),
    }
    expect(evaluatePuzzleQuality(longRun, 1).accepted).toBe(true)
    expect(evaluatePuzzleQuality(longRun, 7).accepted).toBe(false)
  })

  it('keeps later-level generation within quality thresholds across seeded samples', () => {
    for (const level of [7, 8, 9, 10] as const) {
      const samples = Array.from({ length: 40 }, (_, seed) => evaluatePuzzleQuality(createLevel(level, seededRandom(seed + level * 1000)), level))
      expect(samples.every((quality) => quality.accepted)).toBe(true)
      expect(Math.max(...samples.map((quality) => quality.longestSameTypeRun))).toBeLessThanOrEqual(2)
      expect(Math.max(...samples.map((quality) => quality.maxGroupConcentration))).toBeLessThanOrEqual(0.7)
    }
  })

  it('keeps generated later levels actionable after all clues are revealed', () => {
    for (const level of [7, 8, 9, 10] as const) {
      let game = createLevel(level, seededRandom(level))
      game.columns.forEach((column, columnIndex) => column.forEach((item, rowIndex) => {
        if (item?.hidden) game = revealTile(game, columnIndex, rowIndex)
      }))
      expect(hasLegalMove(game)).toBe(true)
    }
  })

  it('preserves a legal solve path for generated later-level layouts', () => {
    for (const level of [7, 8, 9, 10] as const) {
      for (let seed = 0; seed < 12; seed += 1) {
        const solvable = canSolveRingCycle(createLevel(level, seededRandom(seed + level * 1000)))
        expect(solvable).toBe(true)
      }
    }
  })

  it('reproduces the same layout from the same seed', () => {
    const signature = (game: GameState) => game.columns.map((column) => column.map((item) => item ? `${item.type}:${item.hidden ? 'h' : 'v'}` : '-'))
    expect(signature(createLevel(9, seededRandom(12345)))).toEqual(signature(createLevel(9, seededRandom(12345))))
  })

  it('keeps higher-level clues sparse instead of revealing a completed lane', () => {
    for (const level of [5, 6, 7, 8, 9, 10] as const) {
      const game = createLevel(level, () => 0.5)
      expect(game.columns.slice(1).every((column) => column.filter((item) => item && !item.hidden).length < LEVEL_ROWS[level])).toBe(true)
    }
  })

  it('only reveals the next hidden tile in a column', () => {
    const game = createLevel(1, () => 0.5)
    const column = game.columns.findIndex((items) => firstHiddenRow(items) >= 0)
    const row = firstHiddenRow(game.columns[column])
    const revealed = revealTile(game, column, row)
    expect(revealed.columns[column][row]?.hidden).toBe(false)
    expect(revealed.revealedCount).toBe(LEVEL_CLUES[1] + 1)
    expect(revealTile(revealed, column, row + 1)).toBe(revealed)
  })

  it('moves an exposed tile into a board vacancy', () => {
    let game = createLevel(1, () => 0.5)
    const target = game.columns.findIndex((items) => items.some((item) => !item))
    const source = game.columns.findIndex((items, index) => index !== target && firstHiddenRow(items) >= 0)
    const row = firstHiddenRow(game.columns[source])
    const gaps = game.columns[target].filter((item) => !item).length
    game = revealTile(game, source, row)
    game = moveSelectedToColumn(game, target)
    expect(game.columns[target].filter((item) => !item)).toHaveLength(gaps - 1)
    expect(game.columns[source][row]).toBeNull()
  })

  it('moves a tile into a visible matching lane', () => {
    let game = createLevel(1, () => 0.5)
    const columns = game.columns.map((column) => [...column])
    columns[2][0] = { ...columns[2][0]!, type: 'tomato', hidden: false }
    columns[3][0] = null
    columns[3][1] = { ...columns[3][1]!, type: 'tomato', hidden: false }
    game = { ...game, columns, selected: [] }
    game = selectTile(game, { kind: 'column', column: 2, row: 0 })
    expect(canMoveToColumn(game, 3)).toBe(true)
    game = moveSelectedToColumn(game, 3)
    expect(game.columns[3][0]?.type).toBe('tomato')
  })

  it('blocks staging on a different visible tile type', () => {
    let game = createLevel(1, () => 0.5)
    const columns = game.columns.map((column) => [...column])
    columns[2][0] = { ...columns[2][0]!, type: 'mushroom', hidden: false }
    columns[1] = [{ ...columns[1][0]!, type: 'tomato', hidden: false }, { ...columns[1][1]!, type: 'mushroom', hidden: false }, { ...columns[1][2]!, type: 'mushroom', hidden: false }, { ...columns[1][3]!, type: 'mushroom', hidden: false }, null]
    columns[3] = [{ ...columns[3][0]!, type: 'mushroom', hidden: false }, { ...columns[3][1]!, type: 'mushroom', hidden: false }, { ...columns[3][2]!, type: 'mushroom', hidden: false }, { ...columns[3][3]!, type: 'mushroom', hidden: false }, null]
    game = selectTile({ ...game, columns, selected: [] }, { kind: 'column', column: 2, row: 0 })
    expect(canMoveToColumn(game, 1)).toBe(false)
    expect(canMoveToColumn(game, 3)).toBe(true)
  })

  it('fills vacancies from the bottom up', () => {
    let game = createLevel(1, () => 0.5)
    const target = game.columns.findIndex((items) => items.every((item) => !item))
    const source = game.columns.findIndex((items, index) => index !== target && firstHiddenRow(items) >= 0)
    const row = firstHiddenRow(game.columns[source])
    game = revealTile(game, source, row)
    game = moveSelectedToColumn(game, target)
    expect(game.columns[target][LEVEL_ROWS[1] - 1]).not.toBeNull()
    expect(game.columns[target].slice(0, LEVEL_ROWS[1] - 1).every((item) => !item)).toBe(true)
  })

  it('moves a multi-selection into the lowest target slots', () => {
    let game = createLevel(1, () => 0.5)
    const target = 0
    const source = 1
    const columns = game.columns.map((column, index) => index === target
      ? Array<Tile | null>(LEVEL_ROWS[1]).fill(null)
      : index === source
        ? column.map((item, row) => row < 3 && item ? { ...item, type: 'barrel' as const, hidden: false } : item)
        : column)
    game = { ...game, columns, selected: [] }
    game = selectTile(game, { kind: 'column', column: source, row: 0 })
    game = selectTile(game, { kind: 'column', column: source, row: 1 })
    game = selectTile(game, { kind: 'column', column: source, row: 2 })
    game = moveSelectedToColumn(game, target)
    expect(game.columns[target].slice(LEVEL_ROWS[1] - 3).every((item) => item?.type === 'barrel')).toBe(true)
    expect(game.columns[source].slice(0, 3).every((item) => !item)).toBe(true)
  })
})
