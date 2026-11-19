import { buildAssets, type AssetManifest } from '../game/assets';
import { Engine } from '../game/engine';
import { Input } from '../game/input';
import { Renderer } from '../game/renderer';
import { World, type PinnedInfo, type ToolId } from '../game/world';
import { audio, readAudioPrefs, writeAudioPrefs } from '../audio/engine';
import { sfx } from '../audio/sfx';
import type { CropId } from '../game/crops';
import type { BuildableId } from '../game/constants';
import type { TaskType } from '../game/tasks';
import { applySavedGame, clearSave, saveGame } from '../game/save';
import type { Order } from '../game/crops';

export interface QueueChip {
  id: number;
  type: TaskType;
  x: number;
  y: number;
  crop?: CropId;
  build?: BuildableId;
}

export interface UiSnapshot {
  ready: boolean;
  started: boolean;
  coins: number;
  tool: ToolId;
  selectedSeed: CropId;
  seedsOpen: boolean;
  selectedBuild: BuildableId;
  buildOpen: boolean;
  barnConfirm: { x: number; y: number } | null;
  audioOn: boolean;
  musicVolume: number; // 0..100
  sfxVolume: number; // 0..100
  rainVolume: number; // 0..100
  rainOn: boolean;
  raining: boolean;
  goldenHour: boolean;
  order: Order | null;
  ordersCompleted: number;
  orderFresh: boolean;
  orderCardOpen: boolean;
  lastSaveAt: number | null;
  hasSave: boolean;
  loadFailed: boolean;
  stats: { harvested: number; earned: number };
  queue: QueueChip[];
  queueCap: number;
  farmerWorking: boolean;
  pinned: PinnedInfo | null;
  toastText: string | null;
  icons: Record<string, string>;
  coinIcon: string | null;
}

const EMPTY_SNAP: UiSnapshot = {
  ready: false,
  started: false,
  coins: 0,
  tool: 'till',
  selectedSeed: 'turnip',
  seedsOpen: false,
  selectedBuild: 'path',
  buildOpen: false,
  barnConfirm: null,
  audioOn: true,
  musicVolume: 55,
  sfxVolume: 70,
  rainVolume: 55,
  rainOn: true,
  raining: false,
  goldenHour: false,
  order: null,
  ordersCompleted: 0,
  orderFresh: false,
  orderCardOpen: false,
  lastSaveAt: null,
  hasSave: false,
  loadFailed: false,
  stats: { harvested: 0, earned: 0 },
  queue: [],
  queueCap: 32,
  farmerWorking: false,
  pinned: null,
  toastText: null,
  icons: {},
  coinIcon: null,
};

/**
 * Singleton bridge between the mutable game world and React.
 * React reads an immutable snapshot via useSyncExternalStore; the world
 * bumps the snapshot on any UI-visible change. A 750 ms heartbeat keeps
 * the pinned inspect card honest while crops grow underneath it.
 */
class GameBridge {
  private world: World | null = null;
  private assets: AssetManifest | null = null;
  private engine: Engine | null = null;
  private started = false;
  private wiping = false;
  private hasSave = false;
  private loadFailed = false;
  private lastSaveAt: number | null = null;
  private snap: UiSnapshot = EMPTY_SNAP;
  private listeners = new Set<() => void>();

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = (): UiSnapshot => this.snap;

  /** Idempotent: safe to call from a double-invoked effect. */
  init(canvas: HTMLCanvasElement): void {
    if (this.world) return;
    const assets = buildAssets();
    this.assets = assets;
    this.world = new World({ onUiDirty: () => this.bump() });
    this.world.goldenHour = readAudioPrefs().goldenHour === true;
    const loadResult = applySavedGame(this.world);
    this.hasSave = loadResult === 'loaded';
    this.loadFailed = loadResult === 'failed';
    if (import.meta.env.DEV) {
      // Dev-only debug handles for Playwright probes & console poking.
      const w = window as unknown as { __lofi?: World; __audio?: typeof audio };
      w.__lofi = this.world;
      w.__audio = audio;
    }
    const renderer = new Renderer(canvas, assets);
    new Input(canvas, this.world);
    this.engine = new Engine(this.world, renderer);
    this.engine.start();
    setInterval(() => {
      if (this.world?.pinnedTile) this.bump();
    }, 750);
    setInterval(() => {
      if (this.started && this.world) this.saveNow();
    }, 5000);
    document.addEventListener('visibilitychange', () => {
      if (this.started && document.visibilityState === 'hidden') this.saveNow();
    });
    window.addEventListener('beforeunload', () => {
      if (this.started && !this.wiping && this.world) saveGame(this.world);
    });
    this.bump();
  }

  /** Persist right now. Used by the 5 s ticker, tab hides and the start click. */
  saveNow(): void {
    if (!this.world || this.wiping) return;
    if (saveGame(this.world)) {
      this.lastSaveAt = Date.now();
      this.bump();
    }
  }

  /** Wipe the save and reload into a fresh farm. */
  resetSave(): void {
    this.wiping = true; // beforeunload/autosave must not resurrect the wiped farm
    clearSave();
    window.location.reload();
  }

  start(): void {
    this.started = true;
    if (audio.isOn()) audio.start(); // the click itself is the gesture that unlocks audio
    sfx.ui();
    if (this.loadFailed) {
      this.world?.toast("Couldn't read your old save — it was set aside. Fresh sprout!", 4.5);
    } else {
      this.world?.toast('Drag on the meadow to queue tilling', 4);
    }
    this.saveNow();
    this.bump();
  }

  toggleAudio(): void {
    audio.toggle();
    sfx.ui();
    this.bump();
  }

  setMusicVolume(percent: number): void {
    audio.setVolume(Math.min(1, Math.max(0, percent / 100)));
    this.bump();
  }

  setSfxVolume(percent: number): void {
    audio.setSfxVolume(Math.min(1, Math.max(0, percent / 100)));
    this.bump();
  }

  toggleRain(): void {
    audio.setRainOn(!audio.getRainOn());
    sfx.ui();
    this.bump();
  }

  setRainVolume(percent: number): void {
    audio.setRainVolume(Math.min(1, Math.max(0, percent / 100)));
    this.bump();
  }

  closeOrderCard(): void {
    this.world?.closeOrderCard();
  }

  setGoldenHour(on: boolean): void {
    if (this.world) this.world.goldenHour = on;
    writeAudioPrefs({ goldenHour: on });
    sfx.ui();
    this.bump();
  }

  selectTool(tool: ToolId): void {
    sfx.ui();
    this.world?.setTool(tool);
  }

  toggleSeeds(): void {
    sfx.ui();
    this.world?.toggleSeeds();
  }

  toggleBuild(): void {
    sfx.ui();
    this.world?.toggleBuild();
  }

  selectSeed(crop: CropId): void {
    sfx.ui();
    this.world?.selectSeed(crop);
  }

  selectBuild(build: BuildableId): void {
    sfx.ui();
    this.world?.selectBuild(build);
  }

  confirmBarnTeardown(): void {
    const pending = this.world?.barnConfirm;
    if (this.world && pending) this.world.demolishBarnAt(pending.x, pending.y);
  }

  cancelBarnTeardown(): void {
    this.world?.cancelBarnConfirm();
  }

  unavailable(message: string): void {
    sfx.ui();
    this.world?.toast(message);
  }

  cancelTask(id: number): void {
    sfx.ui();
    this.world?.cancelTask(id);
  }

  closePin(): void {
    sfx.ui();
    this.world?.clearPin();
  }

  private collect(): UiSnapshot {
    const w = this.world;
    const icons = this.assets?.icons ?? {};
    if (!w) return { ...EMPTY_SNAP, icons };
    return {
      ready: true,
      started: this.started,
      coins: w.coins,
      tool: w.tool,
      selectedSeed: w.selectedSeed,
      seedsOpen: w.seedsOpen,
      queue: w.queue.list().map((t) => ({ id: t.id, type: t.type, x: t.x, y: t.y, crop: t.crop, build: t.build })),
      queueCap: w.currentQueueCap(),
      selectedBuild: w.selectedBuild,
      buildOpen: w.buildOpen,
      barnConfirm: w.barnConfirm,
      audioOn: audio.isOn(),
      musicVolume: Math.round(audio.getVolume() * 100),
      sfxVolume: Math.round(audio.getSfxVolume() * 100),
      rainVolume: Math.round(audio.getRainVolume() * 100),
      rainOn: audio.getRainOn(),
      raining: w.isRaining(),
      goldenHour: w.goldenHour,
      order: w.orders.active ? { ...w.orders.active } : null,
      ordersCompleted: w.orders.completed,
      orderFresh: w.orderFresh,
      orderCardOpen: w.orderCardOpen,
      lastSaveAt: this.lastSaveAt,
      hasSave: this.hasSave,
      loadFailed: this.loadFailed,
      stats: { ...w.stats },
      farmerWorking: w.farmer.state !== 'idle',
      pinned: w.pinnedTile ? w.describeTile(w.pinnedTile.x, w.pinnedTile.y) : null,
      toastText: w.toastText,
      icons,
      coinIcon: this.assets?.coinIcon ?? null,
    };
  }

  private bump(): void {
    this.snap = this.collect();
    for (const fn of this.listeners) fn();
  }
}

export const bridge = new GameBridge();
