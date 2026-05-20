export type RegistryConnectionConfig = {
  registryUrl: string;
  username?: string;
  password?: string;
  pageSize: number;
  requestTimeoutSeconds: number;
};

export type RegistryError = {
  code: string;
  message: string;
  detail?: unknown;
};

export type StatusResponse = {
  registryUrl: string;
  available: boolean;
  authenticated: boolean;
  pageSize: number;
  requestTimeout: string;
  insecureTLS: boolean;
  deleteCapability: "unknown" | "available" | "unavailable";
  error?: ApiErrorPayload;
};

export type ApiErrorPayload = {
  code: string;
  message: string;
  status: number;
  registryStatus?: number;
  registryErrors?: RegistryError[];
};

export type RepositoryResponse = {
  repositories: string[];
  pagination: RegistryPagination;
};

export type TagsResponse = {
  repository: string;
  tags: string[];
  pagination: RegistryPagination;
};

export type ManifestDescriptor = {
  mediaType: string;
  size: number;
  digest: string;
  platform?: {
    architecture?: string;
    os?: string;
    variant?: string;
  };
};

export type ManifestResponse = {
  repository: string;
  reference: string;
  digest: string;
  mediaType: string;
  schemaVersion: number;
  size: number;
  layers?: ManifestDescriptor[];
  manifests?: ManifestDescriptor[];
  raw: unknown;
};

export type DigestResponse = {
  repository: string;
  reference: string;
  digest: string;
  contentType: string;
};

export type DeleteManifestResponse = {
  deleted: boolean;
  repository: string;
  digest: string;
  status: number;
};

export type RegistryPagination = {
  next?: string;
  hasNext: boolean;
};

export type RegistryClient = ReturnType<typeof createRegistryClient>;

type RegistryClientOptions = {
  config: RegistryConnectionConfig;
  fetcher?: typeof fetch;
};

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_TIMEOUT_SECONDS = 30;
const MANIFEST_ACCEPT = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.docker.distribution.manifest.v2+json",
  "application/vnd.docker.distribution.manifest.v1+prettyjws"
].join(", ");

export function registryConfigFromEnv(env: Record<string, unknown>): RegistryConnectionConfig | null {
  const registryUrl = normalizeRegistryUrl(stringValue(env.VITE_REGISTRY_URL));
  if (!registryUrl) {
    return null;
  }

  return {
    registryUrl,
    username: stringValue(env.VITE_REGISTRY_USERNAME),
    password: stringValue(env.VITE_REGISTRY_PASSWORD),
    pageSize: DEFAULT_PAGE_SIZE,
    requestTimeoutSeconds: numberValue(env.VITE_REGISTRY_REQUEST_TIMEOUT_SECONDS, DEFAULT_TIMEOUT_SECONDS)
  };
}

export function createRegistryClient({ config, fetcher = fetch }: RegistryClientOptions) {
  async function registryFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), config.requestTimeoutSeconds * 1000);

    try {
      const response = await fetcher(registryUrlFor(config.registryUrl, path), {
        ...init,
        headers: registryHeaders(config, init.headers),
        signal: controller.signal
      });
      return response;
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }

  async function requestJson<T>(path: string, init: RequestInit = {}): Promise<{ response: Response; body: T }> {
    const response = await registryFetch(path, init);
    if (!response.ok) {
      throw await apiErrorFromResponse(response);
    }
    return { response, body: (await response.json()) as T };
  }

  return {
    config,
    async status(): Promise<StatusResponse> {
      try {
        const response = await registryFetch("/v2/");
        if (response.ok) {
          return statusFrom(config, true, true);
        }
        if (response.status === 401) {
          return statusFrom(config, true, false, await apiErrorFromResponse(response));
        }
        return statusFrom(config, false, false, await apiErrorFromResponse(response));
      } catch (error) {
        return statusFrom(config, false, false, normalizeUnknownError(error));
      }
    },
    async listRepositories(last = ""): Promise<RepositoryResponse> {
      const query = new URLSearchParams({ n: String(config.pageSize) });
      if (last) {
        query.set("last", last);
      }
      const { response, body } = await requestJson<{ repositories?: string[] }>(`/v2/_catalog?${query.toString()}`);
      return {
        repositories: body.repositories ?? [],
        pagination: parseRegistryLinkHeader(response.headers.get("Link"))
      };
    },
    async listTags(repository: string, last = ""): Promise<TagsResponse> {
      const query = new URLSearchParams({ n: String(config.pageSize) });
      if (last) {
        query.set("last", last);
      }
      const { response, body } = await requestJson<{ name?: string; tags?: string[] | null }>(
        `/v2/${repositoryPath(repository)}/tags/list?${query.toString()}`
      );
      return {
        repository: body.name ?? repository,
        tags: body.tags ?? [],
        pagination: parseRegistryLinkHeader(response.headers.get("Link"))
      };
    },
    async getDigest(repository: string, reference: string): Promise<DigestResponse> {
      const response = await registryFetch(`/v2/${repositoryPath(repository)}/manifests/${encodeURIComponent(reference)}`, {
        method: "HEAD",
        headers: { Accept: MANIFEST_ACCEPT }
      });
      if (!response.ok) {
        throw await apiErrorFromResponse(response);
      }
      return {
        repository,
        reference,
        digest: response.headers.get("Docker-Content-Digest") ?? "",
        contentType: response.headers.get("Content-Type") ?? ""
      };
    },
    async getManifest(repository: string, reference: string): Promise<ManifestResponse> {
      const { response, body } = await requestJson<{
        schemaVersion?: number;
        mediaType?: string;
        layers?: ManifestDescriptor[];
        manifests?: ManifestDescriptor[];
      }>(`/v2/${repositoryPath(repository)}/manifests/${encodeURIComponent(reference)}`, {
        headers: { Accept: MANIFEST_ACCEPT }
      });

      const raw = body as unknown;
      const serialized = JSON.stringify(raw);
      return {
        repository,
        reference,
        digest: response.headers.get("Docker-Content-Digest") ?? "",
        mediaType: body.mediaType ?? response.headers.get("Content-Type") ?? "",
        schemaVersion: body.schemaVersion ?? 0,
        size: Number(response.headers.get("Content-Length")) || serialized.length,
        layers: body.layers,
        manifests: body.manifests,
        raw
      };
    },
    async deleteManifest(repository: string, digest: string): Promise<DeleteManifestResponse> {
      const response = await registryFetch(`/v2/${repositoryPath(repository)}/manifests/${encodeURIComponent(digest)}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        throw await apiErrorFromResponse(response);
      }
      return {
        deleted: true,
        repository,
        digest,
        status: response.status
      };
    }
  };
}

export function parseRegistryLinkHeader(linkHeader: string | null): RegistryPagination {
  if (!linkHeader) {
    return { hasNext: false };
  }

  const nextLink = linkHeader
    .split(",")
    .map((part) => part.trim())
    .find((part) => /rel="?next"?/.test(part));

  if (!nextLink) {
    return { hasNext: false };
  }

  const match = nextLink.match(/<([^>]+)>/);
  if (!match) {
    return { hasNext: false };
  }

  try {
    const linkUrl = new URL(match[1], "https://registry.local");
    const next = linkUrl.searchParams.get("last") ?? undefined;
    return { next, hasNext: Boolean(next) };
  } catch {
    return { hasNext: false };
  }
}

export function normalizeRegistryUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "";
  }
  try {
    const parsed = new URL(trimmed);
    if (!parsed.protocol || !parsed.host) {
      return "";
    }
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

async function apiErrorFromResponse(response: Response): Promise<ApiErrorPayload> {
  let registryErrors: RegistryError[] = [];
  try {
    const body = (await response.clone().json()) as { errors?: RegistryError[] };
    registryErrors = body.errors ?? [];
  } catch {
    registryErrors = [];
  }

  const { code, message } = registryErrorCodeAndMessage(response.status, registryErrors);
  return {
    code,
    message,
    status: response.status,
    registryStatus: response.status,
    registryErrors
  };
}

function registryErrorCodeAndMessage(status: number, registryErrors: RegistryError[]) {
  if (registryErrors.some((error) => error.code.toUpperCase() === "UNSUPPORTED")) {
    return { code: "REGISTRY_UNSUPPORTED", message: "Registry reports this operation is unsupported." };
  }

  if (status === 401) {
    return { code: "REGISTRY_UNAUTHORIZED", message: "Registry authentication failed." };
  }
  if (status === 404) {
    return { code: "REGISTRY_NOT_FOUND", message: "Registry resource was not found." };
  }
  if (status === 405) {
    return { code: "REGISTRY_METHOD_NOT_ALLOWED", message: "Registry does not allow this operation." };
  }
  if (status >= 500) {
    return { code: "REGISTRY_SERVER_ERROR", message: "Registry returned a server error." };
  }
  return { code: "REGISTRY_ERROR", message: "Registry request failed." };
}

function normalizeUnknownError(error: unknown): ApiErrorPayload {
  const message = error instanceof Error && error.name === "AbortError"
    ? "Registry request timed out."
    : "Registry request failed. Check the Registry URL, browser CORS policy, and credentials.";
  return {
    code: "REGISTRY_REQUEST_FAILED",
    message,
    status: 0
  };
}

function statusFrom(
  config: RegistryConnectionConfig,
  available: boolean,
  authenticated: boolean,
  error?: ApiErrorPayload
): StatusResponse {
  return {
    registryUrl: config.registryUrl,
    available,
    authenticated,
    pageSize: config.pageSize,
    requestTimeout: `${config.requestTimeoutSeconds}s`,
    insecureTLS: false,
    deleteCapability: "unknown",
    error
  };
}

function registryHeaders(config: RegistryConnectionConfig, headers: HeadersInit = {}): Headers {
  const nextHeaders = new Headers(headers);
  if (config.username || config.password) {
    nextHeaders.set("Authorization", `Basic ${base64(`${config.username ?? ""}:${config.password ?? ""}`)}`);
  }
  return nextHeaders;
}

function registryUrlFor(registryUrl: string, path: string): string {
  return `${registryUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function repositoryPath(repository: string): string {
  return repository.split("/").map(encodeURIComponent).join("/");
}

function base64(value: string): string {
  return btoa(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
