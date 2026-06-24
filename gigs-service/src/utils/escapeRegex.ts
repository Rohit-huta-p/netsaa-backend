/** Escape user input before embedding in a $regex — prevents pattern injection/CPU burn. */
export const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
