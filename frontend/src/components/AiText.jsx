/**
 * Renders LLM output as formatted text instead of a raw <pre> block.
 *
 * Models emit a mix of markdown and the plain ALL-CAPS headings our report
 * prompt asks for ("EXECUTIVE SUMMARY", "VERDICT: BUY"). A full markdown
 * library is overkill for that, so this handles the subset the agents actually
 * produce: headings, bullet/numbered lists, **bold**, *italic*, `code`.
 *
 * Everything is built as React nodes — no dangerouslySetInnerHTML.
 */

const VERDICTS = ['STRONG BUY', 'STRONG SELL', 'BUY', 'SELL', 'HOLD'];

const VERDICT_TONE = {
  'STRONG BUY': 'text-bull',
  BUY: 'text-bull',
  HOLD: 'text-warn',
  SELL: 'text-bear',
  'STRONG SELL': 'text-bear',
};

// Inline: **bold**, *italic*, `code`
function inline(text, keyPrefix = 'i') {
  const nodes = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*)/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-${i++}`;
    if (tok.startsWith('**')) {
      nodes.push(<strong key={key} className="font-semibold text-text-primary">{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith('`')) {
      nodes.push(<code key={key} className="num text-xs bg-border/60 rounded px-1 py-0.5">{tok.slice(1, -1)}</code>);
    } else {
      nodes.push(<em key={key}>{tok.slice(1, -1)}</em>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length ? nodes : text;
}

const stripMarks = (s) => s.replace(/\*\*/g, '').replace(/^#{1,6}\s*/, '').trim();

function findVerdict(line) {
  const upper = line.toUpperCase();
  if (!upper.includes('VERDICT')) return null;
  return VERDICTS.find((v) => upper.includes(v)) || null;
}

function isHeading(raw) {
  const line = raw.trim();
  if (/^#{1,6}\s+/.test(line)) return stripMarks(line);
  // **Heading** alone on its line
  if (/^\*\*[^*]+\*\*:?$/.test(line)) return stripMarks(line).replace(/:$/, '');
  // Bare ALL-CAPS section label, e.g. "KEY RISKS" / "TECHNICAL SETUP"
  if (/^[A-Z][A-Z0-9 \-/&()]{3,40}:?$/.test(line) && !/^\d/.test(line)) {
    return line.replace(/:$/, '');
  }
  return null;
}

export default function AiText({ text, className = '', dense = false }) {
  if (!text) return null;

  const lines = String(text).split('\n');
  const blocks = [];
  let para = [];
  let list = null; // { ordered: bool, items: [] }

  const flushPara = () => {
    if (para.length) {
      blocks.push({ type: 'p', text: para.join(' ') });
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push({ type: 'list', ...list });
      list = null;
    }
  };
  const flushAll = () => { flushPara(); flushList(); };

  for (const raw of lines) {
    const line = raw.trim();

    if (!line) { flushAll(); continue; }

    const verdict = findVerdict(line);
    if (verdict) {
      flushAll();
      blocks.push({ type: 'verdict', verdict, rest: line.replace(/^[^:]*:?\s*/, '') });
      continue;
    }

    const heading = isHeading(line);
    if (heading) { flushAll(); blocks.push({ type: 'h', text: heading }); continue; }

    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      flushPara();
      if (!list || list.ordered) { flushList(); list = { ordered: false, items: [] }; }
      list.items.push(bullet[1]);
      continue;
    }

    const numbered = line.match(/^(\d+)[.)]\s+(.*)$/);
    if (numbered) {
      flushPara();
      if (!list || !list.ordered) { flushList(); list = { ordered: true, items: [] }; }
      list.items.push(numbered[2]);
      continue;
    }

    flushList();
    para.push(line);
  }
  flushAll();

  const gap = dense ? 'space-y-1.5' : 'space-y-3';

  return (
    <div className={`${gap} text-sm leading-relaxed text-text-secondary ${className}`}>
      {blocks.map((b, i) => {
        if (b.type === 'h') {
          return (
            <h4 key={i} className="text-xs font-semibold uppercase tracking-wide text-primary pt-1">
              {b.text}
            </h4>
          );
        }
        if (b.type === 'verdict') {
          return (
            <div key={i} className="flex flex-wrap items-baseline gap-2 pt-1">
              <span className="text-xs uppercase tracking-wide text-text-secondary">Verdict</span>
              <span className={`font-bold ${VERDICT_TONE[b.verdict] || 'text-text-primary'}`}>
                {b.verdict}
              </span>
              {b.rest && b.rest.toUpperCase() !== b.verdict && (
                <span className="text-text-secondary">{inline(b.rest, `v${i}`)}</span>
              )}
            </div>
          );
        }
        if (b.type === 'list') {
          const Tag = b.ordered ? 'ol' : 'ul';
          return (
            <Tag
              key={i}
              className={`${b.ordered ? 'list-decimal' : 'list-disc'} pl-5 space-y-1 marker:text-text-secondary`}
            >
              {b.items.map((it, j) => <li key={j}>{inline(it, `l${i}-${j}`)}</li>)}
            </Tag>
          );
        }
        return <p key={i}>{inline(b.text, `p${i}`)}</p>;
      })}
    </div>
  );
}
