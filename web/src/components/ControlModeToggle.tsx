import { useSpaceStore } from '../store/useSpaceStore';

export function ControlModeToggle() {
  const controlMode = useSpaceStore((s) => s.controlMode);
  const setControlMode = useSpaceStore((s) => s.setControlMode);
  const isAdvancedMode = useSpaceStore((s) => s.isAdvancedMode);

  if (!isAdvancedMode) return null;

  return (
    <button
      onClick={() => setControlMode(controlMode === 'orbit' ? 'fly' : 'orbit')}
      className="fixed bottom-4 right-36 z-40 rounded-full bg-black/60 px-3 py-1.5 text-xs font-mono text-white/70 backdrop-blur-sm hover:bg-black/80 hover:text-white border border-white/10"
      title={controlMode === 'orbit' ? 'Switch to fly controls (WASD)' : 'Switch to orbit controls'}
    >
      {controlMode === 'orbit' ? 'ORBIT' : 'FLY'}
    </button>
  );
}
