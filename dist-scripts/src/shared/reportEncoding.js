const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(36).padStart(7, "0");
}
function encodeBase64(bytes) {
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const hasSecond = typeof second === "number";
    const hasThird = typeof third === "number";
    const chunk = first << 16 | (second ?? 0) << 8 | (third ?? 0);
    output += BASE64_CHARS[chunk >> 18 & 63];
    output += BASE64_CHARS[chunk >> 12 & 63];
    output += hasSecond ? BASE64_CHARS[chunk >> 6 & 63] : "=";
    output += hasThird ? BASE64_CHARS[chunk & 63] : "=";
  }
  return output;
}
function decodeBase64(value) {
  const sanitized = value.replace(/\s/g, "");
  const bytes = [];
  for (let index = 0; index < sanitized.length; index += 4) {
    const chars = sanitized.slice(index, index + 4);
    const first = BASE64_CHARS.indexOf(chars[0] ?? "");
    const second = BASE64_CHARS.indexOf(chars[1] ?? "");
    const third = chars[2] === "=" ? -1 : BASE64_CHARS.indexOf(chars[2] ?? "");
    const fourth = chars[3] === "=" ? -1 : BASE64_CHARS.indexOf(chars[3] ?? "");
    if (first < 0 || second < 0 || third < 0 && chars[2] !== "=" || fourth < 0 && chars[3] !== "=") {
      throw new Error("Invalid base64 data.");
    }
    const chunk = first << 18 | second << 12 | (third < 0 ? 0 : third) << 6 | (fourth < 0 ? 0 : fourth);
    bytes.push(chunk >> 16 & 255);
    if (third >= 0) {
      bytes.push(chunk >> 8 & 255);
    }
    if (fourth >= 0) {
      bytes.push(chunk & 255);
    }
  }
  return new Uint8Array(bytes);
}
function encodeBase64Url(value) {
  return encodeBase64(new TextEncoder().encode(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function decodeBase64Url(value) {
  const padded = `${value}${"=".repeat((4 - value.length % 4) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  return new TextDecoder().decode(decodeBase64(padded));
}
export {
  decodeBase64Url,
  encodeBase64Url,
  hashString,
  stableStringify
};
//# sourceMappingURL=reportEncoding.js.map
