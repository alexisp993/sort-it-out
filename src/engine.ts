const CLASSIC_TILE_TYPES = ['pumpkin', 'hammer', 'tomato', 'pineapple', 'barrel', 'blueberry', 'fire', 'grapes', 'mushroom'] as const
const FARM_TILE_TYPES = ['pineapple', 'llama', 'cow', 'milk', 'lemon', 'fox', 'frog', 'bee', 'strawberry'] as const
export const TILE_TYPES = [...CLASSIC_TILE_TYPES, ...FARM_TILE_TYPES] as const
export type TileType = (typeof TILE_TYPES)[number]
export type Level = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
export const MAX_LEVEL: Level = 10
export const LEVEL_COLUMNS: Record<Level, number> = { 1: 4, 2: 5, 3: 6, 4: 7, 5: 8, 6: 9, 7: 10, 8: 10, 9: 10, 10: 10 }
export const LEVEL_ROWS: Record<Level, number> = { 1: 5, 2: 5, 3: 6, 4: 6, 5: 7, 6: 8, 7: 8, 8: 9, 9: 10, 10: 10 }
export const LEVEL_TYPES: Record<Level, number> = { 1: 3, 2: 4, 3: 5, 4: 6, 5: 7, 6: 8, 7: 9, 8: 9, 9: 9, 10: 9 }
export const LEVEL_CLUES: Record<Level, number> = { 1: 8, 2: 10, 3: 14, 4: 16, 5: 12, 6: 10, 7: 8, 8: 7, 9: 6, 10: 4 }
export const LEVEL_RESERVES: Record<Level, number> = { 1: 3, 2: 3, 3: 3, 4: 2, 5: 2, 6: 2, 7: 1, 8: 1, 9: 1, 10: 1 }
export const MAX_EXTRA_RESERVES = 1

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
    scrambled = constrainedScrambleState(solved, random)
    visibility = playableVisibility(columns, rows, clues, random)
  } else {
    const legacy = legacyScrambleState(solved, random)
    if (reverseScramble(legacy.state, legacy.plan).status !== 'won') throw new Error('Generated level failed solvability validation')
    scrambled = legacy.state
    visibility = level >= 5
      ? sparseVisibility(columns, rows, clues, random)
      : shuffle([...Array<boolean>(clues).fill(true), ...Array<boolean>(totalTiles - clues).fill(false)], random)
  }
  return resetGeneratedLevel(scrambled, level, visibility)
}

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

function playableVisibility(columns: number, rows: number, clues: number, random: () => number): boolean[] {
  // Keep each lane's clues at the bottom so every hidden tile is eventually exposed from the top.
  const visibility = Array<boolean>(columns * rows).fill(false)
  let remaining = clues
  for (let column = 1; column < columns; column += 1) {
    const lanesLeft = columns - column
    const minimum = Math.max(0, remaining - (lanesLeft - 1) * rows)
    const maximum = Math.min(rows, remaining)
    const count = Math.min(maximum, minimum + Math.floor(random() * (maximum - minimum + 1)))
    for (let row = rows - count; row < rows; row += 1) visibility[(column - 1) * rows + row] = true
    remaining -= count
  }
  return visibility
}

function sparseVisibility(columns: number, rows: number, clues: number, random: () => number): boolean[] {
  const slots: number[] = []
  for (let column = 0; column < columns - 1; column += 1) {
    const excludedRow = Math.floor(random() * rows)
    for (let row = 0; row < rows; row += 1) {
      if (row !== excludedRow) slots.push(column * rows + row)
    }
  }
  shuffle(slots, random)
  const visibility = Array<boolean>(columns * rows).fill(false)
  slots.slice(0, clues).forEach((slot) => { visibility[slot] = true })
  return visibility
}

function resetGeneratedLevel(state: GameState, level: Level, visibility: boolean[]): GameState {
  let index = 0
  const columns = state.columns.map((column) => column.map((item) => item ? { ...item, hidden: !visibility[index++] } : null))
  return { ...state, level, columns, tray: Array<Tile | null>(LEVEL_RESERVES[level]).fill(null), reserveAdds: 0, selected: [], moveCount: 0, revealedCount: columns.flat().filter((item) => item && !item.hidden).length, status: 'playing' }
}

function constrainedScrambleState(initial: GameState, random: () => number): GameState {
  // Exchange only top chunks in disjoint lane pairs. The reverse order is a legal solve path.
  const columns = initial.columns.map((column) => [...column])
  const rows = columns[0].length
  for (let first = 1; first + 1 < columns.length; first += 2) {
    const second = first + 1
    const cut = 1 + Math.floor(random() * Math.max(1, rows - 1))
    for (let row = 0; row < cut; row += 1) {
      const item = columns[first][row]
      columns[first][row] = columns[second][row]
      columns[second][row] = item
    }
  }
  return { ...initial, columns, selected: [], status: 'playing' }
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
