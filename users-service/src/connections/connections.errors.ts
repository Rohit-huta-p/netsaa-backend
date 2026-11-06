/**
 * A connection-domain error that carries the HTTP status the controller should
 * return. The controller reads `error.status` (falling back to 400), so the
 * client can branch on the status code — 404 (gone), 409 (already resolved),
 * 403 (not yours) — instead of string-matching the message.
 */
export class ConnectionError extends Error {
    constructor(message: string, public readonly status: number) {
        super(message);
        this.name = 'ConnectionError';
    }
}
