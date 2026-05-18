import { FormEvent, useEffect, useMemo, useState } from "react";
import "./styles.css";

type AuthState = "checking" | "authenticated" | "anonymous";
type Page = "login" | "overview" | "repositories" | "settings";
type StatusResponse = {
  registryUrl: string;
  available: boolean;
  authenticated: boolean;
  pageSize: number;
  requestTimeout: string;
  insecureTLS: boolean;
  deleteCapability: "unknown" | "available" | "unavailable";
  error?: {
    code: string;
    message: string;
    status: number;
    registryStatus?: number;
    registryErrors?: RegistryError[];
  };
};
type RegistryError = {
  code: string;
  message: string;
  detail?: unknown;
};
type RepositoryResponse = {
  repositories: string[];
  pagination: {
    next?: string;
    hasNext: boolean;
  };
};
type TagsResponse = {
  repository: string;
  tags: string[];
  pagination: {
    next?: string;
    hasNext: boolean;
  };
};
type ManifestDescriptor = {
  mediaType: string;
  size: number;
  digest: string;
  platform?: {
    architecture?: string;
    os?: string;
    variant?: string;
  };
};
type ManifestResponse = {
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
type DigestResponse = {
  repository: string;
  reference: string;
  digest: string;
  contentType: string;
};
type DeleteManifestResponse = {
  deleted: boolean;
  repository: string;
  digest: string;
  status: number;
};
type ApiErrorResponse = {
  error?: {
    code: string;
    message: string;
    status: number;
    registryStatus?: number;
    registryErrors?: RegistryError[];
  };
};
type DeleteTarget = {
  tag: string;
  digest: string;
};

const protectedPages = new Set<Page>(["overview", "repositories", "settings"]);

function pageFromPath(pathname: string): Page {
  if (pathname.startsWith("/repositories")) {
    return "repositories";
  }
  if (pathname.startsWith("/settings")) {
    return "settings";
  }
  if (pathname.startsWith("/login")) {
    return "login";
  }
  return "overview";
}

function pathForPage(page: Page): string {
  if (page === "login") {
    return "/login";
  }
  return `/${page}`;
}

function repositoryNameFromPath(pathname: string): string {
  const prefix = "/repositories/";
  if (!pathname.startsWith(prefix)) {
    return "";
  }
  const encodedName = pathname.slice(prefix.length).split("/")[0];
  if (!encodedName) {
    return "";
  }
  try {
    return decodeURIComponent(encodedName);
  } catch {
    return "";
  }
}

function manifestRouteFromPath(pathname: string): { repository: string; reference: string } | null {
  const prefix = "/repositories/";
  const marker = "/manifests/";
  if (!pathname.startsWith(prefix) || !pathname.includes(marker)) {
    return null;
  }
  const body = pathname.slice(prefix.length);
  const [encodedRepository, encodedReference] = body.split(marker);
  if (!encodedRepository || !encodedReference) {
    return null;
  }
  try {
    return {
      repository: decodeURIComponent(encodedRepository),
      reference: decodeURIComponent(encodedReference)
    };
  } catch {
    return null;
  }
}

function repositoryPath(repository: string): string {
  return `/repositories/${encodeURIComponent(repository)}`;
}

function pullRegistryHost(registryUrl: string): string {
  try {
    return new URL(registryUrl).host;
  } catch {
    return registryUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
}

export function App() {
  const [page, setPage] = useState<Page>(() => pageFromPath(window.location.pathname));
  const [authState, setAuthState] = useState<AuthState>("checking");

  useEffect(() => {
    const onPopState = () => setPage(pageFromPath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    let active = true;

    async function checkAuth() {
      const response = await fetch("/api/session");
      if (!active) {
        return;
      }

      const body = (await response.json()) as { authenticated?: boolean };
      if (!active) {
        return;
      }

      if (body.authenticated) {
        setAuthState("authenticated");
        if (page === "login") {
          navigate("overview", true);
        }
        return;
      }

      if (protectedPages.has(page)) {
        setAuthState("anonymous");
        navigate("login", true);
        return;
      }

      setAuthState("anonymous");
    }

    void checkAuth().catch(() => {
      if (active) {
        setAuthState("anonymous");
        navigate("login", true);
      }
    });

    return () => {
      active = false;
    };
  }, [page]);

  function navigate(nextPage: Page, replace = false) {
    const nextPath = pathForPage(nextPage);
    if (window.location.pathname !== nextPath) {
      if (replace) {
        window.history.replaceState(null, "", nextPath);
      } else {
        window.history.pushState(null, "", nextPath);
      }
    }
    setPage(nextPage);
  }

  async function logout() {
    await fetch("/api/session", { method: "DELETE" });
    setAuthState("anonymous");
    navigate("login");
  }

  if (authState === "checking" && protectedPages.has(page)) {
    return (
      <main className="centered-shell">
        <section className="panel compact-panel" aria-live="polite">
          Checking session...
        </section>
      </main>
    );
  }

  if (page === "login" || authState === "anonymous") {
    return <LoginPage onAuthenticated={() => {
      setAuthState("authenticated");
      navigate("overview", true);
    }} />;
  }

  return <AppShell activePage={page} onNavigate={navigate} onLogout={logout} />;
}

function LoginPage({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      if (!response.ok) {
        setError("Invalid username or password.");
        return;
      }

      onAuthenticated();
    } catch {
      setError("Unable to reach the service.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="centered-shell">
      <section className="panel login-panel">
        <p className="eyebrow">Registry API Wrapper v0.1</p>
        <h1>Sign in</h1>
        <form className="login-form" onSubmit={submit}>
          <label>
            Username
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button type="submit" disabled={submitting}>
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}

function AppShell({
  activePage,
  onNavigate,
  onLogout
}: {
  activePage: Page;
  onNavigate: (page: Page) => void;
  onLogout: () => void;
}) {
  const navigation = useMemo(
    () => [
      { page: "overview" as const, label: "Overview" },
      { page: "repositories" as const, label: "Repositories" },
      { page: "settings" as const, label: "Settings" }
    ],
    []
  );

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Registry API Wrapper</p>
          <h1>Registry Web UI</h1>
        </div>
        <nav aria-label="Primary">
          {navigation.map((item) => (
            <button
              aria-current={activePage === item.page ? "page" : undefined}
              className="nav-button"
              key={item.page}
              onClick={() => onNavigate(item.page)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>
        <button className="secondary-button" onClick={onLogout} type="button">
          Sign out
        </button>
      </aside>
      <main className="content-shell">{renderPage(activePage)}</main>
    </div>
  );
}

function renderPage(page: Page) {
  if (page === "repositories") {
    return <RepositoriesPage />;
  }

  if (page === "settings") {
    return <SettingsPage />;
  }

  return (
    <OverviewPage />
  );
}

function RepositoriesPage() {
  const manifestRoute = manifestRouteFromPath(window.location.pathname);
  if (manifestRoute) {
    return <ManifestDetailPage repository={manifestRoute.repository} reference={manifestRoute.reference} />;
  }

  const selectedRepository = repositoryNameFromPath(window.location.pathname);
  if (selectedRepository) {
    return <RepositoryDetailPage repository={selectedRepository} />;
  }

  const [repositories, setRepositories] = useState<string[]>([]);
  const [next, setNext] = useState("");
  const [hasNext, setHasNext] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const filteredRepositories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return repositories;
    }
    return repositories.filter((repository) => repository.toLowerCase().includes(normalizedQuery));
  }, [query, repositories]);

  async function fetchRepositoryPage(last = "") {
    const params = new URLSearchParams({ n: "100" });
    if (last) {
      params.set("last", last);
    }

    const response = await fetch(`/api/repositories?${params.toString()}`);
    if (!response.ok) {
      throw new Error("Unable to load repositories.");
    }
    return (await response.json()) as RepositoryResponse;
  }

  async function loadFirstPage() {
    setLoading(true);
    setError("");
    try {
      const body = await fetchRepositoryPage();
      setRepositories(body.repositories);
      setNext(body.pagination.next ?? "");
      setHasNext(body.pagination.hasNext);
    } catch {
      setError("Unable to load repositories.");
      setRepositories([]);
      setNext("");
      setHasNext(false);
    } finally {
      setLoading(false);
    }
  }

  async function loadAllRepositories() {
    setLoading(true);
    setError("");
    try {
      const allRepositories: string[] = [];
      let cursor = "";
      let more = true;

      while (more) {
        const body = await fetchRepositoryPage(cursor);
        allRepositories.push(...body.repositories);
        cursor = body.pagination.next ?? "";
        more = body.pagination.hasNext && cursor !== "";
      }

      setRepositories(allRepositories);
      setNext(cursor);
      setHasNext(false);
    } catch {
      setError("Unable to load all repositories.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadFirstPage();
  }, []);

  return (
    <section className="content-section">
      <p className="eyebrow">Repositories</p>
      <div className="section-heading">
        <h2>Repositories</h2>
        <div className="toolbar">
          <button className="secondary-button inline-button" onClick={loadFirstPage} type="button">
            Refresh
          </button>
          <button className="inline-button" disabled={!hasNext || loading} onClick={loadAllRepositories} type="button">
            Load all repositories
          </button>
        </div>
      </div>
      <label className="search-field">
        Search loaded repositories
        <input
          placeholder="app/backend"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {loading ? <p className="muted-text" role="status">Loading repositories...</p> : null}
      {!loading && !error && filteredRepositories.length === 0 ? (
        <p className="muted-text">No repositories found.</p>
      ) : null}
      {filteredRepositories.length > 0 ? (
        <div className="repository-list">
          {filteredRepositories.map((repository) => (
            <div className="repository-row" key={repository}>
              <a className="repository-link" href={repositoryPath(repository)}>
                {repository}
              </a>
              <span>{next && hasNext ? "Current page" : "Loaded"}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ManifestDetailPage({ repository, reference }: { repository: string; reference: string }) {
  const [manifest, setManifest] = useState<ManifestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadManifest() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/repositories/${encodeURIComponent(repository)}/manifests/${encodeURIComponent(reference)}`);
        if (!response.ok) {
          throw new Error("Unable to load manifest.");
        }
        const body = (await response.json()) as ManifestResponse;
        if (active) {
          setManifest(body);
        }
      } catch {
        if (active) {
          setError("Unable to load manifest.");
          setManifest(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadManifest();

    return () => {
      active = false;
    };
  }, [reference, repository]);

  return (
    <section className="content-section">
      <p className="eyebrow">Manifest Detail</p>
      <div className="section-heading">
        <div>
          <h2>{reference}</h2>
          <p className="muted-text">{repository}</p>
        </div>
        <a className="secondary-link-button" href={repositoryPath(repository)}>Back to tags</a>
      </div>
      {loading ? <p className="muted-text" role="status">Loading manifest...</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {manifest ? (
        <>
          <div className="status-grid">
            <StatusItem label="Repository" value={manifest.repository} />
            <StatusItem label="Reference" value={manifest.reference} />
            <StatusItem label="Digest" value={manifest.digest} />
            <StatusItem label="Media Type" value={manifest.mediaType} />
            <StatusItem label="Schema Version" value={String(manifest.schemaVersion)} />
            <StatusItem label="Tag Size" value={formatBytes(manifest.size)} />
          </div>
          <ManifestDescriptors manifest={manifest} />
          <section className="raw-json-section">
            <h3>Raw JSON</h3>
            <pre>{JSON.stringify(manifest.raw, null, 2)}</pre>
          </section>
        </>
      ) : null}
    </section>
  );
}

function ManifestDescriptors({ manifest }: { manifest: ManifestResponse }) {
  if (manifest.layers && manifest.layers.length > 0) {
    return (
      <section className="descriptor-section">
        <h3>Layers</h3>
        <div className="descriptor-list">
          {manifest.layers.map((layer) => (
            <div className="descriptor-row" key={layer.digest}>
              <strong>{layer.digest}</strong>
              <span>{layer.mediaType}</span>
              <span>{formatBytes(layer.size)}</span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (manifest.manifests && manifest.manifests.length > 0) {
    return (
      <section className="descriptor-section">
        <h3>Platform Manifests</h3>
        <p className="muted-text">Child manifests are listed from the index response and are not fetched recursively.</p>
        <div className="descriptor-list">
          {manifest.manifests.map((entry) => (
            <div className="descriptor-row" key={entry.digest}>
              <strong>{entry.digest}</strong>
              <span>{platformLabel(entry)}</span>
              <span>{formatBytes(entry.size)}</span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return <p className="muted-text">No layers or platform manifests were returned.</p>;
}

function platformLabel(entry: ManifestDescriptor): string {
  const platform = entry.platform;
  if (!platform) {
    return entry.mediaType;
  }
  return [platform.os, platform.architecture, platform.variant].filter(Boolean).join("/") || entry.mediaType;
}

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function RepositoryDetailPage({ repository }: { repository: string }) {
  const [tags, setTags] = useState<string[]>([]);
  const [next, setNext] = useState("");
  const [hasNext, setHasNext] = useState(false);
  const [query, setQuery] = useState("");
  const [registryUrl, setRegistryUrl] = useState("");
  const [copiedTag, setCopiedTag] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteInput, setDeleteInput] = useState("");
  const [deleteLoadingTag, setDeleteLoadingTag] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleteStatus, setDeleteStatus] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const filteredTags = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return tags;
    }
    return tags.filter((tag) => tag.toLowerCase().includes(normalizedQuery));
  }, [query, tags]);

  async function loadRegistryUrl() {
    const response = await fetch("/api/status");
    if (!response.ok) {
      return;
    }
    const body = (await response.json()) as StatusResponse;
    setRegistryUrl(body.registryUrl);
  }

  async function fetchTagPage(last = "") {
    const params = new URLSearchParams({ n: "100" });
    if (last) {
      params.set("last", last);
    }
    const response = await fetch(`/api/repositories/${encodeURIComponent(repository)}/tags?${params.toString()}`);
    if (!response.ok) {
      throw new Error("Unable to load tags.");
    }
    return (await response.json()) as TagsResponse;
  }

  async function loadFirstPage() {
    setLoading(true);
    setError("");
    try {
      const body = await fetchTagPage();
      setTags(body.tags);
      setNext(body.pagination.next ?? "");
      setHasNext(body.pagination.hasNext);
    } catch {
      setError("Unable to load tags.");
      setTags([]);
      setNext("");
      setHasNext(false);
    } finally {
      setLoading(false);
    }
  }

  async function loadAllTags() {
    setLoading(true);
    setError("");
    try {
      const allTags: string[] = [];
      let cursor = "";
      let more = true;

      while (more) {
        const body = await fetchTagPage(cursor);
        allTags.push(...body.tags);
        cursor = body.pagination.next ?? "";
        more = body.pagination.hasNext && cursor !== "";
      }

      setTags(allTags);
      setNext(cursor);
      setHasNext(false);
    } catch {
      setError("Unable to load all tags.");
    } finally {
      setLoading(false);
    }
  }

  async function copyPullCommand(tag: string) {
    const command = pullCommandFor(registryUrl, repository, tag);
    await navigator.clipboard.writeText(command);
    setCopiedTag(tag);
  }

  async function startDelete(tag: string) {
    setDeleteLoadingTag(tag);
    setDeleteError("");
    setDeleteStatus("");
    setDeleteInput("");
    try {
      const response = await fetch(`/api/repositories/${encodeURIComponent(repository)}/references/${encodeURIComponent(tag)}/digest`);
      if (!response.ok) {
        throw new Error(await readApiError(response, "Unable to resolve the current digest."));
      }
      const body = (await response.json()) as DigestResponse;
      setDeleteTarget({ tag, digest: body.digest });
    } catch (deleteException) {
      setDeleteError(deleteException instanceof Error ? deleteException.message : "Unable to resolve the current digest.");
      setDeleteTarget(null);
    } finally {
      setDeleteLoadingTag("");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleteInput !== deleteTarget.tag) {
      return;
    }
    setDeleting(true);
    setDeleteError("");
    setDeleteStatus("");
    try {
      const response = await fetch(`/api/repositories/${encodeURIComponent(repository)}/manifests/${encodeURIComponent(deleteTarget.digest)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmedReference: deleteTarget.tag })
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "Unable to delete manifest."));
      }
      const body = (await response.json()) as DeleteManifestResponse;
      setDeleteStatus(`Deletion accepted with status ${body.status}.`);
      setDeleteTarget(null);
      setDeleteInput("");
      await loadFirstPage();
    } catch (deleteException) {
      setDeleteError(deleteException instanceof Error ? deleteException.message : "Unable to delete manifest.");
    } finally {
      setDeleting(false);
    }
  }

  function closeDeleteDialog() {
    if (deleting) {
      return;
    }
    setDeleteTarget(null);
    setDeleteInput("");
    setDeleteError("");
  }

  useEffect(() => {
    void loadRegistryUrl();
    void loadFirstPage();
  }, [repository]);

  return (
    <section className="content-section">
      <p className="eyebrow">Repository Detail</p>
      <div className="section-heading">
        <div>
          <h2>{repository}</h2>
          <p className="muted-text">Browse loaded tags and copy pull commands.</p>
        </div>
        <div className="toolbar">
          <a className="secondary-link-button" href="/repositories">Back</a>
          <button className="secondary-button inline-button" onClick={loadFirstPage} type="button">
            Refresh
          </button>
          <button className="inline-button" disabled={!hasNext || loading} onClick={loadAllTags} type="button">
            Load all tags
          </button>
        </div>
      </div>
      <label className="search-field">
        Search loaded tags
        <input
          placeholder="latest"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {deleteError && !deleteTarget ? <p className="form-error" role="alert">{deleteError}</p> : null}
      {deleteStatus ? <p className="status-success" role="status">{deleteStatus}</p> : null}
      {loading ? <p className="muted-text" role="status">Loading tags...</p> : null}
      {!loading && !error && filteredTags.length === 0 ? (
        <p className="muted-text">No tags found.</p>
      ) : null}
      {filteredTags.length > 0 ? (
        <div className="tag-table">
          <div className="tag-row tag-header">
            <span>Tag</span>
            <span>Actions</span>
          </div>
          {filteredTags.map((tag) => (
            <div className="tag-row" key={tag}>
              <div className="tag-reference">
                <strong>{tag}</strong>
                <code>{registryUrl ? pullCommandFor(registryUrl, repository, tag) : "Registry URL loading..."}</code>
              </div>
              <div className="row-actions">
                <a className="secondary-link-button compact-action" href={`${repositoryPath(repository)}/manifests/${encodeURIComponent(tag)}`}>
                  Manifest
                </a>
                <button className="secondary-button compact-action" onClick={() => void copyPullCommand(tag)} type="button">
                  {copiedTag === tag ? "Copied" : "Pull"}
                </button>
                <button className="danger-button compact-action" disabled={deleteLoadingTag === tag} onClick={() => void startDelete(tag)} type="button">
                  {deleteLoadingTag === tag ? "Resolving..." : "Delete Manifest"}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {deleteTarget ? (
        <DeleteManifestDialog
          deleteError={deleteError}
          deleteInput={deleteInput}
          deleteTarget={deleteTarget}
          deleting={deleting}
          onCancel={closeDeleteDialog}
          onChangeInput={setDeleteInput}
          onConfirm={() => void confirmDelete()}
          repository={repository}
        />
      ) : null}
    </section>
  );
}

function DeleteManifestDialog({
  deleteError,
  deleteInput,
  deleteTarget,
  deleting,
  onCancel,
  onChangeInput,
  onConfirm,
  repository
}: {
  deleteError: string;
  deleteInput: string;
  deleteTarget: DeleteTarget;
  deleting: boolean;
  onCancel: () => void;
  onChangeInput: (value: string) => void;
  onConfirm: () => void;
  repository: string;
}) {
  const operation = `DELETE /v2/${repository}/manifests/${deleteTarget.digest}`;
  const canDelete = deleteInput === deleteTarget.tag && !deleting;

  return (
    <div className="dialog-backdrop" role="presentation">
      <section aria-modal="true" className="dialog-panel" role="dialog" aria-labelledby="delete-dialog-title">
        <p className="eyebrow">Delete Manifest</p>
        <h3 id="delete-dialog-title">Confirm digest deletion</h3>
        <div className="delete-summary">
          <StatusItem label="Repository" value={repository} />
          <StatusItem label="Tag" value={deleteTarget.tag} />
          <StatusItem label="Digest" value={deleteTarget.digest} />
          <StatusItem label="Operation" value={operation} />
        </div>
        <div className="delete-warning">
          <p>This deletes the manifest digest currently referenced by this tag.</p>
          <p>Other tags pointing to the same digest may be affected.</p>
          <p>Disk space is not released until external Registry garbage collection runs.</p>
        </div>
        <label>
          Type tag name to confirm
          <input
            autoFocus
            value={deleteInput}
            onChange={(event) => onChangeInput(event.target.value)}
            placeholder={deleteTarget.tag}
          />
        </label>
        {deleteError ? <p className="form-error" role="alert">{deleteError}</p> : null}
        <div className="dialog-actions">
          <button className="secondary-button inline-button" disabled={deleting} onClick={onCancel} type="button">
            Cancel
          </button>
          <button className="danger-button inline-button" disabled={!canDelete} onClick={onConfirm} type="button">
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </section>
    </div>
  );
}

function pullCommandFor(registryUrl: string, repository: string, tag: string): string {
  const host = pullRegistryHost(registryUrl);
  return `docker pull ${host}/${repository}:${tag}`;
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorResponse;
    if (body.error?.message) {
      const baseMessage = body.error.registryStatus
        ? `${body.error.message} Registry status ${body.error.registryStatus}.`
        : body.error.message;
      if (body.error.registryErrors && body.error.registryErrors.length > 0) {
        const registryDetails = body.error.registryErrors
          .map((registryError) => `${registryError.code}: ${registryError.message}`)
          .join(" ");
        return `${baseMessage} ${registryDetails}`;
      }
      return baseMessage;
    }
  } catch {
    // Fall through to the caller-provided message.
  }
  return fallback;
}

function OverviewPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadStatus() {
      setError("");
      const response = await fetch("/api/status");
      if (!response.ok) {
        setError("Unable to load Registry status.");
        return;
      }

      const body = (await response.json()) as StatusResponse;
      if (active) {
        setStatus(body);
      }
    }

    void loadStatus().catch(() => {
      if (active) {
        setError("Unable to load Registry status.");
      }
    });

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="content-section">
      <p className="eyebrow">Overview</p>
      <h2>Overview</h2>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {status ? (
        <>
          {status.insecureTLS ? <InsecureTLSWarning /> : null}
          <div className="status-grid">
            <StatusItem label="Registry URL" value={status.registryUrl} />
            <StatusItem label="API Status" value={status.available ? "Available" : "Unavailable"} />
            <StatusItem label="Authentication" value={status.authenticated ? "Authenticated" : "Not authenticated"} />
            <StatusItem label="Repository Count" value="Not loaded yet" />
            <StatusItem label="Page Size" value={String(status.pageSize)} />
            <StatusItem label="Delete Capability" value={status.deleteCapability} />
          </div>
        </>
      ) : null}
      {status?.error ? (
        <div className="status-error" role="status">
          <strong>{status.error.message}</strong>
          <span>
            {status.error.code}
            {status.error.registryStatus ? ` / Registry ${status.error.registryStatus}` : ""}
          </span>
          {status.error.registryErrors && status.error.registryErrors.length > 0 ? (
            <pre>{JSON.stringify(status.error.registryErrors, null, 2)}</pre>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function SettingsPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadSettings() {
      setError("");
      const response = await fetch("/api/status");
      if (!response.ok) {
        setError("Unable to load settings.");
        return;
      }
      const body = (await response.json()) as StatusResponse;
      if (active) {
        setStatus(body);
      }
    }

    void loadSettings().catch(() => {
      if (active) {
        setError("Unable to load settings.");
      }
    });

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="content-section">
      <p className="eyebrow">Settings</p>
      <h2>Settings</h2>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {status ? (
        <>
          {status.insecureTLS ? <InsecureTLSWarning /> : null}
          <div className="status-grid">
            <StatusItem label="Registry URL" value={status.registryUrl} />
            <StatusItem label="Page Size" value={String(status.pageSize)} />
            <StatusItem label="Request Timeout" value={status.requestTimeout} />
            <StatusItem label="Insecure TLS" value={status.insecureTLS ? "Enabled" : "Disabled"} />
            <StatusItem label="Mode" value="Read-only" />
          </div>
        </>
      ) : null}
    </section>
  );
}

function InsecureTLSWarning() {
  return (
    <div className="warning-banner" role="status">
      Insecure TLS is enabled for Registry connections.
    </div>
  );
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="status-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
