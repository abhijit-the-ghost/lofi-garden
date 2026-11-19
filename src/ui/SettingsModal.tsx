import { useEffect, useState, useSyncExternalStore } from 'react';
import { bridge } from '../state/bridge';

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const snap = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    // capture phase so the game's own Esc-to-inspect doesn't also fire
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="settings-card">
        <h2 className="settings-title">Settings</h2>
        <p className="settings-note">Your farm tucks itself away on this device every 5 seconds.</p>

        <div className="settings-rows">
          <div className="settings-row">
            <span>Lifetime harvest</span>
            <b>{snap.stats.harvested} {snap.stats.harvested === 1 ? 'crop' : 'crops'}</b>
          </div>
          <div className="settings-row">
            <span>Coins earned</span>
            <b>{snap.stats.earned}c</b>
          </div>
          <div className="settings-row">
            <span>Bundle orders completed</span>
            <b>{snap.ordersCompleted}</b>
          </div>
          <div className="settings-row">
            <span>Last saved</span>
            <b>{snap.lastSaveAt ? formatClock(snap.lastSaveAt) : 'not yet'}</b>
          </div>
        </div>

        <div className="settings-divider" />

        <div className="settings-row settings-toggle-row">
          <span>Always golden hour</span>
          <button
            type="button"
            role="switch"
            aria-checked={snap.goldenHour}
            aria-label="Always golden hour"
            className={snap.goldenHour ? 'switch on' : 'switch'}
            onClick={() => bridge.setGoldenHour(!snap.goldenHour)}
          >
            <span className="switch-knob" />
          </button>
        </div>

        <label className="settings-row settings-slider-row">
          <span>Music volume</span>
          <input
            type="range"
            className="settings-slider"
            min={0}
            max={100}
            step={1}
            value={snap.musicVolume}
            onChange={(e) => bridge.setMusicVolume(Number(e.target.value))}
            aria-label="Music volume"
          />
        </label>
        <label className="settings-row settings-slider-row">
          <span>Sound effects</span>
          <input
            type="range"
            className="settings-slider"
            min={0}
            max={100}
            step={1}
            value={snap.sfxVolume}
            onChange={(e) => bridge.setSfxVolume(Number(e.target.value))}
            aria-label="Sound effects volume"
          />
        </label>

        <div className="settings-divider" />

        {!confirming ? (
          <button type="button" className="settings-danger" onClick={() => setConfirming(true)}>
            New Game / Reset Save
          </button>
        ) : (
          <div className="settings-confirm">
            <p>Everything — coins, deeds, crops, the barn — gone for good.</p>
            <div className="settings-confirm-actions">
              <button type="button" className="confirm-keep" onClick={() => setConfirming(false)} autoFocus>
                Keep my farm
              </button>
              <button type="button" className="confirm-teardown" onClick={() => bridge.resetSave()}>
                Wipe it
              </button>
            </div>
          </div>
        )}

        <button type="button" className="settings-close" onClick={onClose}>
          Back to the farm
        </button>
        <p className="settings-credit">v1.0.0 — a cozy farming pocket</p>
      </div>
    </div>
  );
}
