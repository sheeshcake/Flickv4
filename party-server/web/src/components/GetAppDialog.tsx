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
import { WEB_PLAYER_ENABLED } from '@/lib/flags';

interface AppRelease {
  androidApk: string | null;
  appVersion: string | null;
  iosIpa: string | null;
  releaseUrl: string;
  version: string | null;
}

const FALLBACK_RELEASE =
  'https://github.com/sheeshcake/Flickv4/releases/latest';

type PlatformKind = 'download' | 'web' | 'unavailable';
type DownloadAsset = 'apk' | 'ipa';

const platforms: {
  id: string;
  name: string;
  detail: string;
  kind: PlatformKind;
  asset?: DownloadAsset;
  icon: typeof Apple;
}[] = [
  {
    id: 'ios',
    name: 'iOS',
    detail: 'Sideload with SideStore',
    kind: 'download',
    asset: 'ipa',
    icon: Apple,
  },
  {
    id: 'android',
    name: 'Android',
    detail: 'Download the APK',
    kind: 'download',
    asset: 'apk',
    icon: Smartphone,
  },
  {
    id: 'android-tv',
    name: 'Android TV',
    detail: 'Same APK as Android',
    kind: 'download',
    asset: 'apk',
    icon: Tv,
  },
  {
    id: 'windows',
    name: 'Windows',
    detail: WEB_PLAYER_ENABLED
      ? 'Use the web app in your browser'
      : 'Web playback is temporarily unavailable — install iOS or Android',
    kind: WEB_PLAYER_ENABLED ? 'web' : 'unavailable',
    icon: Monitor,
  },
  {
    id: 'mac',
    name: 'Mac',
    detail: WEB_PLAYER_ENABLED
      ? 'Use the web app in your browser'
      : 'Web playback is temporarily unavailable — install iOS or Android',
    kind: WEB_PLAYER_ENABLED ? 'web' : 'unavailable',
    icon: Apple,
  },
];

const fallbackRelease = (): AppRelease => ({
  androidApk: null,
  appVersion: null,
  iosIpa: null,
  releaseUrl: FALLBACK_RELEASE,
  version: null,
});

const useAppRelease = (enabled = true) => {
  const [release, setRelease] = useState<AppRelease | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void fetch('/app')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: AppRelease | null) => {
        if (!cancelled && data) {
          setRelease({
            androidApk: data.androidApk ?? null,
            appVersion: data.appVersion ?? null,
            iosIpa: data.iosIpa ?? null,
            releaseUrl: data.releaseUrl || FALLBACK_RELEASE,
            version: data.version ?? null,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setRelease(fallbackRelease());
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return release;
};

const IosInstallSteps = () => (
  <section className="mt-5 space-y-4 border-t border-border pt-4 text-sm">
    <div>
      <h3 className="font-semibold">How to install on iOS</h3>
      <p className="mt-1 text-muted-foreground">
        Flick is not on the App Store. The IPA is unsigned, so you install it with{' '}
        <a
          href="https://sidestore.io"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-foreground underline underline-offset-2"
        >
          SideStore
        </a>
        , which signs it with your Apple ID. A computer is only needed once, to
        install SideStore itself.
      </p>
    </div>

    <div>
      <p className="font-medium">You need</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
        <li>iPhone or iPad on iOS / iPadOS 15 or later, with a passcode</li>
        <li>A free Apple Account (Apple ID)</li>
        <li>Wi-Fi (not cellular) when installing or refreshing apps</li>
        <li>
          <a
            href="https://apps.apple.com/app/localdevvpn/id6755608044"
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline underline-offset-2"
          >
            LocalDevVPN
          </a>{' '}
          from the App Store
        </li>
        <li>A Mac, Windows, Linux, or Chromebook for the first SideStore install</li>
      </ul>
    </div>

    <div>
      <p className="font-medium">Install SideStore</p>
      <p className="mt-1 text-muted-foreground">
        Follow SideStore’s official guides for the computer step — they change
        more often than Flick does:
      </p>
      <ol className="mt-2 list-decimal space-y-2 pl-5 text-muted-foreground">
        <li>
          <a
            href="https://docs.sidestore.io/docs/installation/prerequisites"
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline underline-offset-2"
          >
            Prerequisites
          </a>{' '}
          — install iloader and LocalDevVPN, then connect the VPN.
        </li>
        <li>
          <a
            href="https://docs.sidestore.io/docs/installation/install"
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline underline-offset-2"
          >
            Install SideStore
          </a>{' '}
          — USB-connect the device, install SideStore (Stable) with iloader,
          trust the developer app, turn on Developer Mode, sign in with the same
          Apple Account, then tap the 7 DAYS counter next to SideStore under My
          Apps to finish setup.
        </li>
      </ol>
    </div>

    <div>
      <p className="font-medium">Install Flick</p>
      <ol className="mt-2 list-decimal space-y-2 pl-5 text-muted-foreground">
        <li>
          On the iPhone or iPad, download the Flick IPA (Safari or Files).
          AirDrop from a Mac works too.
        </li>
        <li>Open LocalDevVPN and tap Connect. Leave it on for the rest of these steps.</li>
        <li>Open SideStore → My Apps → + (top of the screen).</li>
        <li>Choose the Flick IPA from Files.</li>
        <li>Wait until SideStore finishes signing and installing. Flick appears on the Home Screen.</li>
        <li>
          If iOS blocks the first launch: Settings → General → VPN & Device
          Management → your Apple Account → Trust.
        </li>
      </ol>
      <p className="mt-2 text-muted-foreground">
        To update later, download the newer IPA and install it the same way
        (over the existing app). Your data stays on the device.
      </p>
    </div>

    <div>
      <p className="font-medium">Refresh every 7 days</p>
      <p className="mt-1 text-muted-foreground">
        Apple’s free developer signing expires after 7 days. Before Flick (or
        SideStore) expires:
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
        <li>Connect to Wi-Fi.</li>
        <li>Open LocalDevVPN and connect.</li>
        <li>In SideStore → My Apps, tap the day counter next to Flick (and SideStore if it is low).</li>
      </ol>
      <p className="mt-2 text-muted-foreground">
        A free Apple Account can keep 3 apps installed at once, including
        SideStore. If install fails, see SideStore’s{' '}
        <a
          href="https://docs.sidestore.io/docs/troubleshooting/common-issues"
          target="_blank"
          rel="noreferrer"
          className="text-foreground underline underline-offset-2"
        >
          common issues
        </a>{' '}
        and{' '}
        <a
          href="https://docs.sidestore.io/docs/troubleshooting/error-codes"
          target="_blank"
          rel="noreferrer"
          className="text-foreground underline underline-offset-2"
        >
          error codes
        </a>
        .
      </p>
    </div>
  </section>
);

const GetAppPanel = ({ release }: { release: AppRelease | null }) => {
  const apkHref = release?.androidApk || release?.releaseUrl || FALLBACK_RELEASE;
  const ipaHref = release?.iosIpa || release?.releaseUrl || FALLBACK_RELEASE;

  return (
    <>
      <ul className="space-y-2">
        {platforms.map((platform) => {
          const Icon = platform.icon;
          const href = platform.asset === 'ipa' ? ipaHref : apkHref;
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
                {platform.kind === 'web' ? (
                  <Badge variant="outline">Web app</Badge>
                ) : null}
                {platform.kind === 'unavailable' ? (
                  <Badge variant="secondary">Unavailable</Badge>
                ) : null}
                {platform.kind === 'download' ? (
                  <Button size="sm" asChild>
                    <a href={href} target="_blank" rel="noreferrer">
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
      <IosInstallSteps />
    </>
  );
};

interface GetAppDialogProps {
  open: boolean;
  onClose: () => void;
}

export const GetAppDialog = ({ open, onClose }: GetAppDialogProps) => {
  const release = useAppRelease(open);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4"
      onClick={onClose}
    >
      <div
        className="max-h-[min(90dvh,44rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Get the app</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {release?.version
                ? `Latest build ${release.version}`
                : 'Pick your platform'}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
        <div className="mt-4">
          <GetAppPanel release={release} />
        </div>
      </div>
    </div>
  );
};

export const GetAppLanding = () => {
  const release = useAppRelease();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <h1 className="text-3xl font-bold">Web playback is temporarily unavailable</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {release?.version
          ? `Download Flick ${release.version} for iOS or Android to keep watching.`
          : 'Download Flick for iOS or Android to keep watching.'}{' '}
        iOS uses SideStore to install the IPA.
      </p>
      <div className="mt-6">
        <GetAppPanel release={release} />
      </div>
    </div>
  );
};
