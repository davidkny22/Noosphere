import { useSpaceStore } from '../store/useSpaceStore';

export function LoadingScreen() {
  const loading = useSpaceStore((s) => s.loading);
  const error = useSpaceStore((s) => s.error);

  if (!loading && !error) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0a]">
      <div className="text-center">
        {loading && !error && (
          <>
            <div className="mb-4 text-2xl font-light tracking-widest text-white/80">
              NOOSPHERE
            </div>
            <div className="text-sm text-white/40">Loading space...</div>
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
