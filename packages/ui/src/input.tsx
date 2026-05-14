import type { InputHTMLAttributes, ReactElement, TextareaHTMLAttributes } from 'react';
import { cn } from './cn.js';

const baseInput =
  'block w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 ' +
  'focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 ' +
  'disabled:bg-zinc-50 disabled:text-zinc-500 disabled:cursor-not-allowed ' +
  'dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 ' +
  'dark:focus:border-zinc-100 dark:focus:ring-zinc-100/10 ' +
  'dark:disabled:bg-zinc-950 dark:disabled:text-zinc-500';

export function Input(props: InputHTMLAttributes<HTMLInputElement>): ReactElement {
  return <input {...props} className={cn(baseInput, props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>): ReactElement {
  return (
    <textarea {...props} className={cn(baseInput, 'min-h-[80px] resize-y', props.className)} />
  );
}
