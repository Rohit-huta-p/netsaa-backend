/** Escape user input before embedding in a RegExp — prevents pattern injection/CPU burn. */
export const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
