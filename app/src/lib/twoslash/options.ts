import { Twoslash } from 'monoshot'

/** What every surface compiles a snippet with, so they all resolve the same. */
export const compilerOptions = Twoslash.compilerOptions

/** The dialect the language service reads a highlighted language as. */
export const dialects = { javascript: 'js', jsx: 'jsx', tsx: 'tsx', typescript: 'ts' } as const
