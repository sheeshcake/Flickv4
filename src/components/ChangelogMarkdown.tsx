import { Linking } from 'react-native';
import { Box } from '@/components/ui/box';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';

type Block =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'code'; text: string }
  | { type: 'hr' };

const INLINE_RE =
  /(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

const parseBlocks = (source: string): Block[] => {
  const lines = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  const flushParagraph = (buf: string[]) => {
    const text = buf.join(' ').trim();
    if (text) blocks.push({ type: 'paragraph', text });
    buf.length = 0;
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (/^```/.test(trimmed)) {
      i += 1;
      const body: string[] = [];
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        body.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push({ type: 'code', text: body.join('\n') });
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3;
      blocks.push({ type: 'heading', level, text: heading[2].trim() });
      i += 1;
      continue;
    }

    const bullet = /^[-*+]\s+(.+)$/.exec(trimmed);
    const numbered = /^\d+\.\s+(.+)$/.exec(trimmed);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      const items: string[] = [];
      while (i < lines.length) {
        const next = lines[i].trim();
        const nextBullet = /^[-*+]\s+(.+)$/.exec(next);
        const nextNumbered = /^\d+\.\s+(.+)$/.exec(next);
        const match = ordered ? nextNumbered : nextBullet;
        if (!match) break;
        items.push(match[1]);
        i += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    const para: string[] = [trimmed];
    i += 1;
    while (i < lines.length) {
      const next = lines[i].trim();
      if (
        !next ||
        /^(#{1,3})\s+/.test(next) ||
        /^[-*+]\s+/.test(next) ||
        /^\d+\.\s+/.test(next) ||
        /^```/.test(next) ||
        /^(-{3,}|\*{3,}|_{3,})$/.test(next)
      ) {
        break;
      }
      para.push(next);
      i += 1;
    }
    flushParagraph(para);
  }

  return blocks;
};

const InlineText = ({
  text,
  size = 'sm',
  className = 'text-muted-foreground',
}: {
  text: string;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}) => {
  const parts = text.split(INLINE_RE).filter((p) => p.length > 0);
  if (parts.length === 1 && parts[0] === text) {
    return (
      <Text size={size} className={className}>
        {text}
      </Text>
    );
  }

  return (
    <Text size={size} className={className}>
      {parts.map((part, index) => {
        if (
          (part.startsWith('**') && part.endsWith('**')) ||
          (part.startsWith('__') && part.endsWith('__'))
        ) {
          return (
            <Text key={index} size={size} bold className="text-foreground">
              {part.slice(2, -2)}
            </Text>
          );
        }
        if (part.startsWith('*') && part.endsWith('*')) {
          return (
            <Text key={index} size={size} italic className={className}>
              {part.slice(1, -1)}
            </Text>
          );
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <Text key={index} size={size} className="text-foreground">
              {part.slice(1, -1)}
            </Text>
          );
        }
        const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
        if (link) {
          return (
            <Text
              key={index}
              size={size}
              className="text-primary"
              onPress={() => {
                void Linking.openURL(link[2]);
              }}
            >
              {link[1]}
            </Text>
          );
        }
        return part;
      })}
    </Text>
  );
};

/**
 * Renders GitHub-style Markdown release notes with semantic tokens.
 * Covers headings, lists, fenced code, links, and common inline marks.
 */
export const ChangelogMarkdown = ({ source }: { source: string }) => {
  const blocks = parseBlocks(source.trim() || 'No release notes available.');

  return (
    <VStack space="sm">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const size = block.level === 1 ? 'md' : 'sm';
          return (
            <Heading
              key={index}
              size={size}
              className="text-foreground"
            >
              {block.text.replace(/\*\*/g, '')}
            </Heading>
          );
        }
        if (block.type === 'hr') {
          return <Box key={index} className="my-1 h-px bg-border" />;
        }
        if (block.type === 'code') {
          return (
            <Box key={index} className="rounded-md bg-background/80 p-3">
              <Text size="xs" className="text-foreground">
                {block.text}
              </Text>
            </Box>
          );
        }
        if (block.type === 'list') {
          return (
            <VStack key={index} space="xs">
              {block.items.map((item, itemIndex) => (
                <InlineText
                  key={itemIndex}
                  text={`${block.ordered ? `${itemIndex + 1}.` : '•'} ${item}`}
                />
              ))}
            </VStack>
          );
        }
        return <InlineText key={index} text={block.text} />;
      })}
    </VStack>
  );
};

export const ChangelogSection = ({
  notes,
  title = "What's new",
}: {
  notes: string;
  title?: string;
}) => (
  <VStack space="xs" className="rounded-lg bg-background/40 p-4">
    <Text className="font-semibold text-foreground">{title}</Text>
    <ChangelogMarkdown source={notes} />
  </VStack>
);
