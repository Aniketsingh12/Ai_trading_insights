import { Info } from 'lucide-react';
import { GLOSSARY } from '../lib/glossary';

// Small ⓘ icon with a hover tooltip. Pass `term` (glossary lookup) or raw `text`.
export default function InfoTip({ term, text, className = '' }) {
  const content = text || GLOSSARY[term] || '';
  if (!content) return null;
  return (
    <span className={`relative inline-flex group align-middle ${className}`}>
      <Info size={13} className="text-text-secondary hover:text-primary cursor-help" />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-56 z-50
                   opacity-0 group-hover:opacity-100 transition-opacity duration-150
                   bg-bg border border-border rounded-lg p-2 text-xs font-normal normal-case
                   text-text-primary leading-snug shadow-xl"
      >
        {content}
      </span>
    </span>
  );
}
