/**
 * Caps for the synchronous, all-or-nothing CSV product import (ADR 0008).
 * Deliberately conservative for a single transaction touching many tables —
 * revisit once there is real usage data.
 */
export const MAX_IMPORT_ROWS = 500

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024
