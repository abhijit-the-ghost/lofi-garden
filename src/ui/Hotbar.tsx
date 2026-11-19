import type { ToolId } from '../game/world';
import { bridge } from '../state/bridge';
import type { BuildableId } from '../game/constants';
import type { CropId } from '../game/crops';

interface SlotDef {
  id: ToolId;
  hotkey: string;
  label: string;
  icon: string;
  enabled: boolean;
}

export function Hotbar({
  tool,
  selectedSeed,
  selectedBuild,
  icons,
}: {
  tool: ToolId;
  selectedSeed: CropId;
  selectedBuild: BuildableId;
  icons: Record<string, string>;
}) {
  const slots: SlotDef[] = [
    { id: 'inspect', hotkey: '1', label: 'Inspect', icon: 'inspect', enabled: true },
    { id: 'till', hotkey: '2', label: 'Till', icon: 'till', enabled: true },
    { id: 'water', hotkey: '3', label: 'Water', icon: 'water', enabled: true },
    { id: 'harvest', hotkey: '4', label: 'Harvest', icon: 'harvest', enabled: true },
    { id: 'seeds', hotkey: '5', label: 'Seeds', icon: selectedSeed, enabled: true },
    { id: 'build', hotkey: '6', label: 'Build', icon: selectedBuild, enabled: true },
    { id: 'clear', hotkey: '7', label: 'Clear', icon: 'clear', enabled: true },
  ];

  return (
    <nav className="hotbar" aria-label="Toolbox">
      {slots.map((slot) => {
        const selected = tool === slot.id;
        return (
          <button
            key={slot.id}
            type="button"
            className={['hotbar-slot', selected ? 'selected' : ''].join(' ')}
            aria-pressed={selected}
            aria-label={slot.label}
            title={
              slot.id === 'seeds'
                ? 'Seeds — 5 · click again to change variety'
                : slot.id === 'build'
                  ? 'Build — 6 · click again to change structure'
                  : `${slot.label} — ${slot.hotkey}`
            }
            onClick={() => {
              if (slot.id === 'seeds') bridge.toggleSeeds();
              else if (slot.id === 'build') bridge.toggleBuild();
              else bridge.selectTool(slot.id);
            }}
          >
            <span className="hotbar-key">{slot.hotkey}</span>
            {icons[slot.icon] ? <img src={icons[slot.icon]} alt="" draggable={false} /> : null}
            <span className="hotbar-label">{slot.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
