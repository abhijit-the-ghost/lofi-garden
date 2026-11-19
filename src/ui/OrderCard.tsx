import type { Order } from '../game/crops';
import { bridge } from '../state/bridge';
import type { CropId } from '../game/crops';

const CROP_NAME: Record<CropId, string> = {
  turnip: 'Turnips',
  carrot: 'Carrots',
  pumpkin: 'Pumpkins',
};

export function OrderCard({ order, icons }: { order: Order | null; icons: Record<string, string> }) {
  const pct = order ? Math.round((order.have / order.needed) * 100) : 0;
  return (
    <aside className="order-card" role="status" aria-label="Notice board order">
      <button type="button" className="order-close" aria-label="Dismiss" onClick={() => bridge.closeOrderCard()}>
        ×
      </button>
      <p className="order-kicker">The mayor requests</p>
      {order ? (
        <>
          <h2 className="order-title">A Bundle for the Table</h2>
          <div className="order-line">
            {icons[order.crop] && <img src={icons[order.crop]} alt={`${order.crop} seedling`} draggable={false} />}
            <p className="order-need">
              {order.needed} × {CROP_NAME[order.crop]}
              <br />
              <small>{order.have} of {order.needed} gathered</small>
            </p>
          </div>
          <div className="order-bar" aria-hidden="true">
            <div className="order-bar-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="order-reward">
            <span>Delivery bonus</span>
            <b>{order.reward}c</b>
          </div>
          <p className="order-flavor">No rush — the board keeps it warm. The bonus lands with the last harvest.</p>
        </>
      ) : (
        <>
          <h2 className="order-title">All Is Well</h2>
          <p className="order-flavor">The mayor is content. The turnips thrive another day.</p>
        </>
      )}
    </aside>
  );
}
