import { useEffect, useMemo, useRef, useState } from 'react';
import { Lock, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { posterUrl, type PublicRoomSummary } from '@/lib/party';
import { cn } from '@/lib/utils';
import logo from '@/assets/logo.png';

interface JoinGateProps {
  initialCode: string;
  error: string;
  onJoin: (code: string, name: string, password?: string) => void;
}

const fetchRooms = async (): Promise<PublicRoomSummary[]> => {
  const res = await fetch('/rooms');
  if (!res.ok) return [];
  const data = (await res.json()) as { rooms?: PublicRoomSummary[] };
  return Array.isArray(data.rooms) ? data.rooms : [];
};

export const JoinGate = ({ initialCode, error, onJoin }: JoinGateProps) => {
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [rooms, setRooms] = useState<PublicRoomSummary[]>([]);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void fetchRooms()
        .then((next) => {
          if (!cancelled) setRooms(next);
        })
        .catch(() => {
          if (!cancelled) setRooms([]);
        });
    };
    load();
    const id = window.setInterval(load, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const selected = useMemo(
    () => rooms.find((r) => r.code === code.trim().toUpperCase()),
    [rooms, code],
  );

  const submit = () => {
    onJoin(code.trim().toUpperCase(), name.trim(), password.trim() || undefined);
  };

  const pickRoom = (room: PublicRoomSummary) => {
    setCode(room.code);
    if (room.locked) {
      window.setTimeout(() => passwordRef.current?.focus(), 0);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col overflow-y-auto px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <img src={logo} alt="Flick" className="mx-auto mb-4 h-14 w-auto" />
      <h1 className="mb-2 text-center text-3xl font-bold">Flick Watch Party</h1>
      <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
        Video plays in this browser when the host’s stream allows it. Captions
        follow the host. If the stream is blocked, we try the embed page, then
        Open in Flick.
      </p>

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          Live parties
        </h2>
        {rooms.length === 0 ? (
          <p className="rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
            No live parties — ask the host for a code.
          </p>
        ) : (
          <ul className="space-y-2">
            {rooms.map((room) => {
              const poster = posterUrl(room.posterPath);
              const ep =
                room.mediaType === 'tv' && room.season != null
                  ? `S${room.season} E${room.episode}`
                  : null;
              const active = room.code === code.trim().toUpperCase();
              return (
                <li key={room.code}>
                  <button
                    type="button"
                    onClick={() => pickRoom(room)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl border bg-card p-2 text-left transition-colors',
                      active ? 'border-primary bg-primary/10' : 'border-border',
                    )}
                  >
                    {poster ? (
                      <img
                        src={poster}
                        alt=""
                        className="h-16 w-11 shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-11 shrink-0 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
                        {room.code.slice(0, 2)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{room.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span>{room.code}</span>
                        {ep ? <span>{ep}</span> : null}
                        <span>{room.paused ? 'Paused' : 'Playing'}</span>
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      {room.locked ? <Lock className="size-3.5" /> : null}
                      <Users className="size-3.5" />
                      {room.memberCount}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Join room</CardTitle>
          <CardDescription>
            Pick a live party or enter the code from the host’s phone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="space-y-2">
              <label htmlFor="code" className="text-sm text-muted-foreground">
                Room code
              </label>
              <Input
                id="code"
                maxLength={6}
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="next"
                inputMode="text"
                placeholder="AB12C"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="font-bold uppercase tracking-[0.18em]"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm text-muted-foreground">
                Your name
              </label>
              <Input
                id="name"
                maxLength={32}
                autoComplete="nickname"
                enterKeyHint="next"
                placeholder="Alex"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus={Boolean(initialCode)}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm text-muted-foreground">
                Password {selected?.locked ? '' : '(optional)'}
              </label>
              <Input
                ref={passwordRef}
                id="password"
                type="password"
                maxLength={64}
                autoComplete="current-password"
                enterKeyHint="go"
                placeholder={selected?.locked ? 'Required' : 'If the host set one'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="h-12 w-full">
              Join room
            </Button>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
