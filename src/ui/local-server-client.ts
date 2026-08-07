/**
 * Local-server write client. Only used in `npm run serve` mode: it fetches the
 * same-origin startup token, submits base64 SVGs to the local build API, and
 * can request "open in Finder". The static website build never includes this
 * module's write path.
 */

export interface LocalBuildRequest {
  readonly groupId: string;
  readonly displayName: string;
  readonly styleId: string;
  readonly author: { name: string };
  readonly selectedIds: readonly string[];
  readonly svgs: Readonly<Record<string, string>>;
}

export interface LocalBuildResponse {
  readonly ok: boolean;
  readonly build?: { id: string; checksum: string; fileCount: number };
  readonly error?: string;
  readonly errors?: readonly string[];
}

export async function fetchLocalConfig(): Promise<{ token: string } | undefined> {
  try {
    const res = await fetch("/api/config", { method: "GET" });
    if (!res.ok) return undefined;
    return (await res.json()) as { token: string };
  } catch {
    return undefined;
  }
}

export async function submitLocalBuild(
  token: string,
  request: LocalBuildRequest,
): Promise<LocalBuildResponse> {
  const res = await fetch("/api/builds", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-moeicons-token": token,
    },
    body: JSON.stringify(request),
  });
  const payload = (await res.json()) as LocalBuildResponse;
  return payload;
}

export async function openLocalBuildDir(token: string, buildId: string): Promise<boolean> {
  const res = await fetch(`/api/builds/${buildId}/open`, {
    method: "POST",
    headers: { "x-moeicons-token": token },
  });
  return res.ok;
}
