import { useSpaceLoader } from './hooks/useSpaceLoader';
import { SpaceCanvas } from './components/SpaceCanvas';
import { LoadingScreen } from './components/LoadingScreen';

const SPACE_URL = '/spaces/minilm-10k.json.gz';

function App() {
  useSpaceLoader(SPACE_URL);

  return (
    <>
      <LoadingScreen />
      <SpaceCanvas />
    </>
  );
}

export default App;
