import { Types } from 'mongoose';

/**
 * Custom registration question answers (gap §6a-a).
 *
 * Pure (no DB, no network): resolves an attendee's incoming answers against the
 * event's configured questions (`event.registration.questions`) and returns the
 * array to persist on the Registration / Reservation.
 *
 * Why snapshot label+type: `composerMapping.cleanQuestions` strips the question
 * `_id`, so Mongoose re-mints subdoc ids every time the host edits the event's
 * questions — a bare `questionId` link therefore CHURNS. Storing label+type with
 * each answer means the host-side display survives those edits; `questionId` is
 * kept as a best-effort link.
 */

export interface EventQuestion {
  _id?: Types.ObjectId;
  label: string;
  type: string;                 // 'text' | 'choice' | 'link' | 'photo' | 'yes_no'
  options?: string[];
  required?: boolean;
}

export interface IncomingAnswer {
  questionId?: string;
  label?: string;
  value?: unknown;              // string | string[] | boolean | number
}

export interface StoredAnswer {
  questionId?: Types.ObjectId;
  label: string;
  type: string;
  value: string;                // normalized to a display string
}

export interface BuildAnswersResult {
  answers: StoredAnswer[];
  error?: string;               // set → caller should 400 with this message
}

/** Normalize an incoming value to a single display string. */
function normalizeValue(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean).join(', ');
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return String(value).trim();
}

/**
 * Resolve incoming answers against the event's questions.
 *  - No questions configured → returns [] (incoming ignored; open-door stays open).
 *  - Answers that match no known question are dropped (defensive).
 *  - `choice` answers must be within the question's options, else `error`.
 *  - Every `required` question must have a non-empty answer, else `error`.
 */
export function buildRegistrationAnswers(
  event: { registration?: { questions?: EventQuestion[] } | null } | null | undefined,
  incoming: unknown,
): BuildAnswersResult {
  const questions: EventQuestion[] = event?.registration?.questions ?? [];
  if (!questions.length) return { answers: [] };

  const incomingArr: IncomingAnswer[] = Array.isArray(incoming) ? incoming : [];

  const byId = new Map<string, EventQuestion>();
  const byLabel = new Map<string, EventQuestion>();
  for (const q of questions) {
    if (q?._id) byId.set(String(q._id), q);
    if (q?.label) byLabel.set(String(q.label).toLowerCase(), q);
  }

  const stored: StoredAnswer[] = [];
  for (const a of incomingArr) {
    if (!a || typeof a !== 'object') continue;
    const q =
      (a.questionId && byId.get(String(a.questionId))) ||
      (a.label && byLabel.get(String(a.label).toLowerCase())) ||
      undefined;
    if (!q) continue;

    const value = normalizeValue(a.value);

    if (q.type === 'choice' && value) {
      const opts = Array.isArray(q.options) ? q.options.map((o) => String(o)) : [];
      const bad = value.split(', ').find((s) => !opts.includes(s));
      if (bad) return { answers: [], error: `Invalid option "${bad}" for "${q.label}"` };
    }

    stored.push({ questionId: q._id, label: String(q.label), type: String(q.type), value });
  }

  const missing: string[] = [];
  for (const q of questions) {
    if (!q?.required) continue;
    const ans = stored.find(
      (s) =>
        (q._id != null && String(s.questionId) === String(q._id)) ||
        s.label.toLowerCase() === String(q.label).toLowerCase(),
    );
    if (!ans || !ans.value) missing.push(String(q.label));
  }
  if (missing.length) return { answers: [], error: `Missing required answer(s): ${missing.join(', ')}` };

  return { answers: stored };
}
