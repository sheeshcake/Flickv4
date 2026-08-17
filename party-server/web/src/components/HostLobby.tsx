import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useParty } from '@/hooks/useParty';
import type { PartyClock, PartyContent } from '@/lib/party';

interface HostLobbyProps {
  open: boolean;
  content: PartyContent | null;
  clock?: PartyClock;
  playTogetherLabel?: string;
  onPlayTogether: (code: string) => void;
  onClose: () => void;
}

const qrUri = (url: string) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}&bgcolor=ffffff&color=000000&margin=8`;

export const HostLobby = ({
  open,
  content,
  clock,
  playTogetherLabel = 'Play together',
  onPlayTogether,
  onClose,
}: HostLobbyProps) => {
  const {
    createRoom,
    room,
    role,
    error,
    displayName,
    setDisplayName,
  } = useParty();
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState(displayName);
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (open) setNameDraft(displayName);
  }, [displayName, open]);

  useEffect(() => {
    if (open) return;
    setPassword('');
    setLocalError(null);
    setBusy(false);
  }, [open]);

  if (!open) return null;

  const hosted = role === 'host' ? room : null;
  const shareUrl = hosted ? `${window.location.origin}/p/${hosted.code}` : '';

  const onCreate = async () => {
    if (!content || busy) return;
    setBusy(true);
    setLocalError(null);
    try {
      setDisplayName(nameDraft);
      await createRoom(
        content,
        clock ? { ...clock, updatedAt: Date.now() } : undefined,
        password.trim() || undefined,
      );
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Could not create room');
    } finally {
      setBusy(false);
    }
  };

  const onCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(
        `Join my Flick watch party ${hosted?.code}\n${shareUrl}`,
      );
    } catch {
      // ignore
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Watch party</h2>
          <Button variant="ghost" size="icon" className="size-8" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
        {!hosted ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {content?.title
                ? `Create a room for ${content.title}. Friends can join from Flick or the web.`
                : 'Create a room. Friends can join from Flick or the web.'}
            </p>
            <div className="space-y-2">
              <label htmlFor="host-name" className="text-sm text-muted-foreground">
                Your name
              </label>
              <Input
                id="host-name"
                value={nameDraft}
                maxLength={32}
                onChange={(e) => setNameDraft(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="host-password" className="text-sm text-muted-foreground">
                Password (optional)
              </label>
              <Input
                id="host-password"
                type="password"
                value={password}
                maxLength={64}
                placeholder="Leave blank for an open room"
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void onCreate();
                }}
              />
            </div>
            {(localError || error) && (
              <p className="text-sm text-destructive">{localError || error}</p>
            )}
            <div className="flex justify-end">
              <Button onClick={() => void onCreate()} disabled={busy || !content}>
                {busy ? 'Creating…' : 'Create room'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Share this code. Each device plays on its own — you only sync play,
              pause, and seek.
            </p>
            <p className="text-center text-4xl font-bold tracking-[0.2em]">
              {hosted.code}
            </p>
            <div className="flex justify-center">
              <img
                src={qrUri(shareUrl)}
                alt="Watch party QR code"
                className="h-40 w-40 rounded-lg bg-white p-1"
              />
            </div>
            {(localError || error) && (
              <p className="text-sm text-destructive">{localError || error}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => void onCopy()}>
                Copy link
              </Button>
              <Button onClick={() => onPlayTogether(hosted.code)}>
                {playTogetherLabel}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
