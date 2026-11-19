import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { bridge } from './state/bridge';
import { Hotbar } from './ui/Hotbar';
import { SeedsPopover } from './ui/SeedsPopover';
import { BuildPopover } from './ui/BuildPopover';
import { BarnConfirm } from './ui/BarnConfirm';
import { PlayerWidget } from './ui/PlayerWidget';
import { SettingsModal } from './ui/SettingsModal';
import { OrderCard } from './ui/OrderCard';
import { StartOverlay } from './ui/StartOverlay';

const VIEW_W = 480;
const VIEW_H = 270;

function computeScale(winW: number, winH: number): number {
  const fit = Math.min(winW / VIEW_W, winH / VIEW_H);
  return fit >= 1 ? Math.floor(fit) : Math.max(0.25, fit);
}

function chipIcon(chip: { type: string; crop?: string; build?: string }, icons: Record<string, string>): string | undefined {
  if (chip.type === 'plant') return chip.crop ? icons[chip.crop] : icons.turnip;
  if (chip.type === 'build') return chip.build ? icons[chip.build] : icons.fence;
  return icons[chip.type];
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snap = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot);
  const [scale, setScale] = useState(() => computeScale(window.innerWidth, window.innerHeight));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const prevSavedAt = useRef(snap.lastSaveAt);
  const [coinPulse, setCoinPulse] = useState(false);
  const prevCoins = useRef(snap.coins);

  useEffect(() => {
    if (canvasRef.current) bridge.init(canvasRef.current);
  }, []);

  useEffect(() => {
    const onResize = () => setScale(computeScale(window.innerWidth, window.innerHeight));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // brief golden pulse whenever the coin pouch grows
  useEffect(() => {
    if (snap.coins > prevCoins.current) {
      setCoinPulse(true);
      const t = setTimeout(() => setCoinPulse(false), 500);
      prevCoins.current = snap.coins;
      return () => clearTimeout(t);
    }
    prevCoins.current = snap.coins;
    return undefined;
  }, [snap.coins]);

  // "saved" whisper next to the gear whenever autosave lands
  useEffect(() => {
    if (snap.lastSaveAt && snap.lastSaveAt !== prevSavedAt.current) {
      prevSavedAt.current = snap.lastSaveAt;
      setSavedFlash(true);
      const t = setTimeout(() => setSavedFlash(false), 1600);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [snap.lastSaveAt]);

  const stageW = Math.round(VIEW_W * scale);
  const stageH = Math.round(VIEW_H * scale);

  return (
    <div className="game-root">
      <div className="stage" style={{ width: stageW, height: stageH }}>
        <canvas
          ref={canvasRef}
          className="game-canvas"
          width={VIEW_W}
          height={VIEW_H}
          aria-label="Lofi Garden farm view"
        />

        {snap.started && (
          <>
            <header className="top-bar">
              <div className="brand-chip">Lofi Garden</div>
              <div className={coinPulse ? 'coin-badge pulse' : 'coin-badge'} title="Coins">
                {snap.coinIcon && <img src={snap.coinIcon} alt="" draggable={false} />}
                <span>{snap.coins}c</span>
              </div>
              {savedFlash && <span className="save-dot">saved</span>}
              <button
                type="button"
                className="gear-button"
                title="Settings"
                aria-label="Settings"
                onClick={() => setSettingsOpen(true)}
              >
                ⚙
              </button>
            </header>

            {(snap.queue.length > 0 || snap.farmerWorking) && (
              <div className="chips-row" aria-label="Queued tasks">
                <span className="chips-cap">
                  {snap.queue.length}/{snap.queueCap}
                </span>
                {snap.queue.slice(0, 6).map((chip) => (
                  <span key={chip.id} className="task-chip" title={chip.type}>
                    {chipIcon(chip, snap.icons) && (
                      <img src={chipIcon(chip, snap.icons)} alt="" draggable={false} />
                    )}
                    {chip.type}
                    {chip.crop ? ` ${chip.crop}` : ''}
                    {chip.build ? ` ${chip.build}` : ''}
                    <button
                      type="button"
                      className="chip-cancel"
                      aria-label="Cancel task"
                      onClick={() => bridge.cancelTask(chip.id)}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {snap.queue.length > 6 && <span className="chips-more">+{snap.queue.length - 6} more</span>}
                {snap.farmerWorking && <span className="tending-note">the farmer is on it…</span>}
              </div>
            )}

            {snap.seedsOpen && (
              <SeedsPopover selectedSeed={snap.selectedSeed} coins={snap.coins} icons={snap.icons} />
            )}

            {snap.buildOpen && (
              <BuildPopover selectedBuild={snap.selectedBuild} coins={snap.coins} icons={snap.icons} />
            )}

            {snap.orderCardOpen && <OrderCard order={snap.order} icons={snap.icons} />}

            {snap.barnConfirm && <BarnConfirm />}

            {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}

            <Hotbar tool={snap.tool} selectedSeed={snap.selectedSeed} selectedBuild={snap.selectedBuild} icons={snap.icons} />

            <PlayerWidget
              audioOn={snap.audioOn}
              musicVolume={snap.musicVolume}
              rainOn={snap.rainOn}
              rainVolume={snap.rainVolume}
              raining={snap.raining}
            />

            {snap.pinned && (
              <aside className="pin-card" role="status">
                <button type="button" className="pin-close" aria-label="Dismiss" onClick={() => bridge.closePin()}>
                  ×
                </button>
                <h2 className="pin-title">{snap.pinned.title}</h2>
                {snap.pinned.lines.map((line) => (
                  <p key={line} className="pin-line">
                    {line}
                  </p>
                ))}
              </aside>
            )}

            {snap.toastText && (
              <div className="toast" role="status">
                {snap.toastText}
              </div>
            )}
          </>
        )}

        {!snap.started && <StartOverlay />}
      </div>
    </div>
  );
}
