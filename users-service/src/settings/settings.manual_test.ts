/**
 * Settings PATCH Endpoint — Test Cases
 *
 * Standalone test script. Run with:
 *   npx ts-node src/settings/settings.test.ts
 *
 * Tests validate Zod schema logic only (no DB / HTTP required).
 * For full integration tests, use curl against a running server.
 */

import { updateSettingsSchema, containsForbiddenKeys } from '../validators/settings.dto';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
    try {
        fn();
        passed++;
        console.log(`  ✅ ${name}`);
    } catch (err: any) {
        failed++;
        console.error(`  ❌ ${name}`);
        console.error(`     ${err.message}`);
    }
}

function assert(condition: boolean, message: string) {
    if (!condition) throw new Error(message);
}

console.log('\n═══ Settings PATCH — Test Suite ═══\n');

/* ───────────────────────────────────────────
 *  Test 1: Update only one nested field
 * ─────────────────────────────────────────── */
test('Update only one nested field (privacy.showEmail)', () => {
    const result = updateSettingsSchema.safeParse({
        privacy: { showEmail: true },
    });
    assert(result.success === true, 'Expected validation to pass');
    assert(result.data!.privacy!.showEmail === true, 'showEmail should be true');
    assert(result.data!.privacy!.profileVisibility === undefined, 'Other fields should be undefined (partial)');
    assert(result.data!.notifications === undefined, 'notifications should be undefined');
});

/* ───────────────────────────────────────────
 *  Test 2: Update multiple fields across sections
 * ─────────────────────────────────────────── */
test('Update multiple fields across sections', () => {
    const result = updateSettingsSchema.safeParse({
        privacy: { profileVisibility: 'private', showPhone: true },
        messaging: { readReceipts: false },
        account: { currency: 'USD' },
    });
    assert(result.success === true, 'Expected validation to pass');
    assert(result.data!.privacy!.profileVisibility === 'private', 'profileVisibility should be private');
    assert(result.data!.privacy!.showPhone === true, 'showPhone should be true');
    assert(result.data!.messaging!.readReceipts === false, 'readReceipts should be false');
    assert(result.data!.account!.currency === 'USD', 'currency should be USD');
});

/* ───────────────────────────────────────────
 *  Test 3: Reject invalid enum value
 * ─────────────────────────────────────────── */
test('Reject invalid profileVisibility enum', () => {
    const result = updateSettingsSchema.safeParse({
        privacy: { profileVisibility: 'INVALID_VALUE' },
    });
    assert(result.success === false, 'Expected validation to fail');
    const errors = result.error!.flatten();
    // Check that the error mentions privacy/profileVisibility
    const hasFieldError = JSON.stringify(errors).includes('profileVisibility') ||
        JSON.stringify(errors).includes('privacy');
    assert(hasFieldError, 'Error should reference profileVisibility or privacy');
});

/* ───────────────────────────────────────────
 *  Test 4: Reject unknown property
 * ─────────────────────────────────────────── */
test('Reject unknown property at top level', () => {
    const result = updateSettingsSchema.safeParse({
        privacy: { showEmail: true },
        unknownSection: { foo: 'bar' },
    });
    assert(result.success === false, 'Expected validation to fail due to unknown key');
});

test('Reject unknown property inside sub-schema', () => {
    const result = updateSettingsSchema.safeParse({
        privacy: { showEmail: true, hackField: 'pwned' },
    });
    assert(result.success === false, 'Expected validation to fail due to unknown key in privacy');
});

/* ───────────────────────────────────────────
 *  Test 5: Ensure defaults applied (empty object is valid)
 * ─────────────────────────────────────────── */
test('Empty object is valid (no fields to update)', () => {
    const result = updateSettingsSchema.safeParse({});
    assert(result.success === true, 'Empty object should be valid');
    assert(result.data!.privacy === undefined, 'All sections should be undefined');
    assert(result.data!.notifications === undefined, 'All sections should be undefined');
});

/* ───────────────────────────────────────────
 *  Test 6: Logical constraint — allowMessagesFrom + allowConnectionRequests
 * ─────────────────────────────────────────── */
test('Reject allowMessagesFrom=connections when allowConnectionRequests=false', () => {
    const result = updateSettingsSchema.safeParse({
        notifications: { allowConnectionRequests: false },
        messaging: { allowMessagesFrom: 'connections' },
    });
    assert(result.success === false, 'Expected validation to fail due to logical constraint');
    const errorJson = JSON.stringify(result.error!.flatten());
    assert(errorJson.includes('allowMessagesFrom'), 'Error should mention allowMessagesFrom');
});

test('Allow allowMessagesFrom=anyone when allowConnectionRequests=false', () => {
    const result = updateSettingsSchema.safeParse({
        notifications: { allowConnectionRequests: false },
        messaging: { allowMessagesFrom: 'anyone' },
    });
    assert(result.success === true, 'Expected validation to pass');
});

/* ───────────────────────────────────────────
 *  Test 7: Security — forbidden keys detection
 * ─────────────────────────────────────────── */
test('containsForbiddenKeys detects role', () => {
    const forbidden = containsForbiddenKeys({ role: 'admin', privacy: {} });
    assert(forbidden.includes('role'), 'Should detect role as forbidden');
});

test('containsForbiddenKeys detects kycStatus', () => {
    const forbidden = containsForbiddenKeys({ kycStatus: 'approved' });
    assert(forbidden.includes('kycStatus'), 'Should detect kycStatus as forbidden');
});

test('containsForbiddenKeys passes clean payload', () => {
    const forbidden = containsForbiddenKeys({ privacy: { showEmail: true } });
    assert(forbidden.length === 0, 'Should have no forbidden keys');
});

/* ───────────────────────────────────────────
 *  Test 8: Reject invalid types
 * ─────────────────────────────────────────── */
test('Reject string where boolean expected', () => {
    const result = updateSettingsSchema.safeParse({
        privacy: { showEmail: 'yes' },
    });
    assert(result.success === false, 'Expected validation to fail for wrong type');
});

test('Reject invalid allowMessagesFrom enum', () => {
    const result = updateSettingsSchema.safeParse({
        messaging: { allowMessagesFrom: 'everybody' },
    });
    assert(result.success === false, 'Expected validation to fail for invalid enum');
});

/* ═══ Summary ═══ */
console.log(`\n─── Results: ${passed} passed, ${failed} failed ───\n`);
process.exit(failed > 0 ? 1 : 0);
