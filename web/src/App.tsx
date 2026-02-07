import { useSpaceLoader } from './hooks/useSpaceLoader';
import { SpaceCanvas } from './components/SpaceCanvas';
import { LoadingScreen } from './components/LoadingScreen';
import { InfoPanel } from './components/InfoPanel';
import { SearchBar } from './components/SearchBar';

const SPACE_URL = '/spaces/minilm-10k.json.gz';

function App() {
  useSpaceLoader(SPACE_URL);

  return (
    <>
      <LoadingScreen />
      <SpaceCanvas />
      <SearchBar />
      <InfoPanel />
    </>
  );
}

export default App;
