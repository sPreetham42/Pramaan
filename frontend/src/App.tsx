import AppShell from "./AppShell";
import OverviewPage from "./pages/OverviewPage";
import ChallengesPage from "./pages/ChallengesPage";
import JourneyPage from "./pages/JourneyPage";
import ReuseExperiencePage from "./pages/ReuseExperiencePage";
import StartupsPage from "./pages/StartupsPage";
import StartupDetailPage from "./pages/StartupDetailPage";
import EvidencePage from "./pages/EvidencePage";
import RecordsPage from "./pages/RecordsPage";
import RecordDetailPage from "./pages/RecordDetailPage";
import { useRoute, type Route } from "./router";

function Page({ route }: { route: Route }) {
  switch (route.name) {
    case "overview":
      return <OverviewPage />;
    case "challenges":
      return <ChallengesPage />;
    case "challenge":
      // Challenge 1 carries the full pilot journey; challenge 2 is the
      // cross-department reuse experience.
      if (route.id === 2) return <ReuseExperiencePage id={route.id} />;
      return <JourneyPage challengeId={route.id} />;
    case "pilot":
      return <JourneyPage pilotId={route.id} />;
    case "startups":
      return <StartupsPage />;
    case "startup":
      return <StartupDetailPage id={route.id} />;
    case "evidence":
      return <EvidencePage />;
    case "records":
      return <RecordsPage />;
    case "record":
      return <RecordDetailPage id={route.id} />;
    case "unknown":
      return <OverviewPage />;
  }
}

export default function App() {
  const route = useRoute();
  return (
    <AppShell route={route}>
      <Page route={route} />
    </AppShell>
  );
}
