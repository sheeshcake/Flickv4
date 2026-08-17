import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { JoinGate } from '@/components/JoinGate';
import { WatchPlayer } from '@/components/WatchPlayer';
import { useParty } from '@/hooks/useParty';

export const WatchPage = () => {
  const { code = '' } = useParams();
  const roomCode = code.toUpperCase();
  const { room, joinRoom, setDisplayName, error } = useParty();
  const [gateError, setGateError] = useState('');

  if (room && room.code === roomCode) {
    return <WatchPlayer />;
  }

  return (
    <JoinGate
      initialCode={roomCode}
      error={gateError || error || ''}
      onJoin={(nextCode, name, password) => {
        void (async () => {
          try {
            setGateError('');
            setDisplayName(name);
            await joinRoom(nextCode, 'companion', password);
          } catch (err) {
            setGateError(err instanceof Error ? err.message : 'Could not join');
          }
        })();
      }}
    />
  );
};
