import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Banner,
  Button,
  Card,
  Descriptions,
  Empty,
  Input,
  Layout,
  Modal,
  Nav,
  Space,
  Spin,
  Table,
  Tag,
  Toast,
  Typography
} from "@douyinfe/semi-ui-19";
import {
  IconAlertTriangle,
  IconChevronLeft,
  IconCopy,
  IconDelete,
  IconExit,
  IconFile,
  IconHome,
  IconLayers,
  IconLock,
  IconRefresh,
  IconSearch,
  IconServer,
  IconSetting,
  IconTerminal
} from "@douyinfe/semi-icons";
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
type RepositoryRow = {
  key: string;
  repository: string;
  scope: string;
};
type TagRow = {
  key: string;
  tag: string;
  command: string;
};
type DescriptorRow = {
  key: string;
  digest: string;
  mediaType: string;
  size: string;
};

const { Content, Header, Sider } = Layout;
const { Text, Title, Paragraph } = Typography;
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
        <Card className="checking-card">
          <Spin size="large" />
          <Text type="tertiary">Checking session...</Text>
        </Card>
      </main>
    );
  }

  if (page === "login" || authState === "anonymous") {
    return (
      <LoginPage
        onAuthenticated={() => {
          setAuthState("authenticated");
          navigate("overview", true);
        }}
      />
    );
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
    <main className="login-shell">
      <section className="login-visual" aria-label="Registry API Wrapper">
        <Tag color="teal" prefixIcon={<IconServer />}>Registry API Wrapper v0.1</Tag>
        <div>
          <Title className="login-title" heading={1}>Registry Web UI</Title>
          <Paragraph>
            A compact control surface for browsing repositories, inspecting manifests, and
            operating against a Docker Registry HTTP API V2 endpoint.
          </Paragraph>
        </div>
        <div className="login-metrics">
          <MetricCard label="Mode" value="Read first" />
          <MetricCard label="API" value="V2" />
          <MetricCard label="Deletes" value="Guarded" />
        </div>
      </section>

      <Card className="login-card" shadows="always">
        <Space vertical align="start" spacing={8} className="full-width">
          <Avatar color="teal" size="extra-large">
            <IconLock size="extra-large" />
          </Avatar>
          <Title heading={3}>Sign in</Title>
          <Text type="tertiary">Use the local wrapper credentials to continue.</Text>
        </Space>

        <form className="semi-form-stack" onSubmit={submit}>
          <FieldLabel label="Username">
            <Input
              autoComplete="username"
              prefix={<IconServer />}
              size="large"
              value={username}
              onChange={setUsername}
            />
          </FieldLabel>
          <FieldLabel label="Password">
            <Input
              autoComplete="current-password"
              mode="password"
              prefix={<IconLock />}
              size="large"
              value={password}
              onChange={setPassword}
            />
          </FieldLabel>
          {error ? <Banner type="danger" description={error} closeIcon={null} /> : null}
          <Button block htmlType="submit" loading={submitting} size="large" theme="solid" type="primary">
            Sign in
          </Button>
        </form>
      </Card>
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
      { itemKey: "overview", text: "Overview", icon: <IconHome /> },
      { itemKey: "repositories", text: "Repositories", icon: <IconLayers /> },
      { itemKey: "settings", text: "Settings", icon: <IconSetting /> }
    ],
    []
  );

  return (
    <Layout className="app-layout">
      <Sider className="app-sider" aria-label="Primary navigation">
        <Nav
          bodyStyle={{ flex: 1 }}
          className="app-nav"
          footer={
            <Button
              block
              icon={<IconExit />}
              onClick={onLogout}
              theme="borderless"
              type="tertiary"
            >
              Sign out
            </Button>
          }
          header={{
            logo: (
              <Avatar color="teal" size="small">
                <IconServer />
              </Avatar>
            ),
            text: "Registry Web UI"
          }}
          items={navigation}
          selectedKeys={[activePage]}
          onSelect={({ itemKey }) => onNavigate(itemKey as Page)}
        />
      </Sider>
      <Layout className="app-main">
        <Header className="app-header">
          <div>
            <Text strong>Registry API Wrapper</Text>
            <Text type="tertiary">Operational console</Text>
          </div>
          <Tag color="green" prefixIcon={<IconTerminal />}>Docker Registry V2</Tag>
        </Header>
        <Content className="content-shell">{renderPage(activePage)}</Content>
      </Layout>
    </Layout>
  );
}

function renderPage(page: Page) {
  if (page === "repositories") {
    return <RepositoriesPage />;
  }

  if (page === "settings") {
    return <SettingsPage />;
  }

  return <OverviewPage />;
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
    const source = normalizedQuery
      ? repositories.filter((repository) => repository.toLowerCase().includes(normalizedQuery))
      : repositories;
    return source.map<RepositoryRow>((repository) => ({
      key: repository,
      repository,
      scope: next && hasNext ? "Current page" : "Loaded"
    }));
  }, [hasNext, next, query, repositories]);

  const columns = useMemo(
    () => [
      {
        title: "Repository",
        dataIndex: "repository",
        render: (repository: string) => (
          <a className="resource-link" href={repositoryPath(repository)}>
            <IconLayers />
            <span>{repository}</span>
          </a>
        )
      },
      {
        title: "Load scope",
        dataIndex: "scope",
        width: 150,
        render: (scope: string) => <Tag color={scope === "Loaded" ? "green" : "blue"}>{scope}</Tag>
      }
    ],
    []
  );

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
    <PageFrame
      eyebrow="Repositories"
      title="Repositories"
      description="Browse loaded repositories and open tag details without leaving the console."
      actions={
        <Space>
          <Button icon={<IconRefresh />} loading={loading} onClick={loadFirstPage} theme="light" type="tertiary">
            Refresh
          </Button>
          <Button disabled={!hasNext || loading} onClick={loadAllRepositories} theme="solid" type="primary">
            Load all
          </Button>
        </Space>
      }
    >
      <Card className="workspace-card" shadows="hover">
        <div className="table-toolbar">
          <Input
            className="search-input"
            placeholder="Search loaded repositories"
            prefix={<IconSearch />}
            showClear
            value={query}
            onChange={setQuery}
          />
          <Text type="tertiary">{repositories.length} loaded</Text>
        </div>
        {error ? <Banner type="danger" description={error} closeIcon={null} /> : null}
        <Table<RepositoryRow>
          columns={columns}
          dataSource={filteredRepositories}
          empty={<Empty title="No repositories found" description="Refresh the registry or adjust the search." />}
          loading={loading}
          pagination={false}
          rowKey="key"
          size="middle"
        />
      </Card>
    </PageFrame>
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
    <PageFrame
      eyebrow="Manifest detail"
      title={reference}
      description={repository}
      actions={
        <Button component="a" href={repositoryPath(repository)} icon={<IconChevronLeft />} theme="light" type="tertiary">
          Back to tags
        </Button>
      }
    >
      {error ? <Banner type="danger" description={error} closeIcon={null} /> : null}
      <Spin spinning={loading}>
        {manifest ? (
          <Space vertical spacing={20} className="full-width">
            <Card className="workspace-card" shadows="hover">
              <Descriptions
                align="plain"
                column={2}
                data={[
                  { key: "Repository", value: manifest.repository },
                  { key: "Reference", value: manifest.reference },
                  { key: "Digest", value: <code className="inline-code">{manifest.digest}</code>, span: 2 },
                  { key: "Media type", value: manifest.mediaType },
                  { key: "Schema version", value: String(manifest.schemaVersion) },
                  { key: "Tag size", value: formatBytes(manifest.size) }
                ]}
              />
            </Card>
            <ManifestDescriptors manifest={manifest} />
            <Card className="workspace-card" shadows="hover" title="Raw JSON">
              <pre className="raw-json">{JSON.stringify(manifest.raw, null, 2)}</pre>
            </Card>
          </Space>
        ) : null}
      </Spin>
    </PageFrame>
  );
}

function ManifestDescriptors({ manifest }: { manifest: ManifestResponse }) {
  const rows = useMemo<DescriptorRow[]>(() => {
    const source = manifest.layers && manifest.layers.length > 0
      ? manifest.layers.map((layer) => ({
        key: layer.digest,
        digest: layer.digest,
        mediaType: layer.mediaType,
        size: formatBytes(layer.size)
      }))
      : (manifest.manifests ?? []).map((entry) => ({
        key: entry.digest,
        digest: entry.digest,
        mediaType: platformLabel(entry),
        size: formatBytes(entry.size)
      }));
    return source;
  }, [manifest.layers, manifest.manifests]);

  const columns = useMemo(
    () => [
      {
        title: "Digest",
        dataIndex: "digest",
        render: (digest: string) => <code className="inline-code">{digest}</code>
      },
      {
        title: manifest.layers && manifest.layers.length > 0 ? "Media type" : "Platform",
        dataIndex: "mediaType",
        render: (value: string) => <Text>{value}</Text>
      },
      {
        title: "Size",
        dataIndex: "size",
        width: 130
      }
    ],
    [manifest.layers]
  );

  const title = manifest.layers && manifest.layers.length > 0 ? "Layers" : "Platform manifests";
  const description = manifest.layers && manifest.layers.length > 0
    ? undefined
    : "Child manifests are listed from the index response and are not fetched recursively.";

  return (
    <Card className="workspace-card" shadows="hover" title={title}>
      {description ? <Paragraph type="tertiary">{description}</Paragraph> : null}
      <Table<DescriptorRow>
        columns={columns}
        dataSource={rows}
        empty={<Empty title="No descriptor data" description="The registry did not return layers or platform manifests." />}
        pagination={false}
        rowKey="key"
        size="middle"
      />
    </Card>
  );
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
    const source = normalizedQuery ? tags.filter((tag) => tag.toLowerCase().includes(normalizedQuery)) : tags;
    return source.map<TagRow>((tag) => ({
      key: tag,
      tag,
      command: registryUrl ? pullCommandFor(registryUrl, repository, tag) : "Registry URL loading..."
    }));
  }, [query, registryUrl, repository, tags]);

  const columns = useMemo(
    () => [
      {
        title: "Tag",
        dataIndex: "tag",
        render: (tag: string, record: TagRow) => (
          <div className="tag-cell">
            <Text strong>{tag}</Text>
            <code>{record.command}</code>
          </div>
        )
      },
      {
        title: "Actions",
        dataIndex: "tag",
        width: 330,
        render: (tag: string) => (
          <Space wrap>
            <Button
              component="a"
              href={`${repositoryPath(repository)}/manifests/${encodeURIComponent(tag)}`}
              icon={<IconFile />}
              size="small"
              theme="light"
              type="tertiary"
            >
              Manifest
            </Button>
            <Button
              icon={<IconCopy />}
              onClick={() => void copyPullCommand(tag)}
              size="small"
              theme="light"
              type={copiedTag === tag ? "primary" : "tertiary"}
            >
              {copiedTag === tag ? "Copied" : "Pull"}
            </Button>
            <Button
              icon={<IconDelete />}
              loading={deleteLoadingTag === tag}
              onClick={() => void startDelete(tag)}
              size="small"
              theme="light"
              type="danger"
            >
              Delete
            </Button>
          </Space>
        )
      }
    ],
    [copiedTag, deleteLoadingTag, repository]
  );

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
    Toast.success("Pull command copied.");
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
    <PageFrame
      eyebrow="Repository detail"
      title={repository}
      description="Browse loaded tags, copy pull commands, and inspect manifest metadata."
      actions={
        <Space>
          <Button component="a" href="/repositories" icon={<IconChevronLeft />} theme="light" type="tertiary">
            Back
          </Button>
          <Button icon={<IconRefresh />} loading={loading} onClick={loadFirstPage} theme="light" type="tertiary">
            Refresh
          </Button>
          <Button disabled={!hasNext || loading} onClick={loadAllTags} theme="solid" type="primary">
            Load all
          </Button>
        </Space>
      }
    >
      <Card className="workspace-card" shadows="hover">
        <div className="table-toolbar">
          <Input
            className="search-input"
            placeholder="Search loaded tags"
            prefix={<IconSearch />}
            showClear
            value={query}
            onChange={setQuery}
          />
          <Text type="tertiary">{tags.length} loaded</Text>
        </div>
        {error ? <Banner type="danger" description={error} closeIcon={null} /> : null}
        {deleteError && !deleteTarget ? <Banner type="danger" description={deleteError} closeIcon={null} /> : null}
        {deleteStatus ? <Banner type="success" description={deleteStatus} closeIcon={null} /> : null}
        <Table<TagRow>
          columns={columns}
          dataSource={filteredTags}
          empty={<Empty title="No tags found" description="Refresh the repository or adjust the search." />}
          loading={loading}
          pagination={false}
          rowKey="key"
          size="middle"
        />
      </Card>
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
    </PageFrame>
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
  deleteTarget: DeleteTarget | null;
  deleting: boolean;
  onCancel: () => void;
  onChangeInput: (value: string) => void;
  onConfirm: () => void;
  repository: string;
}) {
  const operation = deleteTarget ? `DELETE /v2/${repository}/manifests/${deleteTarget.digest}` : "";
  const canDelete = Boolean(deleteTarget) && deleteInput === deleteTarget?.tag && !deleting;

  return (
    <Modal
      cancelText="Cancel"
      centered
      confirmLoading={deleting}
      hasCancel
      okButtonProps={{ disabled: !canDelete, type: "danger" }}
      okText="Delete manifest"
      title="Confirm digest deletion"
      visible={Boolean(deleteTarget)}
      width={720}
      onCancel={onCancel}
      onOk={onConfirm}
    >
      {deleteTarget ? (
        <Space vertical spacing={16} className="full-width">
          <Descriptions
            align="plain"
            column={1}
            data={[
              { key: "Repository", value: repository },
              { key: "Tag", value: deleteTarget.tag },
              { key: "Digest", value: <code className="inline-code">{deleteTarget.digest}</code> },
              { key: "Operation", value: <code className="inline-code">{operation}</code> }
            ]}
          />
          <Banner
            type="warning"
            closeIcon={null}
            description="This deletes the manifest digest currently referenced by this tag. Other tags pointing to the same digest may be affected. Disk space is not released until external Registry garbage collection runs."
          />
          <FieldLabel label="Type tag name to confirm">
            <Input
              autoFocus
              placeholder={deleteTarget.tag}
              value={deleteInput}
              validateStatus={deleteInput && deleteInput !== deleteTarget.tag ? "warning" : "default"}
              onChange={onChangeInput}
            />
          </FieldLabel>
          {deleteError ? <Banner type="danger" description={deleteError} closeIcon={null} /> : null}
        </Space>
      ) : null}
    </Modal>
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
    <PageFrame
      eyebrow="Overview"
      title="Registry overview"
      description="Current wrapper connectivity, Registry authentication, and operational capability."
    >
      {error ? <Banner type="danger" description={error} closeIcon={null} /> : null}
      {status ? (
        <Space vertical spacing={20} className="full-width">
          {status.insecureTLS ? <InsecureTLSWarning /> : null}
          <div className="metric-grid">
            <MetricCard label="API status" value={status.available ? "Available" : "Unavailable"} tone={status.available ? "green" : "red"} />
            <MetricCard label="Authentication" value={status.authenticated ? "Authenticated" : "Not authenticated"} tone={status.authenticated ? "green" : "orange"} />
            <MetricCard label="Page size" value={String(status.pageSize)} />
            <MetricCard label="Delete capability" value={status.deleteCapability} tone={status.deleteCapability === "available" ? "orange" : "grey"} />
          </div>
          <Card className="workspace-card" shadows="hover" title="Connection">
            <Descriptions
              align="plain"
              column={2}
              data={[
                { key: "Registry URL", value: status.registryUrl, span: 2 },
                { key: "Request timeout", value: status.requestTimeout },
                { key: "Insecure TLS", value: status.insecureTLS ? "Enabled" : "Disabled" }
              ]}
            />
          </Card>
        </Space>
      ) : (
        <Card className="workspace-card">
          <Spin />
        </Card>
      )}
      {status?.error ? (
        <Card className="error-card" shadows="hover" title="Registry error">
          <Text strong>{status.error.message}</Text>
          <Text type="tertiary">
            {status.error.code}
            {status.error.registryStatus ? ` / Registry ${status.error.registryStatus}` : ""}
          </Text>
          {status.error.registryErrors && status.error.registryErrors.length > 0 ? (
            <pre className="raw-json compact">{JSON.stringify(status.error.registryErrors, null, 2)}</pre>
          ) : null}
        </Card>
      ) : null}
    </PageFrame>
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
    <PageFrame
      eyebrow="Settings"
      title="Runtime settings"
      description="Read-only wrapper configuration reported by the backend."
    >
      {error ? <Banner type="danger" description={error} closeIcon={null} /> : null}
      {status ? (
        <Space vertical spacing={20} className="full-width">
          {status.insecureTLS ? <InsecureTLSWarning /> : null}
          <Card className="workspace-card" shadows="hover">
            <Descriptions
              align="plain"
              column={2}
              data={[
                { key: "Registry URL", value: status.registryUrl, span: 2 },
                { key: "Page size", value: String(status.pageSize) },
                { key: "Request timeout", value: status.requestTimeout },
                { key: "Insecure TLS", value: status.insecureTLS ? "Enabled" : "Disabled" },
                { key: "Mode", value: "Read-only" }
              ]}
            />
          </Card>
        </Space>
      ) : (
        <Card className="workspace-card">
          <Spin />
        </Card>
      )}
    </PageFrame>
  );
}

function InsecureTLSWarning() {
  return (
    <Banner
      closeIcon={null}
      icon={<IconAlertTriangle />}
      type="warning"
      description="Insecure TLS is enabled for Registry connections."
    />
  );
}

function PageFrame({
  actions,
  children,
  description,
  eyebrow,
  title
}: {
  actions?: ReactNode;
  children: ReactNode;
  description: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <section className="page-frame">
      <div className="page-heading">
        <div>
          <Tag color="teal" size="large">{eyebrow}</Tag>
          <Title heading={2}>{title}</Title>
          <Paragraph type="tertiary">{description}</Paragraph>
        </div>
        {actions ? <div className="page-actions">{actions}</div> : null}
      </div>
      <Space vertical spacing={20} className="full-width">
        {children}
      </Space>
    </section>
  );
}

function FieldLabel({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="field-label">
      <Text strong>{label}</Text>
      {children}
    </label>
  );
}

function MetricCard({
  label,
  tone = "blue",
  value
}: {
  label: string;
  tone?: "blue" | "green" | "grey" | "orange" | "red";
  value: string;
}) {
  return (
    <Card className="metric-card" shadows="hover">
      <Text type="tertiary">{label}</Text>
      <div className="metric-value">
        <Tag color={tone}>{value}</Tag>
      </div>
    </Card>
  );
}
