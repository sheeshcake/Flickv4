---
name: gluestack-ui-v5:validation
description: Validation checklist and anti-patterns for gluestack-ui v5 - use for code review, checking implementation quality, and identifying common mistakes including Tailwind v4-specific issues.
---

# Gluestack UI v5 — Validation & Anti-Patterns

This sub-skill focuses on validating implementations, identifying anti-patterns, and ensuring code quality for gluestack-ui v5 (Tailwind CSS v4, NativeWind v5 / UniWind).

## Validation Checklist

When reviewing code, check for:

### Component Usage

- [ ] Component usage verified against official v5 docs at `https://gluestack.io/ui/docs/components/${componentName}/`
- [ ] All React Native primitives replaced with Gluestack components
- [ ] Components imported from local `@/components/ui/` directory
- [ ] GluestackUIProvider wraps the app

### Component Props vs className

- [ ] **Component props used instead of className when available:**
  - [ ] VStack/HStack use `space` prop instead of `gap-*` className
  - [ ] Button uses `variant` and `size` props instead of className
  - [ ] Heading/Text use `size` prop instead of `text-*` className
  - [ ] Heading/Text use `bold` prop instead of `font-bold` className
  - [ ] Other component props used where applicable

### Styling

- [ ] **CRITICAL: All colors use ONLY semantic tokens** - NO exceptions:
  - [ ] No `typography-*` tokens (use `text-foreground`, `text-muted-foreground`)
  - [ ] No `neutral-*` tokens (use semantic equivalents)
  - [ ] No `gray-*` or `slate-*` tokens (use semantic equivalents)
  - [ ] No numbered colors: `red-500`, `blue-600`, `green-400`
  - [ ] No arbitrary values: `[#3b82f6]`, `[#DC2626]`
  - [ ] No opacity utilities (use alpha values: `/70`, `/90`)
- [ ] All spacing values use the standard scale (no arbitrary values)
- [ ] No inline styles where className can be used
- [ ] Dark mode support using `dark:` prefix (semantic tokens ensure compatibility)
- [ ] Variants defined using `tva` when needed
- [ ] className properly merged in custom components

### Compound Components

- [ ] **Compound components used correctly:**
  - [ ] InputIcon always wrapped in InputSlot (CRITICAL)
  - [ ] ButtonText used for all button text content
  - [ ] FormControl sub-components used (FormControlLabel, FormControlError, etc.)
  - [ ] Card sub-components used (CardHeader, CardBody, CardFooter)
  - [ ] Checkbox sub-components used (CheckboxIndicator, CheckboxIcon, CheckboxLabel)
  - [ ] All other component sub-components as per official docs

### Icons

- [ ] Icons follow priority: pre-built icons → Lucide Icons → createIcon for custom icons
- [ ] Icons imported from `@/components/ui/icon`

### Cross-Platform Compatibility

- [ ] **Cross-platform compatibility verified:**
  - [ ] All components use Gluestack wrappers (no direct react-native imports)
  - [ ] KeyboardAvoidingView uses Gluestack wrapper
  - [ ] Tested on both native and web platforms
  - [ ] All interactions work on both platforms

### Performance & Best Practices

- [ ] **Performance & best practices:**
  - [ ] TypeScript types defined for components and props
  - [ ] Expensive components memoized with React.memo
  - [ ] Callbacks memoized with useCallback when needed
  - [ ] Animations use Reanimated worklets (not Animated API)
  - [ ] Safe areas handled with SafeAreaView or useSafeAreaInsets
  - [ ] Long lists use FlatList (not ScrollView + map)
  - [ ] Platform-specific code uses Platform.select
  - [ ] Tested on real devices (not just simulators)

## Anti-Patterns to Avoid

### ❌ Don't: Mix React Native and Gluestack Components

```tsx
// ❌ INCORRECT: Mixing React Native and Gluestack components
import { View, Text } from "react-native";
import { Button } from "@/components/ui/button";

<View>
  <Text>Mixed usage</Text>
  <Button>Click</Button>
</View>
```

**Why it's bad**: Loses theming, accessibility, and cross-platform consistency.

**Correct approach**:
```tsx
// ✅ CORRECT: Use Gluestack components consistently
import { Box } from "@/components/ui/box";
import { Text } from "@/components/ui/text";
import { Button, ButtonText } from "@/components/ui/button";

<Box>
  <Text>Consistent usage</Text>
  <Button>
    <ButtonText>Click</ButtonText>
  </Button>
</Box>
```

### ❌ Don't: Use Non-Semantic Color Tokens

**STRICTLY PROHIBITED** - You MUST use ONLY semantic tokens for ALL colors.

```tsx
// ❌ PROHIBITED: Generic typography tokens
<Text className="text-typography-900">Heading</Text>
<Text className="text-typography-700">Body</Text>
<Text className="text-typography-500">Muted</Text>

// ❌ PROHIBITED: Neutral color tokens
<Box className="bg-neutral-100">Card</Box>
<Text className="text-neutral-600">Text</Text>
<Box className="border-neutral-300">Border</Box>

// ❌ PROHIBITED: Gray/Slate color scales
<Box className="bg-gray-50">Background</Box>
<Text className="text-gray-900">Content</Text>
<Box className="border-gray-200">Border</Box>

// ❌ PROHIBITED: Numbered color tokens
<Box className="bg-blue-600">Primary</Box>
<Text className="text-red-500">Error</Text>
<Box className="border-green-400">Success</Box>

// ❌ PROHIBITED: Arbitrary color values
<Box className="bg-[#3b82f6]">Arbitrary</Box>
<Text className="text-[#DC2626]">Error</Text>

// ❌ PROHIBITED: Inline color styles
<Box style={{ backgroundColor: '#fff' }}>White</Box>
<Text style={{ color: 'red' }}>Error</Text>

// ❌ PROHIBITED: Opacity utilities
<Text className="text-black opacity-70">Muted</Text>
<Box className="bg-blue-600 bg-opacity-90">Transparent</Box>
```

**Why it's bad**:
- ❌ Breaks theming and dark mode
- ❌ Creates maintenance debt
- ❌ Violates design system
- ❌ Inconsistent colors across app

**Correct approach**:
```tsx
// ✅ CORRECT: Use ONLY semantic tokens
<Text className="text-foreground">Heading</Text>
<Text className="text-foreground">Body</Text>
<Text className="text-muted-foreground">Muted</Text>

<Box className="bg-muted">Card</Box>
<Text className="text-muted-foreground">Text</Text>
<Box className="border-border">Border</Box>

<Box className="bg-background">Background</Box>
<Text className="text-foreground">Content</Text>
<Box className="border-border">Border</Box>

<Box className="bg-primary">Primary</Box>
<Text className="text-destructive">Error</Text>
<Box className="border-primary">Success</Box>

// ✅ CORRECT: Alpha values instead of opacity
<Text className="text-foreground/70">Muted</Text>
<Box className="bg-primary/90">Transparent</Box>
```

### ❌ Don't: Skip Sub-Components

```tsx
// ❌ INCORRECT: ButtonText is required
<Button>Click Me</Button>

// ❌ INCORRECT: InputIcon not wrapped in InputSlot
<Input>
  <InputIcon as={MailIcon} />
  <InputField />
</Input>

// ❌ INCORRECT: Missing FormControl sub-components
<FormControl>
  <Text>Email</Text>
  <InputField />
</FormControl>
```

**Why it's bad**: Components won't render correctly, breaks styling and accessibility.

**Correct approach**:
```tsx
// ✅ CORRECT: Proper sub-component usage
<Button>
  <ButtonText>Click Me</ButtonText>
</Button>

// ✅ CORRECT: InputIcon wrapped in InputSlot
<Input>
  <InputSlot>
    <InputIcon as={MailIcon} />
  </InputSlot>
  <InputField />
</Input>

// ✅ CORRECT: FormControl with proper sub-components
<FormControl>
  <FormControlLabel>
    <FormControlLabelText>Email</FormControlLabelText>
  </FormControlLabel>
  <Input>
    <InputField />
  </Input>
</FormControl>
```

### ❌ Don't: Use Inline Styles When className Works

```tsx
// ❌ INCORRECT: Inline styles for static values
<Box style={{ padding: 16, backgroundColor: '#fff' }} />
<Text style={{ fontSize: 18, fontWeight: 'bold' }} />
```

**Why it's bad**: Bypasses optimization, breaks theming, harder to maintain.

**Correct approach**:
```tsx
// ✅ CORRECT: Use className
<Box className="p-4 bg-background" />
<Text size="lg" bold className="text-foreground" />
```

### ❌ Don't: Use Arbitrary Spacing Values

```tsx
// ❌ INCORRECT: Arbitrary spacing values
<Box className="p-[13px] m-[27px]" />
<Box style={{ padding: 13, margin: 27 }} />
<VStack className="gap-[15px]" />
```

**Why it's bad**: Creates maintenance burden, inconsistent spacing across app.

**Correct approach**:
```tsx
// ✅ CORRECT: Use spacing scale
<Box className="p-3 m-6" />
<VStack space="lg" />
```

### ❌ Don't: Use className for Component Props

```tsx
// ❌ INCORRECT: Using className instead of props
<VStack className="gap-4">
  <Box>Item</Box>
</VStack>

<Button className="bg-primary px-8 py-2">
  <ButtonText>Click</ButtonText>
</Button>

<Heading className="text-2xl font-bold">Title</Heading>
```

**Why it's bad**: Loses type safety, harder to maintain, bypasses design system.

**Correct approach**:
```tsx
// ✅ CORRECT: Use component props
<VStack space="lg">
  <Box>Item</Box>
</VStack>

<Button variant="default" size="lg">
  <ButtonText>Click</ButtonText>
</Button>

<Heading size="2xl" bold>Title</Heading>
```

### ❌ Don't: Import from react-native for Wrapped Components

```tsx
// ❌ INCORRECT: Direct React Native imports
import { KeyboardAvoidingView, View, Text } from 'react-native';

<KeyboardAvoidingView>
  <View>
    <Text>Content</Text>
  </View>
</KeyboardAvoidingView>
```

**Why it's bad**: Breaks cross-platform compatibility, loses theming and accessibility.

**Correct approach**:
```tsx
// ✅ CORRECT: Use Gluestack wrappers
import { KeyboardAvoidingView } from '@/components/ui/keyboard-avoiding-view';
import { Box } from '@/components/ui/box';
import { Text } from '@/components/ui/text';

<KeyboardAvoidingView>
  <Box>
    <Text>Content</Text>
  </Box>
</KeyboardAvoidingView>
```

### ❌ Don't: Use ScrollView for Long Lists

```tsx
// ❌ INCORRECT: ScrollView with map for long lists
<ScrollView>
  {items.map((item) => (
    <Box key={item.id}>
      <Text>{item.name}</Text>
    </Box>
  ))}
</ScrollView>
```

**Why it's bad**: No virtualization, all items rendered at once, poor performance.

**Correct approach**:
```tsx
// ✅ CORRECT: Use FlatList for long lists
<FlatList
  data={items}
  renderItem={({ item }) => (
    <Box>
      <Text>{item.name}</Text>
    </Box>
  )}
  keyExtractor={(item) => item.id}
/>
```

### ❌ Don't: Use Animated API for Animations

```tsx
// ❌ INCORRECT: Animated API (runs on JS thread)
import { Animated } from 'react-native';

const animValue = new Animated.Value(0);

Animated.timing(animValue, {
  toValue: 100,
  duration: 300,
}).start();
```

**Why it's bad**: Runs on JavaScript thread, can cause jank and dropped frames.

**Correct approach**:
```tsx
// ✅ CORRECT: Use Reanimated (runs on UI thread)
import { useSharedValue, withTiming } from 'react-native-reanimated';

const animValue = useSharedValue(0);
animValue.value = withTiming(100, { duration: 300 });
```

## Common Mistakes Summary

| Mistake | Impact | Correct Approach |
|---------|--------|-----------------|
| Using React Native primitives | Loses theming, accessibility, cross-platform support | Use Gluestack components |
| **Using `typography-*`, `neutral-*`, `gray-*` tokens** | **Breaks theming and dark mode** | **Use ONLY semantic tokens** |
| **Using numbered colors (`red-500`, `blue-600`)** | **Breaks theming and dark mode** | **Use semantic tokens** |
| **Using opacity utilities (`opacity-70`)** | **Inconsistent transparency** | **Use alpha values (`/70`, `/90`)** |
| Raw color values | Breaks theming and dark mode | Use semantic tokens |
| Skipping sub-components | Components won't render correctly | Use proper compound components |
| Inline styles for static values | Bypasses optimization, harder to maintain | Use className |
| Arbitrary spacing values | Creates maintenance burden | Use spacing scale |
| className instead of props | Loses type safety | Use component props when available |
| Direct react-native imports | Breaks cross-platform compatibility | Use Gluestack wrappers |
| ScrollView for long lists | Poor performance | Use FlatList |
| Animated API | Janky animations | Use Reanimated worklets |
| **Still using `tailwind.config.js` in v5** | **Tailwind v4 is CSS-first; config ignored** | **Delete it, use `global.css` `@theme inline`** |
| **Missing `lightningcss` pin (NativeWind v5)** | **Build errors, CSS mismatch** | **Pin `lightningcss@1.30.1` in overrides/resolutions** |
| **Using `@tailwind base/components/utilities`** | **Tailwind v4 uses `@import` syntax** | **Use `@import "tailwindcss/..."`** |
| **Missing `postcss.config.js` (NativeWind v5)** | **CSS not processed** | **Create with `@tailwindcss/postcss` plugin** |

## Critical Issues (Must Fix Immediately)

### 🔴 Critical: InputIcon Not Wrapped in InputSlot

```tsx
// ❌ CRITICAL ERROR: Will break rendering
<Input>
  <InputIcon as={MailIcon} />
  <InputField />
</Input>

// ✅ MUST FIX: Wrap InputIcon in InputSlot
<Input>
  <InputSlot>
    <InputIcon as={MailIcon} />
  </InputSlot>
  <InputField />
</Input>
```

### 🔴 Critical: Missing ButtonText

```tsx
// ❌ CRITICAL ERROR: Button won't render correctly
<Button>Submit</Button>

// ✅ MUST FIX: Use ButtonText
<Button>
  <ButtonText>Submit</ButtonText>
</Button>
```

### 🔴 Critical: Using React Native Instead of Gluestack

```tsx
// ❌ CRITICAL ERROR: Breaks cross-platform support
import { View, Text } from 'react-native';

// ✅ MUST FIX: Use Gluestack components
import { Box } from '@/components/ui/box';
import { Text } from '@/components/ui/text';
```

### 🔴 Critical: Using Non-Semantic Color Tokens

```tsx
// ❌ CRITICAL ERROR: Using prohibited tokens
<Text className="text-typography-900">Heading</Text>
<Box className="bg-neutral-100">Card</Box>
<Text className="text-gray-700">Content</Text>
<Box className="bg-blue-600">Primary</Box>

// ✅ MUST FIX: Use ONLY semantic tokens
<Text className="text-foreground">Heading</Text>
<Box className="bg-muted">Card</Box>
<Text className="text-foreground">Content</Text>
<Box className="bg-primary">Primary</Box>
```

## Code Review Guidelines

### High Priority (Must Have)

1. **Component consistency** - All components use Gluestack wrappers
2. **Compound components** - All sub-components used correctly
3. **CRITICAL: Semantic tokens ONLY** - Zero tolerance for:
   - `typography-*`, `neutral-*`, `gray-*`, `slate-*` tokens
   - Numbered colors: `red-500`, `blue-600`, `green-400`
   - Arbitrary values: `[#3b82f6]`, `[#DC2626]`
   - Opacity utilities: `opacity-70`, `bg-opacity-90`
   - Must use ONLY: `text-foreground`, `bg-primary`, `border-border`, etc.
4. **Component props** - Props used instead of className when available

### Medium Priority (Should Have)

1. **TypeScript types** - All props and components typed
2. **Spacing scale** - No arbitrary spacing values
3. **Performance** - FlatList for long lists, memoization for expensive components
4. **Dark mode** - Proper dark mode support

### Low Priority (Nice to Have)

1. **Animations** - Using Reanimated instead of Animated API
2. **Code organization** - Logical component structure
3. **Documentation** - Comments for complex logic

## Escalation Guidance

When a design request cannot be satisfied with existing patterns:

### Step 1: Push Back Early

**Explain the implications:**
- Performance impact
- Maintenance burden
- Breaks theming/dark mode
- Inconsistent with design system

**Example**:
> "Using arbitrary spacing values like `p-[13px]` creates maintenance issues and breaks consistency. Can we use `p-3` (12px) or `p-4` (16px) from our spacing scale instead?"

### Step 2: Propose Alternatives

**Map to existing tokens:**
```tsx
// Request: "Make it slightly lighter red"
// ❌ Don't use: bg-red-400
// ✅ Propose: bg-destructive/80 (with alpha)
```

**Suggest new semantic tokens:**
```tsx
// Request: "I need a success color"
// ✅ Propose: Add success token to design system
// Then use: text-success, bg-success
```

### Step 3: Add to Design System

If truly needed, add the CSS custom property to `global.css` `@layer theme` and map it in `@theme inline`, then update `gluestack-ui-provider/config.ts`:

```ts
// 1. Add to global.css @layer theme
// --success: 34 197 94;
// --success-foreground: 255 255 255;

// 2. Map in global.css @theme inline
// --color-success: rgb(var(--success));
// --color-success-foreground: rgb(var(--success-foreground));

// 3. Update provider config
export const config = {
  tokens: {
    colors: {
      success: '34 197 94',
      'success-foreground': '255 255 255',
    },
  },
};
```

### Step 4: Document Exception

If inline style is unavoidable, document why:

```tsx
/**
 * Using inline style for dynamic safe area padding
 * Cannot use className as value comes from hook
 */
<Box style={{ paddingBottom: insets.bottom }}>
  {/* Content */}
</Box>
```

## Quick Validation Script

Use this mental checklist when reviewing code:

1. ✅ Gluestack components? (not React Native)
2. ✅ Compound components correct? (ButtonText, InputSlot, etc.)
3. ✅ **CRITICAL: Semantic tokens ONLY?**
   - ❌ No `typography-*`, `neutral-*`, `gray-*`, `slate-*`
   - ❌ No numbered colors: `red-500`, `blue-600`
   - ❌ No arbitrary values: `[#3b82f6]`
   - ❌ No opacity utilities: `opacity-70`
   - ✅ Only semantic: `text-foreground`, `bg-primary`, `border-border`
4. ✅ Component props? (space, size, variant)
5. ✅ Spacing scale? (no arbitrary values)
6. ✅ TypeScript types? (all props typed)
7. ✅ Performance? (FlatList, memoization)
8. ✅ Cross-platform? (Gluestack wrappers)

## Reference

- **Official Documentation**: https://gluestack.io/ui/docs
- **Component Verification**: `https://gluestack.io/ui/docs/components/${componentName}/`
