import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  canMoveToColumn,
  canSelectTile,
  createLevel,
  firstHiddenRow,
  addReserveSlot,
  hasLegalMove,
  LEVEL_COLUMNS,
  LEVEL_ROWS,
  moveSelectedToColumn,
  moveSelectedToTray,
  MAX_LEVEL,
  MAX_RESERVE_SLOTS,
  revealTile,
  selectTile,
  getSelectedTile,
  type GameState,
  type Selection,
  type Tile,
  type TileType,
  type Level,
} from './engine'

const art: Record<TileType, string> = {
  pumpkin: '🎃',
  hammer: '🔨',
  tomato: '🍅',
  pineapple: '🍍',
  barrel: '🛢️',
  blueberry: '🔵',
  fire: '🔥',
  grapes: '🍇',
  mushroom: '🍄',
  llama: '🦙',
  cow: '🐮',
  milk: '🥛',
  lemon: '🍋',
  fox: '🦊',
  frog: '🐸',
  bee: '🐝',
  strawberry: '🍓',
}

const names: Record<TileType, string> = {
  pumpkin: 'pumpkin',
  hammer: 'hammer',
  tomato: 'tomato',
  pineapple: 'pineapple',
  barrel: 'barrel',
  blueberry: 'blueberry',
  fire: 'campfire',
  grapes: 'grapes',
  mushroom: 'mushroom',
  llama: 'llama',
  cow: 'cow',
  milk: 'milk',
  lemon: 'lemon',
  fox: 'fox',
  frog: 'frog',
  bee: 'bee',
  strawberry: 'strawberry',
}

function sameSelection(selected: Selection[], b: Selection) {
  return selected.some((a) => a.kind === b.kind && (a.kind === 'tray'
    ? a.index === (b as { kind: 'tray'; index: number }).index
    : a.column === (b as { kind: 'column'; column: number; row: number }).column && a.row === (b as { kind: 'column'; column: number; row: number }).row))
}

function TileFace({ tile, small = false }: { tile: Tile; small?: boolean }) {
  return (
    <span className={`tile-face ${tile.hidden ? 'is-hidden' : ''} ${small ? 'is-small' : ''}`} aria-label={tile.hidden ? 'Hidden tile' : names[tile.type]}>
      <span aria-hidden="true">{tile.hidden ? '?' : art[tile.type]}</span>
    </span>
  )
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function starsFor(level: Level, moves: number, seconds: number, reserveAdds = 0, resets = 0) {
  const score = moves + Math.round(seconds * 0.5) + reserveAdds * 25 + resets * 35
  const threeStarPar = Math.round((LEVEL_COLUMNS[level] - 1) * LEVEL_ROWS[level] * 1.8 + level * 5)
  return score <= threeStarPar ? 3 : score <= threeStarPar + 65 ? 2 : 1
}

function isCompleteLane(column: Array<Tile | null>) {
  const first = column[0]
  if (!first) return false
  return column.every((item) => item && !item.hidden && item.type === first.type)
}

function readBestScores() {
  return Object.fromEntries(Array.from({ length: MAX_LEVEL }, (_, index) => {
    const level = index + 1
    return [level, Number(localStorage.getItem(`sort-best-stars-${level}`) ?? 0)]
  })) as Record<number, number>
}

function beep(enabled: boolean, frequency = 420) {
  if (!enabled) return
  const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const context = new AudioContextClass()
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.frequency.value = frequency
  gain.gain.setValueAtTime(0.04, context.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.09)
  oscillator.connect(gain).connect(context.destination)
  oscillator.start()
  oscillator.stop(context.currentTime + 0.09)
}

export default function App() {
  const [game, setGame] = useState<GameState>(() => createLevel())
  const [history, setHistory] = useState<GameState[]>([])
  const [message, setMessage] = useState('Flip the first tile in any lane')
  const [paused, setPaused] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [showLevelMap, setShowLevelMap] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [resetCount, setResetCount] = useState(0)
  const [bestScores, setBestScores] = useState<Record<number, number>>(() => readBestScores())
  const [unlockedLevel, setUnlockedLevel] = useState<Level>(() => Math.min(MAX_LEVEL, Math.max(1, Number(localStorage.getItem('sort-unlocked-level') ?? 1))) as Level)
  const [pulseColumn, setPulseColumn] = useState<number | null>(null)
  const [sound, setSound] = useState(() => localStorage.getItem('sort-sound') !== 'off')
  const dragSelecting = useRef(false)
  const suppressTileClick = useRef(false)
  const timer = useRef<number | null>(null)
  const pulseTimer = useRef<number | null>(null)

  useEffect(() => localStorage.setItem('sort-sound', sound ? 'on' : 'off'), [sound])

  useEffect(() => {
    if (paused || showRules || showLevelMap || game.status !== 'playing') return
    timer.current = window.setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => { if (timer.current) window.clearInterval(timer.current) }
  }, [paused, showRules, showLevelMap, game.status])

  useEffect(() => {
    if (game.status !== 'won') return
    const stars = starsFor(game.level, game.moveCount, seconds, game.reserveAdds, resetCount)
    const key = `sort-best-stars-${game.level}`
    const best = Math.max(stars, Number(localStorage.getItem(key) ?? 0))
    localStorage.setItem(key, String(best))
    setBestScores((scores) => ({ ...scores, [game.level]: best }))
    if (game.level < MAX_LEVEL) {
      const nextLevel = (game.level + 1) as Level
      setUnlockedLevel((current) => {
        const unlocked = Math.max(current, nextLevel) as Level
        localStorage.setItem('sort-unlocked-level', String(unlocked))
        return unlocked
      })
    }
  }, [game.status, game.level, game.moveCount, seconds, resetCount])

  useEffect(() => {
    if (game.status === 'playing' && !hasLegalMove(game)) setGame({ ...game, status: 'no-legal-move' })
  }, [game])

  const bestStars = bestScores[game.level] ?? 0

  const totalTiles = game.columns.flat().filter(Boolean).length
  const hiddenLeft = totalTiles - game.revealedCount
  const selectedTile = useMemo(() => {
    const selection = game.selected[0]
    if (!selection) return null
    return selection.kind === 'tray'
      ? game.tray[selection.index]
      : game.columns[selection.column][selection.row]
  }, [game])

  function commit(next: GameState, text: string, frequency: number) {
    if (next === game) return
    setHistory((items) => [...items.slice(-19), game])
    setGame(next)
    setMessage(text)
    beep(sound, frequency)
  }

  function selectionHint(state: GameState, item: Tile) {
    const targets = state.columns.flatMap((_, index) => canMoveToColumn(state, index) ? [index + 1] : [])
    if (targets.length) return `${state.selected.length} ${names[item.type]}${state.selected.length === 1 ? '' : 's'} selected. Choose a legal lane.`
    if (state.selected.some((entry) => entry.kind === 'column') && state.tray.some((entry) => !entry)) return `${names[item.type]} selected. Store it or flip another ?.`
    return state.tray.every(Boolean)
      ? `No legal move for ${names[item.type]}. Undo or restart the puzzle.`
      : `No ${names[item.type]} match yet. Flip another ? tile.`
  }

  function beginTileSelection(column: number, row: number, event: ReactPointerEvent<HTMLButtonElement>) {
    const item = game.columns[column][row]
    if (!item || item.hidden || paused || !canSelectTile(game, { kind: 'column', column, row })) return
    event.preventDefault()
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Pointer capture is unavailable in some embedded browsers. */ }
    if (game.selected.length && canMoveToColumn(game, column)) {
      suppressTileClick.current = true
      placeInColumn(column)
      return
    }
    dragSelecting.current = true
    suppressTileClick.current = true
    const next = selectTile(game, { kind: 'column', column, row })
    setGame(next)
    setMessage(next.selected.length ? selectionHint(next, item) : 'Choose a tile')
    beep(sound, 360)
  }

  function extendTileSelection(column: number, row: number) {
    if (!dragSelecting.current) return
    const item = game.columns[column][row]
    const first = game.selected[0]
    const firstTile = getSelectedTile(game, first)
    const selection = { kind: 'column', column, row } as const
    if (!item || item.hidden || !first || first.kind !== 'column' || first.column !== column || !firstTile || firstTile.type !== item.type || !canSelectTile(game, selection) || sameSelection(game.selected, selection)) return
    const next = selectTile(game, selection)
    setGame(next)
    setMessage(`${next.selected.length} ${names[item.type]}${next.selected.length === 1 ? '' : 's'} selected.`)
  }

  function handleBoardPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragSelecting.current) return
    event.preventDefault()
    const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-tile-column][data-tile-row]')
    if (!element) return
    const column = Number(element.dataset.tileColumn)
    const row = Number(element.dataset.tileRow)
    if (Number.isInteger(column) && Number.isInteger(row)) extendTileSelection(column, row)
  }

  function clickBoardTile(column: number, row: number) {
    if (suppressTileClick.current) {
      suppressTileClick.current = false
      return
    }
    if (game.selected.length && canMoveToColumn(game, column)) {
      placeInColumn(column)
      return
    }
    const item = game.columns[column][row]
    if (!item || paused) return
    if (item.hidden) {
      const next = revealTile(game, column, row)
      commit(next, selectionHint(next, item), 560)
      return
    }
    if (!canSelectTile(game, { kind: 'column', column, row })) return
    const selection = { kind: 'column', column, row } as const
    const next = selectTile(game, selection)
    setGame(next)
    setMessage(next.selected.length ? selectionHint(next, item) : 'Choose a tile')
    beep(sound, 360)
  }

  function clickTray(index: number) {
    if (paused) return
    const item = game.tray[index]
    if (item) {
      const selection = { kind: 'tray', index } as const
      const next = selectTile(game, selection)
      setGame(next)
      setMessage(next.selected.length ? selectionHint(next, item) : 'Choose a tile')
      beep(sound, 360)
      return
    }
    if (game.selected.length === 1 && game.selected[0].kind === 'column') commit(moveSelectedToTray(game, index), 'Tile stored in reserve', 280)
  }

  function placeInColumn(column: number) {
    if (!canMoveToColumn(game, column)) return
    const next = moveSelectedToColumn(game, column)
    if (next === game) return
    commit(next, `Moved to lane ${column + 1}`, 470)
    setPulseColumn(column)
    if (pulseTimer.current) window.clearTimeout(pulseTimer.current)
    pulseTimer.current = window.setTimeout(() => setPulseColumn(null), 260)
  }

  function reset() {
    setGame(createLevel(game.level))
    setHistory([])
    setSeconds(0)
    setResetCount((count) => count + 1)
    setShowLevelMap(false)
    setPaused(false)
    setMessage('Flip the first tile in any lane')
  }

  function loadLevel(level: Level) {
    setGame(createLevel(level))
    setHistory([])
    setSeconds(0)
    setResetCount(0)
    setShowLevelMap(false)
    setPaused(false)
    setShowRules(false)
    setMessage(level === 1 ? 'Flip the first tile in any lane' : 'Some clues are already face-up')
  }

  function undo() {
    const previous = history.at(-1)
    if (!previous) return
    setGame(previous)
    setHistory((items) => items.slice(0, -1))
    setMessage('Last action undone')
  }

  function useExtraReserve() {
    const next = addReserveSlot(game)
    if (next === game) return
    commit(next, 'One extra reserve slot added', 390)
  }

  return (
    <main className="game-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">⇄</span>
          <div><h1>SORT IT OUT</h1><p>Flip. Pair. Fill.</p></div>
        </div>
        <div className="header-actions">
          <button className="icon-button" onClick={() => setSound((value) => !value)} aria-label={sound ? 'Mute sound' : 'Turn sound on'}>{sound ? '♪' : '×'}</button>
          <button className="icon-button" onClick={() => setShowLevelMap(true)} aria-label="Open level map">▦</button>
          <button className="icon-button" onClick={() => setShowRules(true)} aria-label="How to play">?</button>
          <button className="icon-button" onClick={() => setPaused(true)} aria-label="Pause game">Ⅱ</button>
        </div>
      </header>

      <section className="score-row" aria-label="Game progress">
        <div><span>LEVEL</span><strong>{String(game.level).padStart(2, '0')}</strong></div>
        <div><span>MOVES</span><strong>{String(game.moveCount).padStart(2, '0')}</strong></div>
        <div><span>REVEALED</span><strong>{game.revealedCount}/{totalTiles}</strong></div>
        <div><span>TIME</span><strong>{formatTime(seconds)}</strong></div>
        <div><span>RESETS</span><strong>{String(resetCount).padStart(2, '0')}</strong></div>
      </section>

      <section className="play-area">
        <div className="instruction" aria-live="polite">
          <span className={!selectedTile ? 'step-active' : ''}>1</span>
          <p>{message}</p>
          <span className={selectedTile ? 'step-active' : ''}>2</span>
        </div>

        <div className="tray-wrap" style={{ width: `min(100%, ${game.tray.length * 88 + (game.tray.length - 1) * 8 + 16}px)` }}>
          <span className="tray-label">YOUR TILES · {game.tray.length} RESERVE</span>
          <div className={`tray tray-count-${game.tray.length}`} aria-label={`${game.tray.length} reserve tiles`}>
            {game.tray.map((item, index) => {
              const selection = { kind: 'tray', index } as const
              return (
                <button
                  key={index}
                  className={`tray-slot ${item ? 'is-occupied' : ''} ${sameSelection(game.selected, selection) ? 'is-selected' : ''} ${!item && game.selected.some((entry) => entry.kind === 'column') ? 'is-drop-target' : ''}`}
                  onClick={() => clickTray(index)}
                  aria-label={item ? `Select reserved ${names[item.type]}` : game.selected.length === 1 && game.selected[0].kind === 'column' ? 'Store selected tile here' : 'Empty reserve slot'}
                >
                  {item ? <TileFace tile={item} small /> : <span className="empty-mark" aria-hidden="true">+</span>}
                </button>
              )
            })}
          </div>
        </div>

        <div className="board-frame" style={{ width: `min(100%, ${game.columns.length * 88 + 24}px)` }}>
          <div className="board-topline"><span>FLIP THE NEXT ? IN ANY LANE</span><span>{hiddenLeft} HIDDEN</span></div>
          <div className="board" style={{ gridTemplateColumns: `repeat(${game.columns.length}, minmax(0, 1fr))` }} onPointerMove={handleBoardPointerMove} onPointerUp={() => { dragSelecting.current = false }} onPointerCancel={() => { dragSelecting.current = false }}>
            {game.columns.map((column, columnIndex) => {
              const legalTarget = canMoveToColumn(game, columnIndex)
              const nextHidden = firstHiddenRow(column)
              const lowestEmpty = column.reduce((last, item, row) => item ? last : row, -1)
              return (
                <section className={`lane ${pulseColumn === columnIndex ? 'is-pulsing' : ''} ${isCompleteLane(column) ? 'is-complete' : ''}`} key={columnIndex} aria-label={`Lane ${columnIndex + 1}`} onClick={(event) => {
                  if (legalTarget && !(event.target as HTMLElement).closest('button')) placeInColumn(columnIndex)
                }}>
                  <button className="lane-target" onClick={() => placeInColumn(columnIndex)} disabled={!legalTarget} aria-label={`Place selected tile in lane ${columnIndex + 1}`}>
                    <span>{columnIndex + 1}</span>
                  </button>
                  <div className="lane-track" style={{ gridTemplateRows: `repeat(${column.length}, minmax(0, 1fr))` }}>
                    {column.map((item, row) => {
                      if (!item) return legalTarget && row === lowestEmpty ? (
                        <button className="board-slot is-empty" key={`empty-${row}`} onClick={() => placeInColumn(columnIndex)} aria-label={`Place selected tile in lane ${columnIndex + 1}`} />
                      ) : <span className="board-slot is-empty" key={`empty-${row}`} aria-label="Empty tile space" />
                      const selection = { kind: 'column', column: columnIndex, row } as const
                      const isNext = item.hidden && row === nextHidden
                      return (
                        <button
                          className={`board-slot tile-button ${sameSelection(game.selected, selection) ? 'is-selected' : ''} ${isNext ? 'is-flippable' : ''} ${!item.hidden && !canSelectTile(game, selection) ? 'is-blocked' : ''}`}
                          data-tile-column={columnIndex}
                          data-tile-row={row}
                          key={item.id}
                          onClick={() => clickBoardTile(columnIndex, row)}
                          onPointerDown={(event) => beginTileSelection(columnIndex, row, event)}
                          onPointerEnter={() => extendTileSelection(columnIndex, row)}
                          disabled={item.hidden && !isNext}
                          aria-disabled={!item.hidden && !canSelectTile(game, selection)}
                          aria-label={item.hidden ? isNext ? `Flip lane ${columnIndex + 1}, row ${row + 1}` : 'Hidden tile' : canSelectTile(game, selection) ? `Select ${names[item.type]}` : 'Blocked tile'}
                        >
                          <TileFace tile={item} small />
                        </button>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        </div>
      </section>

      <footer className="game-footer">
        <button onClick={undo} disabled={!history.length}>↶ Undo</button>
        <p>Press and drag across matching exposed tiles, then fill the lowest open spaces.</p>
        <button onClick={reset}>↻ Restart</button>
      </footer>

      {(paused || showRules || showLevelMap || game.status !== 'playing') && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            {game.status === 'won' ? (
              <>
                <span className="modal-symbol">✓</span><h2 id="modal-title">SORTED!</h2><div className="stars" aria-label={`${starsFor(game.level, game.moveCount, seconds, game.reserveAdds, resetCount)} stars`}>{'★'.repeat(starsFor(game.level, game.moveCount, seconds, game.reserveAdds, resetCount))}{'☆'.repeat(3 - starsFor(game.level, game.moveCount, seconds, game.reserveAdds, resetCount))}</div><p>Every lane is complete. Best: {bestStars}★</p>
                <div className="result-grid"><span>Moves<strong>{game.moveCount}</strong></span><span>Revealed<strong>{game.revealedCount}</strong></span><span>Time<strong>{formatTime(seconds)}</strong></span><span>Resets<strong>{resetCount}</strong></span><span>Extra reserve<strong>{game.reserveAdds}</strong></span></div>
                <button className="primary-button" onClick={() => game.level < MAX_LEVEL ? loadLevel((game.level + 1) as Level) : reset()}>{game.level < MAX_LEVEL ? 'Next level' : 'Play again'}</button>
              </>
            ) : game.status === 'no-legal-move' ? (
              <>
                <span className="modal-symbol">!</span><h2 id="modal-title">OUT OF MOVES</h2><p>There is no productive move available right now. Undo the last move, use one extra reserve, or restart the puzzle.</p>
                <button className="primary-button" onClick={undo} disabled={!history.length}>↶ Undo last move</button>
                <button className="secondary-button" onClick={useExtraReserve} disabled={game.tray.length >= MAX_RESERVE_SLOTS}>＋1 reserve slot ({game.tray.length}/{MAX_RESERVE_SLOTS})</button>
                <button className="text-button" onClick={reset}>Restart puzzle</button>
              </>
            ) : showLevelMap ? (
              <>
                <span className="modal-symbol">▦</span><h2 id="modal-title">LEVEL MAP</h2><p>Complete a level to unlock the next one.</p>
                <div className="level-map">
                  {Array.from({ length: MAX_LEVEL }, (_, index) => {
                    const level = (index + 1) as Level
                    const locked = level > unlockedLevel
                    return <button key={level} className={`level-node ${level === game.level ? 'is-current' : ''} ${locked ? 'is-locked' : ''}`} disabled={locked} onClick={() => loadLevel(level)} aria-label={locked ? `Level ${level} locked` : `Play level ${level}`}>
                      <strong>{locked ? '·' : String(level).padStart(2, '0')}</strong><small>{locked ? 'LOCKED' : bestScores[level] ? `${bestScores[level]}★` : 'NEW'}</small>
                    </button>
                  })}
                </div>
                <button className="primary-button" onClick={() => setShowLevelMap(false)}>Back to puzzle</button>
              </>
            ) : showRules ? (
              <>
                <span className="modal-symbol">?</span><h2 id="modal-title">HOW TO PLAY</h2>
                <ol><li>Sort each icon set into its own lane. One lane finishes completely empty.</li><li>Press and hold, then drag across matching exposed tiles to select a group.</li><li>Tap a legal lane to transfer the group into its lowest open spaces.</li><li>Store a single unmatched tile in the reserve slots.</li></ol>
                <button className="primary-button" onClick={() => setShowRules(false)}>Got it</button>
              </>
            ) : (
              <>
                <span className="modal-symbol">Ⅱ</span><h2 id="modal-title">PAUSED</h2><p>The clock is stopped.</p>
                <button className="primary-button" onClick={() => setPaused(false)}>Keep sorting</button>
                <button className="text-button" onClick={reset}>Restart puzzle</button>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  )
}
