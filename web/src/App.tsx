import { useSpaceLoader } from './hooks/useSpaceLoader';
import { SpaceCanvas } from './components/SpaceCanvas';
import { LoadingScreen } from './components/LoadingScreen';
import { InfoPanel } from './components/InfoPanel';
import { SearchBar } from './components/SearchBar';
import { SpaceSelector } from './components/SpaceSelector';
import { BiasProbePanel } from './components/BiasProbePanel';
import { ComparisonPanel } from './components/ComparisonPanel';
import { AnalogyPanel } from './components/AnalogyPanel';
import { PrecisionToggle } from './components/PrecisionToggle';
import { ControlModeToggle } from './components/ControlModeToggle';
import { ModeToggle } from './components/ModeToggle';
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
      {isAdvancedMode && <BiasProbePanel />}
      {isAdvancedMode && <ComparisonPanel />}
      {isAdvancedMode && <AnalogyPanel />}
      <PrecisionToggle />
      <ControlModeToggle />
      <ModeToggle />
    </>
  );
}

export default App;
