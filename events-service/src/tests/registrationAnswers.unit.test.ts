import { Types } from 'mongoose';
import { buildRegistrationAnswers, EventQuestion } from '../utils/registrationAnswers';

const q = (over: Partial<EventQuestion> = {}): EventQuestion => ({
  _id: new Types.ObjectId(),
  label: 'Your experience?',
  type: 'text',
  ...over,
});

describe('buildRegistrationAnswers (pure)', () => {
  it('returns [] when the event has no questions (ignores incoming)', () => {
    const r = buildRegistrationAnswers({ registration: { questions: [] } }, [{ label: 'x', value: 'y' }]);
    expect(r.error).toBeUndefined();
    expect(r.answers).toEqual([]);
  });

  it('handles a missing/undefined event or registration gracefully', () => {
    expect(buildRegistrationAnswers(undefined, []).answers).toEqual([]);
    expect(buildRegistrationAnswers({}, [{ value: 'x' }]).answers).toEqual([]);
  });

  it('matches an answer by questionId and snapshots label + type', () => {
    const question = q({ type: 'text' });
    const r = buildRegistrationAnswers(
      { registration: { questions: [question] } },
      [{ questionId: String(question._id), value: '  5 years  ' }],
    );
    expect(r.error).toBeUndefined();
    expect(r.answers).toHaveLength(1);
    expect(r.answers[0]).toMatchObject({ label: 'Your experience?', type: 'text', value: '5 years' });
    expect(String(r.answers[0].questionId)).toBe(String(question._id));
  });

  it('falls back to matching by label when questionId is absent', () => {
    const question = q({ label: 'Instagram handle', type: 'link' });
    const r = buildRegistrationAnswers(
      { registration: { questions: [question] } },
      [{ label: 'instagram handle', value: 'https://insta/x' }],
    );
    expect(r.answers).toHaveLength(1);
    expect(r.answers[0].value).toBe('https://insta/x');
  });

  it('drops answers that match no known question', () => {
    const r = buildRegistrationAnswers(
      { registration: { questions: [q()] } },
      [{ questionId: String(new Types.ObjectId()), value: 'orphan' }],
    );
    expect(r.answers).toEqual([]);
  });

  it('normalizes a yes_no boolean and a multi-value array', () => {
    const yn = q({ label: 'Bringing a partner?', type: 'yes_no' });
    const multi = q({ label: 'Styles', type: 'choice', options: ['Kathak', 'Bharatanatyam', 'Odissi'] });
    const r = buildRegistrationAnswers(
      { registration: { questions: [yn, multi] } },
      [
        { questionId: String(yn._id), value: true },
        { questionId: String(multi._id), value: ['Kathak', 'Odissi'] },
      ],
    );
    expect(r.error).toBeUndefined();
    expect(r.answers.find((a) => a.label === 'Bringing a partner?')?.value).toBe('yes');
    expect(r.answers.find((a) => a.label === 'Styles')?.value).toBe('Kathak, Odissi');
  });

  it('rejects a choice value outside the question options', () => {
    const choice = q({ label: 'Level', type: 'choice', options: ['Beginner', 'Advanced'] });
    const r = buildRegistrationAnswers(
      { registration: { questions: [choice] } },
      [{ questionId: String(choice._id), value: 'Expert' }],
    );
    expect(r.answers).toEqual([]);
    expect(r.error).toMatch(/Invalid option "Expert"/);
  });

  it('rejects when a required question has no (non-empty) answer', () => {
    const required = q({ label: 'Why you?', type: 'text', required: true });
    const optional = q({ label: 'Anything else?', type: 'text', required: false });
    const r = buildRegistrationAnswers(
      { registration: { questions: [required, optional] } },
      [{ questionId: String(optional._id), value: 'nope' }],
    );
    expect(r.answers).toEqual([]);
    expect(r.error).toMatch(/Missing required answer\(s\): Why you\?/);
  });

  it('passes when all required questions are answered', () => {
    const required = q({ label: 'Why you?', type: 'text', required: true });
    const r = buildRegistrationAnswers(
      { registration: { questions: [required] } },
      [{ questionId: String(required._id), value: 'I dance daily' }],
    );
    expect(r.error).toBeUndefined();
    expect(r.answers).toHaveLength(1);
  });
});
