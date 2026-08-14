import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import type { PartyMember } from '@/lib/party';

interface ChatLine {
  from: string;
  text: string;
}

interface PartySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code: string;
  members: PartyMember[];
  chat: ChatLine[];
  onSend: (text: string) => void;
  onLeave: () => void;
}

export const PartySheet = ({
  open,
  onOpenChange,
  code,
  members,
  chat,
  onSend,
  onLeave,
}: PartySheetProps) => {
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat.length]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Party {code}</SheetTitle>
          <SheetDescription>Host controls playback. Chat stays in this room.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Watching</h3>
            <ul className="space-y-2">
              {members.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between rounded-md bg-primary/10 px-3 py-2 text-sm"
                >
                  <span className="font-semibold">{m.displayName}</span>
                  <span className="text-xs text-muted-foreground">
                    {m.role}
                    {m.kind === 'companion' ? ' · web' : ''}
                    {m.buffering ? ' · buffering' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <h3 className="mb-2 text-sm font-semibold">Chat</h3>
            <ScrollArea className="h-40 rounded-md border border-border p-2">
              {chat.map((line, i) => (
                <p key={`${line.from}-${i}`} className="mb-1 text-sm">
                  <strong>{line.from}</strong> {line.text}
                </p>
              ))}
              <div ref={bottomRef} />
            </ScrollArea>
            <Textarea
              className="mt-2"
              maxLength={200}
              placeholder="Say something"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <Button
              className="mt-2"
              onClick={() => {
                const next = text.trim();
                if (!next) return;
                onSend(next);
                setText('');
              }}
            >
              Send
            </Button>
          </div>
          <Button variant="outline" asChild>
            <a href={`flick://party/${code}`}>Open in Flick</a>
          </Button>
          <Button variant="ghost" onClick={onLeave}>
            Leave party
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
