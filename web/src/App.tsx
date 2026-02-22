import { useEffect } from 'react';
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
import { ControlsHint } from './components/ControlsHint';
import { useSpaceStore } from './store/useSpaceStore';
import type { SpaceEntry } from './store/useSpaceStore';

function App() {
  const spaceUrl = useSpaceStore((s) => s.spaceUrl);
  const isAdvancedMode = useSpaceStore((s) => s.isAdvancedMode);
  useSpaceLoader(spaceUrl);

  // Discover available spaces: try index.json first, fall back to server /health
  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';

    // Try index.json (written by the pipeline)
    fetch('/spaces/index.json')
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((entries: SpaceEntry[]) => {
        if (Array.isArray(entries) && entries.length > 0) {
          useSpaceStore.getState().setAvailableSpaces(entries);
        } else {
          throw new Error('empty');
        }
      })
      .catch(() => {
        // Fallback: ask the API server which spaces it has loaded
        fetch(`${apiUrl}/health`)
          .then((r) => r.json())
          .then((data: { spaces?: string[] }) => {
            if (data.spaces && data.spaces.length > 0) {
              const entries: SpaceEntry[] = data.spaces.map((id) => ({
                id,
                label: id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
                url: `/spaces/${id}.json.gz`,
              }));
              useSpaceStore.getState().setAvailableSpaces(entries);
            } else {
              useSpaceStore.getState().setError('No spaces found. Run the pipeline to generate a space.');
            }
          })
          .catch(() => {
            useSpaceStore.getState().setError(
              'No spaces found. Run the pipeline to generate a space, then start the server.',
            );
          });
      });
  }, []);

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
      <ControlsHint />
      <RectangleSelector />
    </>
  );
}

export default App;
