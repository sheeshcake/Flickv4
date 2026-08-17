import { useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useParty } from '@/hooks/useParty';

export const PartySessionBar = () => {
  const { room, role, leaveRoom, joinNotice } = useParty();
  const navigate = useNavigate();

  if (!room || role !== 'host') return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Users className="size-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-xs font-bold">Party {room.code}</p>
            <p className="truncate text-xs text-muted-foreground">
              {joinNotice
                ? `${joinNotice} joined`
                : room.browsing
                  ? 'Pick something to watch'
                  : room.content.title}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate(`/p/${room.code}`)}
          >
            Resume
          </Button>
          <Button size="sm" variant="ghost" onClick={() => leaveRoom()}>
            Leave
          </Button>
        </div>
      </div>
    </div>
  );
};
