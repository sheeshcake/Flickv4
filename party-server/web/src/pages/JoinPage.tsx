import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { JoinGate } from '@/components/JoinGate';
import { useParty } from '@/hooks/useParty';

export const JoinPage = () => {
  const navigate = useNavigate();
  const { joinRoom, setDisplayName, error } = useParty();
  const [gateError, setGateError] = useState('');

  return (
    <JoinGate
      initialCode=""
      error={gateError || error || ''}
      onJoin={(code, name, password) => {
        void (async () => {
          try {
            setGateError('');
            setDisplayName(name);
            const room = await joinRoom(code, 'companion', password);
            navigate(`/p/${room.code}`);
          } catch (err) {
            setGateError(err instanceof Error ? err.message : 'Could not join');
          }
        })();
      }}
    />
  );
};
