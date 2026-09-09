import { maskSensitiveData } from "./masking.js";

export type SerializedValue = unknown;

export function serializeValue(value: unknown): SerializedValue {
  return serialize(value, new WeakSet<object>());
}

function serialize(value: unknown, seen: WeakSet<object>): unknown {
  if (
    value === undefined ||
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return `[${typeof value}]`;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error)
    return { name: value.name, message: value.message, stack: value.stack };
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value))
    return { _requestLab: { kind: "binary", byteLength: value.byteLength } };
  const objectValue = value as object;
  if (seen.has(objectValue)) return "[Circular]";
  seen.add(objectValue);
  if (Array.isArray(value)) return value.map((item) => serialize(item, seen));
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(objectValue)) {
    try {
      output[key] = serialize(child, seen);
    } catch {
      output[key] = "[Unserializable]";
    }
  }
  return output;
}

export function prepareValue(value: unknown, maxBodyBytes: number): unknown {
  const serialized = serializeValue(maskSensitiveData(value));
  const bytes = Buffer.byteLength(JSON.stringify(serialized ?? null), "utf8");
  if (bytes <= maxBodyBytes) return serialized;
  return { _requestLab: { truncated: true, byteLength: bytes } };
}
