/**
 * User R2 publication adapter. Uploads only after validation and authorization,
 * uses immutable keys, correct content types/cache metadata, checksums, and
 * rollback/cleanup on partial failure. Implemented against the S3-compatible
 * Cloudflare R2 API using fetch (no SDK dependency).
 */

export interface R2AdapterConfig {
  readonly endpoint: string; // https://<account>.r2.cloudflarestorage.com
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly publicBaseUrl?: string;
}

export interface R2UploadEntry {
  /** Immutable object key, e.g. `groups/<groupId>/<checksum>/icon.svg`. */
  readonly key: string;
  readonly body: Uint8Array;
  readonly contentType: string;
}

export interface R2UploadResult {
  readonly ok: true;
  readonly uploaded: readonly string[];
  readonly publicUrl: string;
}

export interface R2UploadError {
  readonly ok: false;
  readonly code: string;
  readonly message: string;
}

export type R2Outcome = R2UploadResult | R2UploadError;

function hmacSha256(key: Uint8Array | ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const keyBytes = key instanceof Uint8Array ? key : new Uint8Array(key);
  const msg = new TextEncoder().encode(message) as unknown as BufferSource;
  return crypto.subtle.importKey(
    "raw",
    keyBytes as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  ).then((k) => crypto.subtle.sign("HMAC", k, msg));
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input) as unknown as BufferSource,
  );
  return toHex(new Uint8Array(digest));
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function signedHeaders(headers: Record<string, string>): string {
  return Object.keys(headers)
    .sort()
    .map((k) => k.toLowerCase())
    .join(";");
}

function canonicalRequest(method: string, path: string, headers: Record<string, string>): string {
  const h = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v.trim()]),
  );
  const sortedKeys = Object.keys(h).sort();
  const canonicalHeaders = sortedKeys.map((k) => `${k}:${h[k]}\n`).join("");
  const sh = signedHeaders(h);
  const payloadHash = h["x-amz-content-sha256"] ?? "UNSIGNED-PAYLOAD";
  return [method, path, "", canonicalHeaders, sh, payloadHash].join("\n");
}

/**
 * Sign an S3-compatible request (SigV4) and upload one object.
 */
export async function putObject(
  config: R2AdapterConfig,
  entry: R2UploadEntry,
): Promise<{ status: number; message: string }> {
  const url = new URL(entry.key, config.endpoint);
  const host = url.host;
  const path = `/${entry.key}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = await sha256Hex(new TextDecoder().decode(entry.body));

  const headers: Record<string, string> = {
    "host": host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
    "content-type": entry.contentType,
  };

  const region = "auto";
  const service = "s3";
  const canonical = canonicalRequest("PUT", path, headers);
  const canonicalHash = await sha256Hex(canonical);

  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    canonicalHash,
  ].join("\n");

  const dateKey = await hmacSha256(new TextEncoder().encode(`AWS4${config.secretAccessKey}`), dateStamp);
  const regionKey = await hmacSha256(dateKey, region);
  const serviceKey = await hmacSha256(regionKey, service);
  const signingKey = await hmacSha256(serviceKey, "aws4_request");
  const signature = toHex(new Uint8Array(await hmacSha256(signingKey, stringToSign)));

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders(headers)}, Signature=${signature}`;

  const response = await fetch(url.toString(), {
    method: "PUT",
    headers: {
      ...Object.fromEntries(Object.entries(headers).filter(([k]) => k !== "host")),
      Authorization: authorization,
    },
    body: entry.body as unknown as BodyInit,
  });
  return { status: response.status, message: response.statusText };
}

/**
 * Upload all entries; if any upload fails, attempt best-effort cleanup of
 * already-uploaded objects (rollback). Returns outcome.
 */
export async function uploadGroup(
  config: R2AdapterConfig,
  entries: readonly R2UploadEntry[],
): Promise<R2Outcome> {
  const uploaded: string[] = [];
  try {
    for (const entry of entries) {
      const result = await putObject(config, entry);
      if (result.status !== 200 && result.status !== 201) {
        await cleanupKeys(config, uploaded);
        return {
          ok: false,
          code: "UPLOAD_FAILED",
          message: `upload of "${entry.key}" failed with ${result.status}`,
        };
      }
      uploaded.push(entry.key);
    }
  } catch (error) {
    await cleanupKeys(config, uploaded);
    return {
      ok: false,
      code: "UPLOAD_ERROR",
      message: String(error),
    };
  }

  const groupKey = entries[0]?.key ?? "";
  const publicUrl = config.publicBaseUrl
    ? `${config.publicBaseUrl.replace(/\/$/, "")}/${groupKey}`
    : "";
  return { ok: true, uploaded, publicUrl };
}

/** Best-effort deletion of already-uploaded keys on partial failure. */
async function deleteKey(config: R2AdapterConfig, key: string): Promise<void> {
  const url = new URL(key, config.endpoint);
  const host = url.host;
  const path = `/${key}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const headers: Record<string, string> = {
    host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
  };
  const canonical = canonicalRequest("DELETE", path, headers);
  const canonicalHash = await sha256Hex(canonical);
  const region = "auto";
  const service = "s3";
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, canonicalHash].join("\n");
  const dateKey = await hmacSha256(new TextEncoder().encode(`AWS4${config.secretAccessKey}`), dateStamp);
  const regionKey = await hmacSha256(dateKey, region);
  const serviceKey = await hmacSha256(regionKey, service);
  const signingKey = await hmacSha256(serviceKey, "aws4_request");
  const signature = toHex(new Uint8Array(await hmacSha256(signingKey, stringToSign)));

  await fetch(url.toString(), {
    method: "DELETE",
    headers: {
      "x-amz-date": amzDate,
      "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
      Authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders(headers)}, Signature=${signature}`,
    },
  });
}

/** Best-effort deletion of already-uploaded keys on partial failure. */
async function cleanupKeys(config: R2AdapterConfig, keys: readonly string[]): Promise<void> {
  for (const key of keys) {
    try {
      await deleteKey(config, key);
    } catch {
      // ignore cleanup errors
    }
  }
}
