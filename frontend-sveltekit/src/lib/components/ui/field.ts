// What a <Field> tells the control inside it, so the label, hint and control stay linked
// without passing ids around: <Field label="Email"><Input type="email" bind:value /></Field>.

import { getContext, setContext } from 'svelte';

export interface FieldContext {
  readonly id: string;
  /** The hint's id and any the field was given (a form error), for aria-describedby. */
  readonly describedby: string | undefined;
  readonly invalid: boolean;
}

const key = Symbol('field');

export const setField = (field: FieldContext) => setContext(key, field);

export const getField = (): FieldContext | undefined => getContext(key);

/** Joins ids for aria-describedby, leaving out the empty ones; undefined when none are left. */
export const ids = (...list: (string | undefined | null | false)[]) =>
  list.filter(Boolean).join(' ') || undefined;
