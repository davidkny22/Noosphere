import { useSpaceLoader } from './hooks/useSpaceLoader';
import { SpaceCanvas } from './components/SpaceCanvas';
import { LoadingScreen } from './components/LoadingScreen';
import { InfoPanel } from './components/InfoPanel';
import { SearchBar } from './components/SearchBar';
import { SpaceSelector } from './components/SpaceSelector';
import { BiasProbePanel } from './components/BiasProbePanel';
import { useSpaceStore } from './store/useSpaceStore';

function App() {
  const spaceUrl = useSpaceStore((s) => s.spaceUrl);
  useSpaceLoader(spaceUrl);

  return (
    <>
      <LoadingScreen />
      <SpaceCanvas />
      <SpaceSelector />
      <SearchBar />
      <InfoPanel />
      <BiasProbePanel />
    </>
  );
}

export default App;
