import { BUILD_COSTS, type BuildableId } from '../game/constants';
import { bridge } from '../state/bridge';

const CARDS: { id: BuildableId; name: string; icon: string; blurb: string }[] = [
  { id: 'path', name: 'Path', icon: 'path', blurb: 'Packed earth · strolls ~35% faster' },
  { id: 'fence', name: 'Fence', icon: 'fence', blurb: 'Wood rails · blocks the farmer' },
  { id: 'sprinkler', name: 'Sprinkler', icon: 'sprinkler', blurb: '120c · 3×3 soak every 30s' },
  { id: 'lantern', name: 'Lantern', icon: 'lantern', blurb: '35c · warm pool after dusk' },
  { id: 'planter', name: 'Planter', icon: 'planter', blurb: '25c · marigolds in a box' },
  { id: 'bench', name: 'Bench', icon: 'bench', blurb: '15c · watch turnips happen' },
  { id: 'barn', name: 'Barn', icon: 'barn', blurb: '4×3 centerpiece · +16 queue slots' },
];

export function BuildPopover({
  selectedBuild,
  coins,
  icons,
}: {
  selectedBuild: BuildableId;
  coins: number;
  icons: Record<string, string>;
}) {
  return (
    <div className="seeds-popover build-popover" role="dialog" aria-label="Choose a structure">
      <p className="seeds-title">Build with… <span>Esc to close</span></p>
      <div className="seeds-row">
        {CARDS.map((card) => {
          const cost = BUILD_COSTS[card.id];
          const affordable = coins >= cost;
          const picked = selectedBuild === card.id;
          return (
            <button
              key={card.id}
              type="button"
              className={['seed-card build-card', picked ? 'picked' : '', affordable ? '' : 'poor'].join(' ')}
              disabled={!affordable}
              title={
                affordable
                  ? `${card.name} — ${cost}c`
                  : `${card.name} — need ${cost}c (you have ${coins}c)`
              }
              onClick={() => bridge.selectBuild(card.id)}
            >
              {icons[card.icon] && <img src={icons[card.icon]} alt="" draggable={false} />}
              <span className="seed-name">{card.name}</span>
              <span className="seed-cost">{cost}c</span>
              <span className="seed-meta">{card.blurb}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
