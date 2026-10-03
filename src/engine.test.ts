import { describe, expect, it } from 'vitest'
import { addReserveSlot, canMoveToColumn, canSelectTile, createLevel, firstHiddenRow, hasLegalMove, LEVEL_CLUES, LEVEL_COLUMNS, LEVEL_RESERVES, LEVEL_ROWS, LEVEL_TYPES, moveSelectedToColumn, revealTile, selectTile, type GameState, type Tile } from './engine'

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

  it('treats a matching-lane shuffle with no unlock as a dead end', () => {
    const tile = (type: Tile['type'], hidden = false): Tile => ({ id: `${type}-${Math.random()}`, type, hidden })
    const full = (type: Tile['type']) => Array.from({ length: 7 }, () => tile(type))
    const columns = [
      full('tomato'), full('mushroom'), full('barrel'), full('pumpkin'),
      [null, null, tile('hammer'), tile('hammer'), tile('hammer'), tile('tomato', true), tile('tomato', true)],
      full('fire'), full('pineapple'),
      [null, tile('hammer'), tile('hammer'), tile('mushroom'), tile('tomato', true), tile('mushroom'), tile('tomato', true)],
    ]
    const state: GameState = { level: 5, columns, columnTypes: Array(9).fill(null), tray: [tile('barrel'), tile('barrel')], reserveAdds: 0, selected: [], moveCount: 0, revealedCount: 0, status: 'playing' }
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
