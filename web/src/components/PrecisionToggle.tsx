import { useSpaceStore } from '../store/useSpaceStore';

export function PrecisionToggle() {
  const precisionMode = useSpaceStore((s) => s.precisionMode);
  const setPrecisionMode = useSpaceStore((s) => s.setPrecisionMode);
  const serviceMode = useSpaceStore((s) => s.serviceMode);
  const isAdvancedMode = useSpaceStore((s) => s.isAdvancedMode);

  if (serviceMode !== 'remote' || !isAdvancedMode) return null;

  return (
    <button
      onClick={() => setPrecisionMode(precisionMode === '3d' ? 'hd' : '3d')}
      className="fixed bottom-4 right-20 z-40 rounded-full bg-black/60 px-3 py-1.5 text-xs font-mono text-white/70 backdrop-blur-sm hover:bg-black/80 hover:text-white border border-white/10"
      title={precisionMode === 'hd' ? 'Using HD cosine similarity' : 'Using 3D distance'}
    >
      {precisionMode === 'hd' ? 'HD' : '3D'}
    </button>
  );
}
