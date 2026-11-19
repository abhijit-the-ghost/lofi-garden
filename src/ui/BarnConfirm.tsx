import { bridge } from '../state/bridge';

/** "Tear down the barn?" — the 400c is never refunded, so we ask first. */
export function BarnConfirm() {
  return (
    <div className="confirm-overlay" role="alertdialog" aria-modal="true" aria-label="Tear down the barn?">
      <div className="confirm-card">
        <h2 className="confirm-title">Tear down the barn?</h2>
        <p className="confirm-body">
          The farmer will haul the beams away. You won&rsquo;t get the 400c back, and the +16 queue slots go with it.
        </p>
        <div className="confirm-actions">
          <button type="button" className="confirm-keep" onClick={() => bridge.cancelBarnTeardown()} autoFocus>
            Keep the barn
          </button>
          <button type="button" className="confirm-teardown" onClick={() => bridge.confirmBarnTeardown()}>
            Tear it down
          </button>
        </div>
      </div>
    </div>
  );
}
