import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  type SharedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { ClipPath, Defs, G, Mask, Path, Rect } from 'react-native-svg';

/** Paths copied from `assets/images/logo-full.svg` (FLICK wordmark). */
export const LOGO_VB_W = 1704;
export const LOGO_VB_H = 789;
export const LOGO_WIDTH_RATIO = 0.35;
export const LOGO_MAX_WIDTH = 320;

const F_PATH =
  'M332.408 0.5V113.857H126.586V331.953H288.06V445.311H126.586V761.917L126.176 761.992L66.0957 772.99L1.1123 787.987L0.5 788.129V0.5H332.408Z';
const L_PATH =
  'M494.292 0.5V586.475L683.475 577.001L684 576.975V693.45L683.552 693.497L378.552 725.497L378 725.556V0.5H494.292Z';
const I_PATH = 'M842 0.5V686.5H730V0.5H842Z';
const C_PATH =
  'M1053.5 0.5C1107.23 0.500001 1148.12 15.2969 1176.08 44.9648C1204.71 74.6259 1219 116.453 1219 170.372V243.741H1112.07V163.479C1112.07 142.206 1107.42 126.344 1098.19 115.804C1088.98 105.276 1075.13 99.9727 1056.56 99.9727C1037.98 99.9727 1024.13 105.276 1014.92 115.804C1005.69 126.344 1001.04 142.206 1001.04 163.479V548.506C1001.04 569.45 1005.69 585.064 1014.92 595.44C1024.13 605.805 1037.98 611.027 1056.56 611.027C1075.13 611.027 1088.98 605.805 1098.2 595.44C1107.42 585.064 1112.07 569.45 1112.07 548.506V442.641H1219V540.628C1219 594.547 1204.72 636.374 1176.08 666.035L1176.08 666.034C1148.12 695.702 1107.23 710.5 1053.5 710.5C999.766 710.5 958.539 695.702 929.899 666.035L929.896 666.03C901.943 636.369 888 594.544 888 540.628V170.372C888 116.456 901.943 74.6311 929.896 44.9697L929.899 44.9648C958.539 15.2983 999.766 0.5 1053.5 0.5Z';
const K_PATH =
  'M1390.93 0.5V301.35L1548.99 0.767578L1549.13 0.5H1675.21L1674.79 1.24609L1526.12 264.474L1702.97 774.836L1703.25 775.643L1702.41 775.492L1562.91 750.492L1562.62 750.44L1562.53 750.165L1440.3 399.927L1390.93 490.052V726.594L1390.34 726.493L1265.42 704.993L1265 704.921V0.5H1390.93Z';

const FILL = '#E50914';
const STROKE_MS = 250;
const STAGGER_MS = 145;
const HOLD_AFTER_F_MS = 150;
const ZOOM_MS = 700;
const SLIDE_MS = 850;
const F_ZOOM = 4;
const DRAW_EASING = Easing.bezierFn(0.414, 0, 0.715, 1);
const ZOOM_EASING = Easing.bezierFn(0.655, 0, 0.461, 1);
const SLIDE_EASING = Easing.bezierFn(0.684, 0, 0.455, 1);

export const STEM_MS = STROKE_MS;

const AnimatedPath = Animated.createAnimatedComponent(Path);

type ClipRect = { x: number; y: number; width: number; height: number };

type Brush = {
  d: string;
  width: number;
  length: number;
  startMs: number;
  linecap?: 'butt' | 'round';
};

type Letter = {
  maskId: string;
  path: string;
  brushes: Brush[];
  clip?: ClipRect;
  maskBox: ClipRect;
};

const dist = (x1: number, y1: number, x2: number, y2: number) =>
  Math.hypot(x2 - x1, y2 - y1);

const vLine = (x: number, y1: number, y2: number, width: number): Omit<Brush, 'startMs'> => ({
  d: `M${x} ${y1} V${y2}`,
  width,
  length: Math.abs(y2 - y1),
});

const hLine = (x1: number, x2: number, y: number, width: number): Omit<Brush, 'startMs'> => ({
  d: `M${x1} ${y} H${x2}`,
  width,
  length: Math.abs(x2 - x1),
});

const dLine = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  linecap: Brush['linecap'] = 'butt',
): Omit<Brush, 'startMs'> => ({
  d: `M${x1} ${y1} L${x2} ${y2}`,
  width,
  length: dist(x1, y1, x2, y2),
  linecap,
});

const inflate = (box: ClipRect, pad: number): ClipRect => ({
  x: box.x - pad,
  y: box.y - pad,
  width: box.width + pad * 2,
  height: box.height + pad * 2,
});

const packLetter = (
  maskId: string,
  path: string,
  startMs: number,
  parts: Omit<Brush, 'startMs'>[],
  clip?: ClipRect,
  maskBox: ClipRect = { x: 0, y: 0, width: LOGO_VB_W, height: LOGO_VB_H },
): Letter => ({
  maskId,
  path,
  clip,
  maskBox,
  brushes: parts.map((part, i) => ({ ...part, startMs: startMs + i * STAGGER_MS })),
});

const letterEndMs = (letter: Letter) => {
  const last = letter.brushes[letter.brushes.length - 1];
  return last.startMs + STROKE_MS;
};

const F_MIN_X = 0.5;
const F_MAX_X = 332.408;
const F_CENTER_X = (F_MIN_X + F_MAX_X) / 2;
const VB_CENTER_X = LOGO_VB_W / 2;
const F_OFFSET_VB = F_CENTER_X - VB_CENTER_X;

const F_STEM_X = (0.5 + 126.586) / 2;
const L_STEM_X = (378 + 494.292) / 2;
const I_STEM_X = (730 + 842) / 2;
const C_SPINE_X = (888 + 1001.04) / 2;
const K_STEM_X = (1265 + 1390.93) / 2;
const K_STEM_LEFT = 1265;
const K_STEM_RIGHT = 1390.93;
const K_ARM1_OX = 1390.93;
const K_ARM1_OY = 301.35;
const K_UPPER_TIP_X = (1549.13 + 1675.21) / 2;
const K_UPPER_TIP_Y = 20;
const K_LOWER_TIP_X = (1702.97 + 1562.62) / 2;
const K_LOWER_TIP_Y = (774.836 + 750.44) / 2;
const K_ARM1_INNER_X = 1526.12;
const K_ARM1_INNER_Y = 264.474;
const K_CENTER_X = (1265 + 1703.25) / 2;
const K_CENTER_Y = LOGO_VB_H / 2;
const K_ARM2_INSET = 22;
const K_ARM2_TO_CENTER_X = K_CENTER_X - K_ARM1_INNER_X;
const K_ARM2_TO_CENTER_Y = K_CENTER_Y - K_ARM1_INNER_Y;
const K_ARM2_TO_CENTER_LEN = Math.hypot(K_ARM2_TO_CENTER_X, K_ARM2_TO_CENTER_Y);
const K_ARM2_OX =
  K_ARM1_INNER_X + (K_ARM2_TO_CENTER_X / K_ARM2_TO_CENTER_LEN) * K_ARM2_INSET;
const K_ARM2_OY =
  K_ARM1_INNER_Y + (K_ARM2_TO_CENTER_Y / K_ARM2_TO_CENTER_LEN) * K_ARM2_INSET;

const K_STEM_CLIP: ClipRect = {
  x: K_STEM_LEFT,
  y: 0,
  width: K_STEM_RIGHT - K_STEM_LEFT,
  height: LOGO_VB_H,
};
const K_ARMS_CLIP: ClipRect = {
  x: K_STEM_RIGHT,
  y: 0,
  width: LOGO_VB_W - K_STEM_RIGHT,
  height: LOGO_VB_H,
};

const F_LETTER = packLetter(
  'flick-f',
  F_PATH,
  0,
  [
    vLine(F_STEM_X, 0.5, 788.129, 132),
    hLine(F_STEM_X, 332.408, (0.5 + 113.857) / 2, 120),
    hLine(F_STEM_X, 288.06, (331.953 + 445.311) / 2, 120),
  ],
  undefined,
  { x: 0, y: 0, width: 400, height: LOGO_VB_H },
);

const ZOOM_START_MS = letterEndMs(F_LETTER) + HOLD_AFTER_F_MS;
const ZOOM_END_MS = ZOOM_START_MS + ZOOM_MS;
const SLIDE_END_MS = ZOOM_END_MS + SLIDE_MS;
/** Loading copy waits until the camera has pulled back with F still centered. */
export const WORD_REVEAL_MS = ZOOM_END_MS;

const L_LETTER = packLetter(
  'flick-l',
  L_PATH,
  ZOOM_END_MS,
  [
    vLine(L_STEM_X, 0.5, 725.556, 124),
    dLine(L_STEM_X, (586.475 + 725.556) / 2, 684, (576.975 + 693.45) / 2, 130),
  ],
  undefined,
  { x: 330, y: 0, width: 420, height: LOGO_VB_H },
);
const I_LETTER = packLetter(
  'flick-i',
  I_PATH,
  letterEndMs(L_LETTER),
  [vLine(I_STEM_X, 0.5, 686.5, 120)],
  undefined,
  { x: 680, y: 0, width: 220, height: LOGO_VB_H },
);
const C_LETTER = packLetter(
  'flick-c',
  C_PATH,
  letterEndMs(I_LETTER),
  [
    vLine(C_SPINE_X, 80, 650, 130),
    hLine(888, 1219, 100, 200),
    hLine(888, 1219, 620, 200),
  ],
  undefined,
  { x: 780, y: 0, width: 540, height: LOGO_VB_H },
);
const K_STEM_LETTER = packLetter(
  'flick-k-stem',
  K_PATH,
  letterEndMs(C_LETTER),
  [vLine(K_STEM_X, 0.5, 726.594, 132)],
  K_STEM_CLIP,
  inflate(K_STEM_CLIP, 16),
);
const K_ARMS_LETTER = packLetter(
  'flick-k-arms',
  K_PATH,
  letterEndMs(K_STEM_LETTER),
  [
    dLine(K_ARM1_OX, K_ARM1_OY, K_UPPER_TIP_X, K_UPPER_TIP_Y, 230, 'round'),
    dLine(K_ARM2_OX, K_ARM2_OY, K_LOWER_TIP_X, K_LOWER_TIP_Y, 230, 'round'),
  ],
  K_ARMS_CLIP,
  inflate(K_ARMS_CLIP, 120),
);

const LETTERS = [F_LETTER, L_LETTER, I_LETTER, C_LETTER, K_STEM_LETTER, K_ARMS_LETTER];
export const TOTAL_MS = Math.max(letterEndMs(K_ARMS_LETTER), SLIDE_END_MS);
const STATIC_PATHS = [F_PATH, L_PATH, I_PATH, C_PATH, K_PATH];

export const splashLogoSize = (windowWidth: number) => {
  const width = Math.min(windowWidth * LOGO_WIDTH_RATIO, LOGO_MAX_WIDTH);
  return { width, height: width * (LOGO_VB_H / LOGO_VB_W) };
};

const StrokeBrush = ({
  brush,
  progress,
}: {
  brush: Brush;
  progress: SharedValue<number>;
}) => {
  const animatedProps = useAnimatedProps(() => {
    const start = brush.startMs / TOTAL_MS;
    const end = (brush.startMs + STROKE_MS) / TOTAL_MS;
    const t = progress.value;
    if (t <= start) return { strokeDashoffset: brush.length };
    if (t >= end) return { strokeDashoffset: 0 };
    const local = (t - start) / (end - start);
    return { strokeDashoffset: brush.length * (1 - DRAW_EASING(local)) };
  });

  return (
    <AnimatedPath
      d={brush.d}
      stroke="#FFFFFF"
      strokeWidth={brush.width}
      strokeLinecap={brush.linecap ?? 'butt'}
      strokeDasharray={brush.length}
      fill="none"
      animatedProps={animatedProps}
    />
  );
};

const MaskedGlyph = ({
  letter,
  progress,
}: {
  letter: Letter;
  progress: SharedValue<number>;
}) => {
  const startMs = letter.brushes[0].startMs;
  const animatedProps = useAnimatedProps(() => ({
    opacity: progress.value * TOTAL_MS >= startMs ? 1 : 0,
  }));

  const fillPath = (
    <AnimatedPath
      d={letter.path}
      fill={FILL}
      mask={`url(#${letter.maskId})`}
      animatedProps={animatedProps}
    />
  );

  if (!letter.clip) return fillPath;

  return <G clipPath={`url(#${letter.maskId}-clip)`}>{fillPath}</G>;
};

interface FlickSwoopLogoProps {
  onDrawEnd: () => void;
}

export const FlickSwoopLogo = memo(function FlickSwoopLogo({ onDrawEnd }: FlickSwoopLogoProps) {
  const { width: windowWidth } = useWindowDimensions();
  const { width, height } = splashLogoSize(windowWidth);
  const pixelOffset = (F_OFFSET_VB / LOGO_VB_W) * width;
  const progress = useSharedValue(0);
  const [settled, setSettled] = useState(false);
  const didFinishRef = useRef(false);
  const onDrawEndRef = useRef(onDrawEnd);
  onDrawEndRef.current = onDrawEnd;

  const handleEnd = useCallback(() => {
    if (didFinishRef.current) return;
    didFinishRef.current = true;
    setSettled(true);
    onDrawEndRef.current();
  }, []);

  useEffect(() => {
    progress.value = withTiming(1, { duration: TOTAL_MS, easing: Easing.linear });
  }, [progress]);

  useAnimatedReaction(
    () => progress.value >= 1,
    (done, prev) => {
      if (done && !prev) runOnJS(handleEnd)();
    },
  );

  const zoomStyle = useAnimatedStyle(() => {
    const z = interpolate(
      progress.value,
      [ZOOM_START_MS / TOTAL_MS, ZOOM_END_MS / TOTAL_MS],
      [0, 1],
      Extrapolation.CLAMP,
    );
    const s = interpolate(
      progress.value,
      [ZOOM_END_MS / TOTAL_MS, SLIDE_END_MS / TOTAL_MS],
      [0, 1],
      Extrapolation.CLAMP,
    );
    const scale = interpolate(ZOOM_EASING(z), [0, 1], [F_ZOOM, 1]);
    const pan = interpolate(SLIDE_EASING(s), [0, 1], [1, 0]);
    return {
      transform: [
        { translateX: pixelOffset * (1 - pan - scale) },
        { scale },
      ],
    };
  });

  return (
    <Animated.View
      accessible
      accessibilityLabel="Flick"
      pointerEvents="none"
      collapsable={false}
      style={[{ width, height, overflow: 'visible' }, zoomStyle]}
    >
      <Svg width={width} height={height} viewBox={`0 0 ${LOGO_VB_W} ${LOGO_VB_H}`}>
        {settled ? (
          STATIC_PATHS.map((d) => <Path key={d.slice(0, 24)} d={d} fill={FILL} />)
        ) : (
          <>
            <Defs>
              {LETTERS.map((letter) => (
                <Mask
                  key={letter.maskId}
                  id={letter.maskId}
                  x={letter.maskBox.x}
                  y={letter.maskBox.y}
                  width={letter.maskBox.width}
                  height={letter.maskBox.height}
                  maskUnits="userSpaceOnUse"
                >
                  {letter.brushes.map((brush) => (
                    <StrokeBrush
                      key={brush.d}
                      brush={brush}
                      progress={progress}
                    />
                  ))}
                </Mask>
              ))}
              {LETTERS.filter((letter) => letter.clip).map((letter) => (
                <ClipPath key={`${letter.maskId}-clip`} id={`${letter.maskId}-clip`}>
                  <Rect
                    x={letter.clip!.x}
                    y={letter.clip!.y}
                    width={letter.clip!.width}
                    height={letter.clip!.height}
                  />
                </ClipPath>
              ))}
            </Defs>
            {LETTERS.map((letter) => (
              <MaskedGlyph key={letter.maskId} letter={letter} progress={progress} />
            ))}
          </>
        )}
      </Svg>
    </Animated.View>
  );
});
