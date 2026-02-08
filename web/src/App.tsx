import { useSpaceLoader } from './hooks/useSpaceLoader';
import { SpaceCanvas } from './components/SpaceCanvas';
import { LoadingScreen } from './components/LoadingScreen';
import { InfoPanel } from './components/InfoPanel';
import { SearchBar } from './components/SearchBar';
import { SpaceSelector } from './components/SpaceSelector';
import { BiasProbePanel } from './components/BiasProbePanel';
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
      <ModeToggle />
    </>
  );
}

export default App;
