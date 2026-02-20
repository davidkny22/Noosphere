import { useSpaceStore } from '../store/useSpaceStore';

export function SpaceSelector() {
  const availableSpaces = useSpaceStore((s) => s.availableSpaces);
  const spaceUrl = useSpaceStore((s) => s.spaceUrl);
  const setSpaceUrl = useSpaceStore((s) => s.setSpaceUrl);
  const loading = useSpaceStore((s) => s.loading);

  if (availableSpaces.length < 2) return null;

  return (
    <div className="fixed left-4 top-4 z-40">
      <select
        value={spaceUrl}
        onChange={(e) => setSpaceUrl(e.target.value)}
        disabled={loading}
        className="rounded-md bg-black/70 px-3 py-1.5 text-sm text-white backdrop-blur-sm outline-none ring-1 ring-white/10 focus:ring-white/30 disabled:opacity-40"
      >
        {availableSpaces.map((s) => (
          <option key={s.id} value={s.url}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}
