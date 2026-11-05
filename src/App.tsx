import { useEffect } from 'react';
import { useRoute } from './ui/router';
import { topicByN } from './ui/content';
import { Home } from './ui/Home';
import { TopicView } from './ui/TopicView';

export default function App() {
  const route = useRoute();
  const topic = route.kind === 'topic' ? topicByN(route.n) : undefined;
  useEffect(() => {
    document.title = topic ? `${topic.n} · ${topic.title} — BioCell Atlas` : 'BioCell Atlas';
  }, [topic]);
  if (route.kind === 'home' || !topic) return <Home />;
  return <TopicView key={topic.n} topic={topic} route={route} />;
}
