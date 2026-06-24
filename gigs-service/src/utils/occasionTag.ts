// src/utils/occasionTag.ts
/**
 * Occasion is FREE TEXT (spec decision 7). This derives an optional tag for
 * analytics + budget anchors when the text matches a known occasion. Unmatched
 * text is fine — tag stays null.
 */
export const KNOWN_OCCASIONS: Array<{ tag: string; aliases: string[] }> = [
    { tag: 'sangeet', aliases: ['sangeet'] },
    { tag: 'wedding', aliases: ['wedding', 'shaadi', 'reception'] },
    { tag: 'haldi', aliases: ['haldi'] },
    { tag: 'mehendi', aliases: ['mehendi', 'mehndi'] },
    { tag: 'corporate', aliases: ['corporate', 'offsite', 'office party', 'launch event'] },
    { tag: 'college_fest', aliases: ['college fest', 'college', 'fest'] },
    { tag: 'birthday', aliases: ['birthday'] },
    { tag: 'garba', aliases: ['garba', 'dandiya'] },
    { tag: 'private_party', aliases: ['private party', 'house party'] },
];

export const deriveOccasionTag = (text?: string): string | null => {
    const t = (text || '').trim().toLowerCase();
    if (!t) return null;
    for (const occ of KNOWN_OCCASIONS) {
        if (occ.aliases.some((a) => t === a || t.includes(a))) return occ.tag;
    }
    return null;
};
