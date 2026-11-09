/**
 * A follow-domain error that carries the HTTP status the controller should
 * return. The controller reads `error.status` (falling back to 400) so the
 * client can branch on the status code instead of string-matching the message.
 * Mirrors ConnectionError.
 */
export class FollowError extends Error {
    constructor(message: string, public readonly status: number) {
        super(message);
        this.name = 'FollowError';
    }
}
