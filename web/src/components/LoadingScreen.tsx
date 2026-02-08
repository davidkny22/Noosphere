import { useSpaceStore, AVAILABLE_SPACES } from '../store/useSpaceStore';

export function LoadingScreen() {
  const loading = useSpaceStore((s) => s.loading);
  const error = useSpaceStore((s) => s.error);
  const spaceUrl = useSpaceStore((s) => s.spaceUrl);

  if (!loading && !error) return null;

  const spaceName = AVAILABLE_SPACES.find((s) => s.url === spaceUrl)?.label ?? 'space';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0a]">
      <div className="text-center">
        {loading && !error && (
          <>
            <div className="mb-4 text-2xl font-light tracking-widest text-white/80">
              NOOSPHERE
            </div>
            <div className="text-sm text-white/40">Loading {spaceName}...</div>
            <div className="mt-6 h-0.5 w-32 mx-auto overflow-hidden rounded bg-white/10">
              <div className="h-full w-1/3 animate-pulse rounded bg-white/30" />
            </div>
          </>
        )}
        {error && (
          <>
            <div className="mb-4 text-2xl font-light tracking-widest text-red-400/80">
              ERROR
            </div>
            <div className="max-w-md text-sm text-white/60">{error}</div>
          </>
        )}
      </div>
    </div>
  );
}
