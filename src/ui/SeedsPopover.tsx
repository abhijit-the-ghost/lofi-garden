import { CROP_LIST } from '../game/crops';
import { bridge } from '../state/bridge';
import type { CropId } from '../game/crops';

export function SeedsPopover({
  selectedSeed,
  coins,
  icons,
}: {
  selectedSeed: CropId;
  coins: number;
  icons: Record<string, string>;
}) {
  return (
    <div className="seeds-popover" role="dialog" aria-label="Choose seeds">
      <p className="seeds-title">Sow with… <span>Esc to close</span></p>
      <div className="seeds-row">
        {CROP_LIST.map((crop) => {
          const affordable = coins >= crop.seedCost;
          const picked = selectedSeed === crop.id;
          return (
            <button
              key={crop.id}
              type="button"
              className={['seed-card', picked ? 'picked' : '', affordable ? '' : 'poor'].join(' ')}
              disabled={!affordable}
              title={
                affordable
                  ? `${crop.name} — ${crop.seedCost}c, ripes in ~${crop.growTime}s`
                  : `${crop.name} — need ${crop.seedCost}c (you have ${coins}c)`
              }
              onClick={() => bridge.selectSeed(crop.id)}
            >
              {icons[crop.id] && <img src={icons[crop.id]} alt="" draggable={false} />}
              <span className="seed-name">{crop.name}</span>
              <span className="seed-cost">{crop.seedCost}c</span>
              <span className="seed-meta">~{crop.growTime}s · sells {crop.sellPrice}c</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
