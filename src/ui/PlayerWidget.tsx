import { useEffect, useState } from 'react';
import { bridge } from '../state/bridge';

const TRACKS = ['Rainy Porch', 'Soil & Static', 'Golden Hour', 'Porch Swing', 'Turnip Nocturne'];

function Droplet({ active }: { active: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 12 13" aria-hidden="true">
      <path
        d="M6 1 C3.5 4.6 2 6.9 2 9 a4 4 0 0 0 8 0 C10 6.9 8.5 4.6 6 1 Z"
        fill={active ? '#a9cdea' : 'none'}
        stroke={active ? '#dcebf9' : '#8a8578'}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {active && <path d="M4.4 8.6 a1.8 1.8 0 0 0 3.1 1.3" stroke="#35506e" strokeWidth="1.1" fill="none" strokeLinecap="round" />}
    </svg>
  );
}

export function PlayerWidget({
  audioOn,
  musicVolume,
  rainOn,
  rainVolume,
  raining,
}: {
  audioOn: boolean;
  musicVolume: number;
  rainOn: boolean;
  rainVolume: number;
  raining: boolean;
}) {
  const [trackIndex, setTrackIndex] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTrackIndex((i) => (i + 1) % TRACKS.length), 45_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="player" role="region" aria-label="Lofi player">
      <div className={audioOn ? 'vinyl spinning' : 'vinyl'} aria-hidden="true" />
      <div className="track-meta">
        <span key={trackIndex} className="track-title">
          {TRACKS[trackIndex]}
        </span>
        <span className="track-sub">generative · always fresh</span>
      </div>
      <button
        type="button"
        className="player-toggle"
        onClick={() => bridge.toggleAudio()}
        aria-label={audioOn ? 'Pause the lofi' : 'Play the lofi'}
        title={audioOn ? 'Pause the lofi' : 'Play the lofi'}
      >
        {audioOn ? '❙❙' : '▶'}
      </button>
      <input
        type="range"
        className="player-volume"
        min={0}
        max={100}
        step={1}
        value={musicVolume}
        onChange={(e) => bridge.setMusicVolume(Number(e.target.value))}
        aria-label="Music volume"
        title="Music volume"
      />
      <button
        type="button"
        className={raining && rainOn ? 'player-toggle rain-live' : 'player-toggle rain-toggle'}
        onClick={() => bridge.toggleRain()}
        aria-pressed={rainOn}
        aria-label={rainOn ? 'Mute the rain' : 'Unmute the rain'}
        title={rainOn ? (raining ? 'Rain is falling — click to mute' : 'Rain ambience (toggle)') : 'Rain ambience is muted'}
      >
        <Droplet active={rainOn} />
      </button>
      <input
        type="range"
        className="player-volume player-rain"
        min={0}
        max={100}
        step={1}
        value={rainVolume}
        onChange={(e) => bridge.setRainVolume(Number(e.target.value))}
        aria-label="Rain volume"
        title="Rain volume"
      />
    </div>
  );
}
