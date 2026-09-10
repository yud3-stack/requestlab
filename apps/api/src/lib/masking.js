const sensitiveKeys = new Set([
    "authorization",
    "cookie",
    "setcookie",
    "password",
    "token",
    "accesstoken",
    "refreshtoken",
    "secret",
    "apikey",
    "creditcard",
    "cvv"
]);
const redacted = "[REDACTED]";
function keyName(value) {
    return value.toLowerCase().replace(/[-_]/g, "");
}
export function maskSensitiveData(input) {
    if (Array.isArray(input)) {
        return input.map((item) => maskSensitiveData(item));
    }
    if (input !== null && typeof input === "object") {
        const output = {};
        for (const [key, value] of Object.entries(input)) {
            output[key] = sensitiveKeys.has(keyName(key)) ? redacted : maskSensitiveData(value);
        }
        return output;
    }
    return input;
}
export const MAX_HEADERS_BYTES = 32 * 1024;
export const MAX_JSON_BYTES = 128 * 1024;
export function assertPayloadSize(value, maxBytes, label) {
    const bytes = Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
    if (bytes > maxBytes) {
        throw new Error(`${label} exceeds the maximum allowed size`);
    }
}
//# sourceMappingURL=masking.js.map