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

export interface ChatLine {
  from: string;
  text: string;
}

interface ChatSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chat: ChatLine[];
  onSend: (text: string) => void;
}

export const ChatSheet = ({ open, onOpenChange, chat, onSend }: ChatSheetProps) => {
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat.length, open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Chat</SheetTitle>
          <SheetDescription>Messages stay in this room.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 flex min-h-0 flex-1 flex-col">
          <ScrollArea className="min-h-48 flex-1 rounded-md border border-border p-2">
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
      </SheetContent>
    </Sheet>
  );
};
