import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import logo from '@/assets/logo.png';

interface JoinGateProps {
  initialCode: string;
  error: string;
  onJoin: (code: string, name: string) => void;
}

export const JoinGate = ({ initialCode, error, onJoin }: JoinGateProps) => {
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState('');

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <img
        src={logo}
        alt="Flick"
        className="mx-auto mb-4 h-14 w-auto"
      />
      <h1 className="mb-2 text-center text-3xl font-bold">Flick Watch Party</h1>
      <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
        Video plays in this browser when the host’s stream allows it. Captions
        follow the host. If the stream is blocked, we try the embed page, then
        Open in Flick.
      </p>
      <Card>
        <CardHeader>
          <CardTitle>Join room</CardTitle>
          <CardDescription>Enter the code from the host’s phone.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="code" className="text-sm text-muted-foreground">
              Room code
            </label>
            <Input
              id="code"
              maxLength={6}
              autoComplete="off"
              placeholder="AB12C"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="tracking-[0.18em] font-bold uppercase"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm text-muted-foreground">
              Your name
            </label>
            <Input
              id="name"
              maxLength={32}
              placeholder="Alex"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Button
            className="w-full"
            onClick={() => onJoin(code.trim().toUpperCase(), name.trim())}
          >
            Join room
          </Button>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
};
