import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { PartyMember } from '@/lib/party';

interface MembersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code: string;
  members: PartyMember[];
  onLeave: () => void;
}

export const MembersSheet = ({
  open,
  onOpenChange,
  code,
  members,
  onLeave,
}: MembersSheetProps) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent>
      <SheetHeader>
        <SheetTitle>Party {code}</SheetTitle>
        <SheetDescription>Host controls playback. Guests follow.</SheetDescription>
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
