import { useSpaceStore } from '../store/useSpaceStore';

export function ModeToggle() {
  const isAdvancedMode = useSpaceStore((s) => s.isAdvancedMode);
  const toggleAdvancedMode = useSpaceStore((s) => s.toggleAdvancedMode);

  return (
    <button
      onClick={toggleAdvancedMode}
      className="fixed bottom-4 right-4 z-40 rounded-lg bg-black/60 px-3 py-1.5 text-xs text-white/50 backdrop-blur-sm ring-1 ring-white/10 hover:bg-black/80 hover:text-white/70"
    >
      {isAdvancedMode ? 'Advanced' : 'Beginner'}
    </button>
  );
}
