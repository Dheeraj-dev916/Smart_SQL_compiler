import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from './button';
import { Tip } from './tooltip';
import { useToast } from './toast';
import { copyText } from '@/utils/download';

/** Icon button that copies text to the clipboard and confirms with a toast. */
export function CopyButton({ text, label = 'Copy', size = 'icon', className }: { text: string | (() => string); label?: string; size?: 'icon' | 'sm'; className?: string }) {
  const { toast } = useToast();
  const [done, setDone] = React.useState(false);
  const onClick = async () => {
    const value = typeof text === 'function' ? text() : text;
    const ok = await copyText(value);
    if (ok) {
      setDone(true);
      toast({ kind: 'success', title: 'Copied to clipboard' });
      window.setTimeout(() => setDone(false), 1500);
    } else {
      toast({ kind: 'error', title: 'Could not copy', description: 'Your browser blocked clipboard access. Select the text and copy it manually.' });
    }
  };
  const icon = done ? <Check className="text-success" /> : <Copy />;
  return (
    <Tip label={label}>
      <Button type="button" variant="ghost" size={size === 'icon' ? 'icon' : 'sm'} className={className} onClick={onClick} aria-label={label}>
        {icon}
        {size === 'sm' && <span>{done ? 'Copied' : label}</span>}
      </Button>
    </Tip>
  );
}
