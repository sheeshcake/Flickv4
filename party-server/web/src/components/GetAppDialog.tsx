import { useEffect, useState } from 'react';
import {
  Apple,
  Download,
  Monitor,
  Smartphone,
  Tv,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface AppRelease {
  androidApk: string | null;
  appVersion: string | null;
  releaseUrl: string;
  version: string | null;
}

const FALLBACK_RELEASE =
  'https://github.com/sheeshcake/Flickv4/releases/latest';

type PlatformKind = 'coming-soon' | 'download' | 'web';

const platforms: {
  id: string;
  name: string;
  detail: string;
  kind: PlatformKind;
  icon: typeof Apple;
}[] = [
  {
    id: 'ios',
    name: 'iOS',
    detail: 'Coming soon',
    kind: 'coming-soon',
    icon: Apple,
  },
  {
    id: 'android',
    name: 'Android',
    detail: 'Download the APK',
    kind: 'download',
    icon: Smartphone,
  },
  {
    id: 'android-tv',
    name: 'Android TV',
    detail: 'Same APK as Android',
    kind: 'download',
    icon: Tv,
  },
  {
    id: 'windows',
    name: 'Windows',
    detail: 'Use the web app in your browser',
    kind: 'web',
    icon: Monitor,
  },
  {
    id: 'mac',
    name: 'Mac',
    detail: 'Use the web app in your browser',
    kind: 'web',
    icon: Apple,
  },
];

interface GetAppDialogProps {
  open: boolean;
  onClose: () => void;
}

export const GetAppDialog = ({ open, onClose }: GetAppDialogProps) => {
  const [release, setRelease] = useState<AppRelease | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetch('/app')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: AppRelease | null) => {
        if (!cancelled && data) setRelease(data);
      })
      .catch(() => {
        if (!cancelled) {
          setRelease({
            androidApk: null,
            appVersion: null,
            releaseUrl: FALLBACK_RELEASE,
            version: null,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const apkHref = release?.androidApk || release?.releaseUrl || FALLBACK_RELEASE;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Get the app</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {release?.version
                ? `Latest Android build ${release.version}`
                : 'Pick your platform'}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
        <ul className="mt-4 space-y-2">
          {platforms.map((platform) => {
            const Icon = platform.icon;
            const downloadable = platform.kind === 'download';
            return (
              <li key={platform.id}>
                <div className="flex items-center gap-3 rounded-xl border border-border bg-background/40 p-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{platform.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {platform.kind === 'web' && release?.appVersion
                        ? `Web v${release.appVersion}`
                        : platform.detail}
                    </p>
                  </div>
                  {platform.kind === 'coming-soon' ? (
                    <Badge variant="secondary">Coming soon</Badge>
                  ) : null}
                  {platform.kind === 'web' ? (
                    <Badge variant="outline">Web app</Badge>
                  ) : null}
                  {downloadable ? (
                    <Button size="sm" asChild>
                      <a href={apkHref} target="_blank" rel="noreferrer">
                        <Download className="size-3.5" />
                        Download
                      </a>
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};
