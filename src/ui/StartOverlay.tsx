import { useSyncExternalStore } from 'react';
import { bridge } from '../state/bridge';

export function StartOverlay() {
  const snap = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot);
  const paused = snap.hasSave;

  return (
    <div className="start-overlay">
      <div className="start-sun" aria-hidden="true" />
      <div className="start-hills start-hills-back" aria-hidden="true" />
      <div className="start-hills start-hills-front" aria-hidden="true" />
      <div className="start-card">
        <p className="start-kicker">a cozy farming pocket</p>
        <h1 className="start-title">Lofi Garden</h1>
        <p className="start-blurb">
          Queue the work. The little farmer tends it.
          <br />
          Rain on the roof, coins in the pouch.
        </p>
        {snap.loadFailed && (
          <p className="start-warning">We couldn&rsquo;t read your old save — it was set aside. A fresh sprout begins.</p>
        )}
        <button type="button" className="start-button" onClick={() => bridge.start()} autoFocus>
          {paused ? 'Continue tending your farm' : 'Click to tend your farm'}
        </button>
        <p className="start-foot">v1.0.0 · progress saved on this device</p>
      </div>
    </div>
  );
}
