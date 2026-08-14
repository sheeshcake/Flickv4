/// <reference types="vite/client" />

interface HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

interface Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

interface HTMLVideoElement {
  webkitEnterFullscreen?: () => void;
}
