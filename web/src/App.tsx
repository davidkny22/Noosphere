import { useSpaceLoader } from './hooks/useSpaceLoader';
import { SpaceCanvas } from './components/SpaceCanvas';
import { LoadingScreen } from './components/LoadingScreen';
import { InfoPanel } from './components/InfoPanel';
import { SearchBar } from './components/SearchBar';
import { SpaceSelector } from './components/SpaceSelector';
import { BiasProbePanel } from './components/BiasProbePanel';
import { ComparisonPanel } from './components/ComparisonPanel';
import { AnalogyPanel } from './components/AnalogyPanel';
import { ControlModeToggle } from './components/ControlModeToggle';
import { SpaceScaleToggle } from './components/SpaceScaleToggle';
import { ModeToggle } from './components/ModeToggle';
import { DistanceLegend } from './components/DistanceLegend';
import { ShareButton } from './components/ShareButton';
import { RectangleSelector } from './components/RectangleSelector';
import { useSpaceStore } from './store/useSpaceStore';

function App() {
  const spaceUrl = useSpaceStore((s) => s.spaceUrl);
  const isAdvancedMode = useSpaceStore((s) => s.isAdvancedMode);
  useSpaceLoader(spaceUrl);

  return (
    <>
      <LoadingScreen />
      <SpaceCanvas />
      <SpaceSelector />
      <SearchBar />
      <InfoPanel />
      {isAdvancedMode && (
        <div className="fixed left-4 top-20 bottom-4 z-40 flex flex-col gap-3 overflow-y-auto">
          <BiasProbePanel />
          <ComparisonPanel />
          <AnalogyPanel />
        </div>
      )}
      <ShareButton />
      <SpaceScaleToggle />
      <ControlModeToggle />
      <ModeToggle />
      <DistanceLegend />
      <RectangleSelector />
    </>
  );
}

export default App;
