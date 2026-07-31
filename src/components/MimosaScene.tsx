import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { getEnvironmentScene, getEnvironmentSceneCopy } from '../domain/environmentScene'
import type { EnvironmentState, PlantState } from '../domain/protocol'
import type { Locale } from '../i18n'

interface MimosaSceneProps {
  environments: EnvironmentState[]
  plant: PlantState
  active: boolean
  resumed?: boolean
  reaction?: { id: string; environment: EnvironmentState } | null
  breeze?: boolean
  alive?: boolean
  locale?: Locale
}

const leafletIndexes = Array.from({ length: 8 }, (_, index) => index)
const scenePositionKey = 'mimosa:scene-position:v1'

interface ScenePosition { x: number; y: number }

function readScenePosition(): ScenePosition {
  try {
    const parsed = JSON.parse(localStorage.getItem(scenePositionKey) ?? '') as Partial<ScenePosition>
    if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) return { x: parsed.x!, y: parsed.y! }
  } catch {
    // A missing or outdated preference simply falls back to the designed position.
  }
  return { x: 0, y: 0 }
}
const wateringStreams = [
  { d: 'M89 51 C84 92 99 158 135 198', width: .52, opacity: .38, dash: '.52 9.2', duration: 1.82, delay: -.54 },
  { d: 'M90 51 C87 97 104 166 139 201', width: .72, opacity: .52, dash: '.72 8.2', duration: 1.58, delay: -1.08 },
  { d: 'M91 52 C90 102 110 171 143 202', width: .9, opacity: .68, dash: '1.05 7.5', duration: 1.44, delay: -.27 },
  { d: 'M92 52 C93 107 117 172 147 203', width: .62, opacity: .56, dash: '.64 8.4', duration: 1.68, delay: -1.26 },
  { d: 'M93 53 C96 112 124 174 151 203', width: .96, opacity: .74, dash: '1.14 7.1', duration: 1.52, delay: -.76 },
  { d: 'M94 54 C99 115 131 174 155 202', width: .58, opacity: .5, dash: '.58 8.8', duration: 1.76, delay: -1.42 },
  { d: 'M91.5 53 C88 122 112 180 145 204', width: .82, opacity: .62, dash: '.88 7.8', duration: 1.48, delay: -.43 },
  { d: 'M95 55 C104 118 137 172 158 200', width: .48, opacity: .4, dash: '.48 9.4', duration: 1.9, delay: -1.12 },
  { d: 'M89.5 54 C82 112 98 174 139 202', width: .66, opacity: .54, dash: '.68 8.3', duration: 1.72, delay: -.91 },
]

function Frond({ x, y, angle, scale, order, droop }: { x: number; y: number; angle: number; scale: number; order: number; droop: number }) {
  return (
    <g className="frond" transform={`translate(${x} ${y}) rotate(${angle}) scale(${scale})`}>
      <g className="frond-growth" style={{ '--frond-grow-delay': `${.85 + order * .25}s`, '--frond-exit-delay': `${1.18 + (3 - order) * .18}s` } as CSSProperties}>
        <g className="frond-motion" style={{ '--frond-index': order, '--frond-droop': `${droop}deg` } as CSSProperties}>
          <path className="frond-stem" pathLength="1" d="M0 0 C22 -4 52 -3 86 1" />
          <path className="frond-highlight" pathLength="1" d="M2 -0.7 C25 -4.2 52 -3.2 84 .1" />
          {leafletIndexes.map((index) => {
            const leafX = 8.5 + index * 9.4
            const reach = 13.2 - index * .38
            const tipX = leafX + 12.5
            return (
              <g className="leaf-pair" key={index} style={{ '--leaf-index': index, '--growth-delay': `${1.15 + order * .25 + index * .045}s`, '--close-delay': `${order * 38 + index * 56}ms`, '--open-delay': `${(7 - index) * 44 + order * 28}ms` } as CSSProperties}>
                <path className="leaflet leaflet--upper" d={`M${leafX} 0 C${leafX + 1.2} ${-reach * .62} ${leafX + 6.4} ${-reach} ${tipX} ${-reach + 1.8} C${leafX + 10.3} ${-reach * .32} ${leafX + 4.2} -.8 ${leafX} 0Z`} />
                <path className="leaflet leaflet--lower" d={`M${leafX} 1 C${leafX + 1.2} ${reach * .62} ${leafX + 6.4} ${reach} ${tipX} ${reach - 1.8} C${leafX + 10.3} ${reach * .32} ${leafX + 4.2} 1.8 ${leafX} 1Z`} />
                <path className="leaf-vein leaf-vein--upper" d={`M${leafX + 1} -.8 L${leafX + 10.4} ${-reach + 2.2}`} />
                <path className="leaf-vein leaf-vein--lower" d={`M${leafX + 1} 1.8 L${leafX + 10.4} ${reach - 2.2}`} />
              </g>
            )
          })}
        </g>
      </g>
    </g>
  )
}

export function MimosaScene({ environments, plant, active, resumed = false, reaction = null, breeze = false, alive = false, locale = 'zh' }: MimosaSceneProps) {
  const sceneRef = useRef<HTMLElement>(null)
  const dragRef = useRef<{ pointerX: number; pointerY: number; position: ScenePosition } | null>(null)
  const [scenePosition, setScenePosition] = useState(readScenePosition)
  const weather = getEnvironmentScene(environments)
  const sceneCopy = getEnvironmentSceneCopy(environments, locale)
  const hasSunlight = environments.includes('sunlight')
  const hasWatering = environments.includes('watering')
  const hasClouds = environments.includes('cloudy')
  const plantLabel = (locale === 'en'
    ? { neutral: 'seedling', growing: 'growing', closing: 'leaves slowly closing', paused: 'paused', open: 'opening again', seed: 'saved as a seed', resolved: 'open again' }
    : { neutral: '幼苗', growing: '正在生长', closing: '叶片慢慢合起', paused: '停在此刻', open: '重新舒展', seed: '种子暂存', resolved: '舒展如初' })[plant]
  const gardenNote = locale === 'en'
    ? {
        neutral: { kicker: 'Mimosa', message: 'The seedling is waiting for the next quiet moment.' },
        growing: { kicker: 'Mimosa', message: 'The mimosa is growing. Responses are still welcome.' },
        closing: { kicker: 'Mimosa', message: 'The leaves are closing. You can still respond.' },
        paused: { kicker: 'Mimosa', message: 'A response has reached the shared garden.' },
        open: { kicker: 'Mimosa', message: 'The leaves are opening again.' },
        seed: { kicker: 'Saved for later', message: 'The question is in the seed bank and can be edited before it returns.' },
        resolved: { kicker: 'Moment ended', message: 'The seedling will return and wait for the next quiet moment.' },
      }
    : {
        neutral: { kicker: 'Mimosa', message: '幼苗正在等待下一次沉默时刻。' },
        growing: { kicker: 'Mimosa', message: '含羞草正在长出，大家仍可以回应。' },
        closing: { kicker: 'Mimosa', message: '叶片正在合拢，仍然可以回应。' },
        paused: { kicker: 'Mimosa', message: '一份回应已经抵达共享花园。' },
        open: { kicker: 'Mimosa', message: '叶片正在重新舒展。' },
        seed: { kicker: '留待稍后', message: '问题已存入种子暂存区，带回前可以再次编辑。' },
        resolved: { kicker: '本轮结束', message: '幼苗将重新出现，等待下一次沉默时刻。' },
      }
  const note = active ? gardenNote[plant] : gardenNote.neutral

  function constrainPosition(candidate: ScenePosition): ScenePosition {
    const scene = sceneRef.current
    const boundary = scene?.offsetParent
    if (!scene || !(boundary instanceof HTMLElement)) return candidate
    const sceneRect = scene.getBoundingClientRect()
    const boundaryRect = boundary.getBoundingClientRect()
    const deltaX = candidate.x - scenePosition.x
    const deltaY = candidate.y - scenePosition.y
    const margin = 10
    return {
      x: candidate.x + Math.max(0, boundaryRect.left + margin - (sceneRect.left + deltaX))
        - Math.max(0, sceneRect.right + deltaX - (boundaryRect.right - margin)),
      y: candidate.y + Math.max(0, boundaryRect.top + margin - (sceneRect.top + deltaY))
        - Math.max(0, sceneRect.bottom + deltaY - (boundaryRect.bottom - margin)),
    }
  }

  function commitPosition(position: ScenePosition) {
    const constrained = constrainPosition(position)
    setScenePosition(constrained)
    try {
      localStorage.setItem(scenePositionKey, JSON.stringify(constrained))
    } catch {
      // Dragging still works when storage is unavailable in a private context.
    }
  }

  function startDragging(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, position: scenePosition }
  }

  function dragScene(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current
    if (!drag) return
    commitPosition({
      x: drag.position.x + event.clientX - drag.pointerX,
      y: drag.position.y + event.clientY - drag.pointerY,
    })
  }

  function stopDragging(event: ReactPointerEvent<HTMLElement>) {
    if (!dragRef.current) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function moveWithKeyboard(event: KeyboardEvent<HTMLElement>) {
    const movement = event.shiftKey ? 24 : 8
    const delta = {
      ArrowLeft: { x: -movement, y: 0 }, ArrowRight: { x: movement, y: 0 },
      ArrowUp: { x: 0, y: -movement }, ArrowDown: { x: 0, y: movement },
    }[event.key]
    if (!delta) return
    event.preventDefault()
    commitPosition({ x: scenePosition.x + delta.x, y: scenePosition.y + delta.y })
  }

  useEffect(() => {
    const keepSceneVisible = () => commitPosition(scenePosition)
    window.addEventListener('resize', keepSceneVisible)
    return () => window.removeEventListener('resize', keepSceneVisible)
  })

  return (
    <figure
      ref={sceneRef}
      className="mimosa-scene"
      style={{ '--scene-drag-x': `${scenePosition.x}px`, '--scene-drag-y': `${scenePosition.y}px` } as CSSProperties}
      data-active={active}
      data-resumed={resumed}
      data-breeze={breeze}
      data-alive={alive}
      data-weather={weather}
      data-sunlight={hasSunlight}
      data-watering={hasWatering}
      data-cloudy={hasClouds}
      data-plant={plant}
      aria-label={locale === 'en'
        ? `Shared mimosa: ${sceneCopy.label}; plant ${plantLabel}; ${alive ? 'gently moving' : 'quiet'}`
        : `共享含羞草：${sceneCopy.label}，植物${plantLabel}，${alive ? '轻轻摆动' : '环境安静'}`}
    >
      <div className="garden-visual" aria-hidden="true">
        {reaction && (
          <div key={reaction.id} className={`scene-reaction scene-reaction--${reaction.environment}`}>
            <span />
            <i /><i /><i /><i />
          </div>
        )}
        <div className="ambient-light" />
        <div className="garden-depth"><i /><i /><i /><i /><i /></div>
        <div className="breeze-lines"><i /><i /><i /><i /></div>
        <div className="sun"><span /></div>
        <div className="cloud-layer"><div className="cloud-drift"><span /><span /><span /><span /></div></div>
        <div className="air-particles">{Array.from({ length: 7 }, (_, index) => <i key={index} style={{ '--particle-left': `${8 + index * 13}%`, '--particle-top': `${20 + (index % 3) * 22}%`, '--particle-duration': `${5.8 + index * .45}s`, '--particle-delay': `${index * -.72}s` } as CSSProperties} />)}</div>
        <svg className="mimosa-illustration" viewBox="0 0 320 230">
        <defs>
          <linearGradient id="stem-green" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7fd394" />
            <stop offset=".58" stopColor="#3d966b" />
            <stop offset="1" stopColor="#225e47" />
          </linearGradient>
          <linearGradient id="leaf-green" x1="0" y1="0" x2="1" y2="1">
            <stop className="leaf-stop leaf-stop--light" offset="0" />
            <stop className="leaf-stop leaf-stop--mid" offset=".52" />
            <stop className="leaf-stop leaf-stop--shade" offset="1" />
          </linearGradient>
          <radialGradient id="bloom-pink" cx="38%" cy="32%">
            <stop offset="0" stopColor="#ffe2ec" />
            <stop offset=".38" stopColor="#f59ab9" />
            <stop offset="1" stopColor="#c93f78" />
          </radialGradient>
          <linearGradient id="can-paint" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#b9ddca" />
            <stop offset=".5" stopColor="#7eae96" />
            <stop offset="1" stopColor="#557f6c" />
          </linearGradient>
          <linearGradient id="water-flow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#d9f7f8" stopOpacity=".58" />
            <stop offset=".52" stopColor="#b9e9ef" stopOpacity=".92" />
            <stop offset="1" stopColor="#90ced9" stopOpacity=".46" />
          </linearGradient>
          <radialGradient id="seed-paint" cx="34%" cy="26%">
            <stop offset="0" stopColor="#ffe8a6" />
            <stop offset=".46" stopColor="#d8ae5f" />
            <stop offset="1" stopColor="#93683d" />
          </radialGradient>
          <radialGradient id="soil-glow"><stop offset="0" stopColor="#56a676" stopOpacity=".34" /><stop offset="1" stopColor="#143a29" stopOpacity="0" /></radialGradient>
          <filter id="soft-bloom" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="1.35" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="plant-shadow" x="-20%" y="-20%" width="150%" height="160%"><feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#06130d" floodOpacity=".22" /></filter>
        </defs>

        <ellipse className="ground-glow" cx="160" cy="202" rx="92" ry="24" />
        <ellipse className="soil-bed" cx="160" cy="207" rx="62" ry="10" />
        <g className="ground-detail"><path d="M109 205 q7 -8 12 0 M198 205 q6 -7 11 0 M128 208 q5 -5 9 0" /><circle cx="188" cy="207" r="1.4" /><circle cx="142" cy="210" r="1.1" /></g>
        <g className="water-absorption">
          <ellipse className="water-ring water-ring--one" cx="160" cy="204" rx="31" ry="6" />
          <ellipse className="water-ring water-ring--two" cx="160" cy="204" rx="31" ry="6" />
          <circle className="water-spark water-spark--one" cx="142" cy="200" r="2" />
          <circle className="water-spark water-spark--two" cx="178" cy="201" r="1.7" />
        </g>

        <g className="seedling-position" transform="translate(173 205)">
          <g className="seedling">
            <path className="seedling-stem" pathLength="1" d="M0 0 C-1 -14 2 -28 0 -42" />
            <path className="seedling-leaf seedling-leaf--left" d="M-1 -25 C-10 -38 -22 -36 -28 -28 C-18 -22 -9 -20 -1 -25Z" />
            <path className="seedling-leaf seedling-leaf--right" d="M1 -35 C11 -48 23 -45 28 -37 C18 -30 9 -29 1 -35Z" />
            <circle className="seedling-bud" cx="0" cy="-45" r="3.5" />
          </g>
        </g>

        <g className="plant-presence">
        <g className="plant-body" filter="url(#plant-shadow)">
          <path className="main-stem growth-main-stem" pathLength="1" d="M160 205 C157 170 164 128 159 57" />
          <path className="stem-highlight growth-main-stem" pathLength="1" d="M158.8 203 C156.8 168 162.4 126 158 59" />
          <path className="side-stem growth-side-stem growth-side-stem--one" pathLength="1" d="M160 160 C143 148 135 132 129 112" />
          <path className="side-stem growth-side-stem growth-side-stem--two" pathLength="1" d="M160 139 C176 126 185 109 191 90" />
          <Frond x={157} y={162} angle={-161} scale={0.86} order={0} droop={-2.2} />
          <Frond x={160} y={145} angle={-20} scale={0.92} order={1} droop={2.6} />
          <Frond x={159} y={122} angle={-166} scale={0.74} order={2} droop={-3.1} />
          <Frond x={159} y={104} angle={-25} scale={0.68} order={3} droop={2.2} />
          <g className="bloom-position" transform="translate(159 50)">
            <g className="bloom growth-bloom" filter="url(#soft-bloom)">
              {Array.from({ length: 42 }, (_, index) => {
                const angle = index * 137.5
                const radius = 2.5 + Math.sqrt(index) * 2.85
                const x = Math.cos(angle * Math.PI / 180) * radius
                const y = Math.sin(angle * Math.PI / 180) * radius
                return <circle key={index} cx={x} cy={y} r={1.65 + (index % 4) * .22} style={{ '--bloom-index': index, '--bloom-grow-delay': `${2.8 + index * .008}s` } as CSSProperties} />
              })}
            </g>
          </g>
          <g className="dew" aria-hidden="true">
            <circle cx="100" cy="126" r="2.4" /><circle cx="218" cy="128" r="2" /><circle cx="115" cy="154" r="1.7" /><circle cx="202" cy="105" r="1.45" />
          </g>
          <g className="leaf-drips" aria-hidden="true"><circle cx="95" cy="135" r="1.7" /><circle cx="226" cy="133" r="1.5" /><circle cx="109" cy="164" r="1.25" /></g>
        </g>
        </g>

        <g className="watering-action" aria-hidden="true">
          <g className="watering-can-position" transform="translate(62 34) rotate(-10) scale(-.48 .48)">
            <g className="watering-can">
              <path className="watering-can-body" d="M-18 -12 H20 C25 -12 28 -8 28 -3 V24 C28 30 24 34 18 34 H-17 C-23 34 -27 30 -27 24 V-3 C-27 -8 -23 -12 -18 -12Z" />
              <path className="watering-can-handle" d="M24 -4 C48 -5 51 29 27 29" />
              <path className="watering-can-spout" d="M-23 0 C-39 4 -48 11 -61 21 L-57 27 C-43 21 -34 17 -21 16Z" />
              <ellipse className="watering-can-rose" cx="-61" cy="24" rx="5.5" ry="7" />
              <circle className="watering-can-hole" cx="-63" cy="21.5" r=".8" />
              <circle className="watering-can-hole" cx="-59" cy="24" r=".8" />
              <circle className="watering-can-hole" cx="-63" cy="27" r=".8" />
              <path className="watering-can-rim" d="M-14 -16 H15" />
              <circle className="watering-can-shine" cx="14" cy="1" r="3" />
            </g>
          </g>
          <g className="watering-streams">
            {wateringStreams.map((stream, index) => (
              <g key={index}>
                <path
                  className="watering-flow-trace"
                  d={stream.d}
                  style={{
                    '--flow-width': `${stream.width}px`,
                    '--flow-trace-opacity': stream.opacity * .2,
                    '--flow-trace-peak': stream.opacity * .3,
                  } as CSSProperties}
                />
                <path
                  className="watering-flow"
                  d={stream.d}
                  style={{
                    '--flow-width': `${stream.width}px`,
                    '--flow-opacity': stream.opacity,
                    '--flow-mid-opacity': stream.opacity * .88,
                    '--flow-dash': stream.dash,
                    '--flow-duration': `${stream.duration}s`,
                    '--flow-delay': `${stream.delay}s`,
                  } as CSSProperties}
                />
              </g>
            ))}
          </g>
          <g className="watering-splash">
            <path d="M149 199 q5 -7 10 0 M164 199 q5 -8 10 0" />
            <circle cx="143" cy="195" r="1.7" />
            <circle cx="178" cy="196" r="1.5" />
          </g>
        </g>

        <g className="seed-particles" aria-hidden="true">
          {[
            [-34, -27, 0], [31, -30, .09], [-42, 8, .18], [40, 13, .27],
            [-22, 34, .36], [24, 37, .45], [-5, -45, .54], [6, 42, .63],
          ].map(([dx, dy, delay], index) => (
            <circle
              key={index}
              cx="160"
              cy="181"
              r={index % 3 === 0 ? 2.1 : 1.45}
              style={{
                '--seed-dx': `${dx}px`,
                '--seed-dy': `${dy}px`,
                '--seed-delay': `${delay}s`,
              } as CSSProperties}
            />
          ))}
        </g>
        <ellipse className="seed-aura" cx="160" cy="172" rx="27" ry="27" aria-hidden="true" />
        <ellipse className="seed-shadow" cx="160" cy="201" rx="14" ry="3.6" aria-hidden="true" />
        <g className="seed-position" transform="translate(160 170)">
          <g className="seed">
            <path className="seed-shell" d="M0 -16 C10 -10 13 2 8 11 C5 16 1 19 0 19 C-2 19 -6 16 -9 11 C-14 2 -10 -10 0 -16Z" />
            <path className="seed-seam" d="M-1 -13 C3 -6 4 4 0 15" />
            <path className="seed-highlight" d="M-5 -8 C-2 -11 1 -11 3 -9" />
            <path className="seed-tip" d="M0 -16 C-1 -20 1 -23 4 -25" />
          </g>
        </g>
        </svg>
      </div>
      <figcaption
        key={`${active}-${weather}-${plant}-${breeze}`}
        className="scene-drag-handle"
        tabIndex={0}
        title={locale === 'en' ? 'Drag to move · Double-click to reset' : '拖动可移动 · 双击恢复默认位置'}
        aria-label={locale === 'en' ? `${note.kicker}. ${note.message}. Drag to move the Mimosa panel.` : `${note.kicker}。${note.message}。可拖动此区域移动含羞草。`}
        onPointerDown={startDragging}
        onPointerMove={dragScene}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onDoubleClick={() => commitPosition({ x: 0, y: 0 })}
        onKeyDown={moveWithKeyboard}
      >
        <span className="scene-kicker">{note.kicker}</span>
        <strong>{note.message}</strong>
      </figcaption>
    </figure>
  )
}
