import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { PartySessionBar } from '@/components/PartySessionBar';
import { PartyProvider, useParty } from '@/hooks/useParty';
import { DetailPage } from '@/pages/DetailPage';
import { HomePage } from '@/pages/HomePage';
import { JoinPage } from '@/pages/JoinPage';
import { SearchPage } from '@/pages/SearchPage';
import { WatchPage } from '@/pages/WatchPage';
import { WatchSoloPage } from '@/pages/WatchSoloPage';

const Shell = () => {
  const location = useLocation();
  const { role } = useParty();
  const watching =
    location.pathname.startsWith('/p/') || location.pathname.startsWith('/watch/');
  return (
    <div className={role === 'host' && !watching ? 'pb-16' : undefined}>
      {watching ? null : <AppHeader />}
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/join" element={<JoinPage />} />
        <Route path="/title/:type/:id" element={<DetailPage />} />
        <Route path="/watch/movie/:id" element={<WatchSoloPage />} />
        <Route path="/watch/tv/:id/:season/:episode" element={<WatchSoloPage />} />
        <Route path="/p/:code" element={<WatchPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {watching ? null : <PartySessionBar />}
    </div>
  );
};

export const App = () => (
  <PartyProvider>
    <Shell />
  </PartyProvider>
);
