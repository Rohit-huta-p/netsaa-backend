// External provider wrappers — Expo push, transactional email, MSG91 SMS.
// Real integrations land in Sprint 8 hardening; these are the seams the dispatcher calls.
export async function sendPush(userId: string, title: string, body: string): Promise<boolean> {
  // TODO(sprint8): Expo push. For now log + succeed so the queue advances in staging.
  console.log(`[push] ${userId}: ${title}`);
  return true;
}
export async function sendEmail(userId: string, subject: string, body: string): Promise<boolean> {
  console.log(`[email] ${userId}: ${subject}`);
  return true;
}
export async function sendSms(userId: string, body: string): Promise<boolean> {
  console.log(`[sms] ${userId}: ${body.slice(0, 40)}`);
  return true;
}
