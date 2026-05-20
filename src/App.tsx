import {
  createContext,
  FormEvent,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import {
  Avatar,
  Banner,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Form,
  Input,
  Layout,
  Modal,
  Nav,
  Row,
  Select,
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
import {
  DEFAULT_LANGUAGE,
  Language,
  normalizeLanguage,
  t as translate,
  TranslationKey
} from "./i18n";
import {
  ApiErrorPayload,
  createRegistryClient,
  DeleteManifestResponse,
  DigestResponse,
  ManifestDescriptor,
  ManifestResponse,
  RegistryClient,
  RegistryConnectionConfig,
  RegistryError,
  RepositoryResponse,
  normalizeRegistryUrl,
  registryConfigFromEnv,
  StatusResponse,
  TagsResponse
} from "./registryClient";
import "./styles.css";

type Page = "overview" | "repositories" | "settings";
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
const languageStorageKey = "registry-webui-language";
const connectionStorageKey = "registry-webui-connection";

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);
const RegistryConnectionContext = createContext<{
  client: RegistryClient;
  config: RegistryConnectionConfig;
  onClearConnection: () => void;
  onEditConnection: () => void;
} | null>(null);

function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider.");
  }
  return context;
}

function useRegistryConnection() {
  const context = useContext(RegistryConnectionContext);
  if (!context) {
    throw new Error("useRegistryConnection must be used within RegistryConnectionProvider.");
  }
  return context;
}

function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      return normalizeLanguage(window.localStorage.getItem(languageStorageKey));
    } catch {
      return DEFAULT_LANGUAGE;
    }
  });

  const setLanguage = useCallback((nextLanguage: Language) => {
    setLanguageState(nextLanguage);
    try {
      window.localStorage.setItem(languageStorageKey, nextLanguage);
    } catch {
      // Language persistence is a convenience; the UI can continue without storage.
    }
  }, []);

  const value = useMemo<I18nContextValue>(() => ({
    language,
    setLanguage,
    t: (key) => translate(language, key)
  }), [language, setLanguage]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function readStoredConnection(): RegistryConnectionConfig | null {
  try {
    const raw = window.localStorage.getItem(connectionStorageKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<RegistryConnectionConfig>;
    const registryUrl = normalizeRegistryUrl(String(parsed.registryUrl ?? ""));
    if (!registryUrl) {
      return null;
    }
    return {
      registryUrl,
      username: typeof parsed.username === "string" ? parsed.username : "",
      password: typeof parsed.password === "string" ? parsed.password : "",
      pageSize: Number.isFinite(parsed.pageSize) && parsed.pageSize ? parsed.pageSize : 100,
      requestTimeoutSeconds: Number.isFinite(parsed.requestTimeoutSeconds) && parsed.requestTimeoutSeconds
        ? parsed.requestTimeoutSeconds
        : 30
    };
  } catch {
    return null;
  }
}

function writeStoredConnection(config: RegistryConnectionConfig) {
  try {
    window.localStorage.setItem(connectionStorageKey, JSON.stringify(config));
  } catch {
    // The app can still run with the in-memory connection for this tab.
  }
}

function clearStoredConnection() {
  try {
    window.localStorage.removeItem(connectionStorageKey);
  } catch {
    // Ignore storage errors; clearing in-memory state is enough for the UI.
  }
}

function defaultConnectionConfig(config: RegistryConnectionConfig | null): RegistryConnectionConfig {
  return config ?? {
    registryUrl: "",
    username: "",
    password: "",
    pageSize: 100,
    requestTimeoutSeconds: 30
  };
}

function loadedText(language: Language, count: number): string {
  return `${count} ${translate(language, "common.loaded")}`;
}

function deleteCapabilityLabel(language: Language, value: StatusResponse["deleteCapability"]): string {
  if (value === "available") {
    return translate(language, "common.available");
  }
  if (value === "unavailable") {
    return translate(language, "common.unavailable");
  }
  return value;
}

function pageFromPath(pathname: string): Page {
  if (pathname.startsWith("/repositories")) {
    return "repositories";
  }
  if (pathname.startsWith("/settings")) {
    return "settings";
  }
  return "overview";
}

function pathForPage(page: Page): string {
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

function openDocumentPath(path: string) {
  window.location.assign(path);
}

function pullRegistryHost(registryUrl: string): string {
  try {
    return new URL(registryUrl).host;
  } catch {
    return registryUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
}

export function App() {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  );
}

function AppContent() {
  const { t } = useI18n();
  const [page, setPage] = useState<Page>(() => pageFromPath(window.location.pathname));
  const [config, setConfigState] = useState<RegistryConnectionConfig | null>(() => (
    readStoredConnection() ?? registryConfigFromEnv((import.meta as ImportMeta & { env?: Record<string, unknown> }).env ?? {})
  ));
  const [connectionDialogVisible, setConnectionDialogVisible] = useState(() => config === null);
  const client = useMemo(() => (config ? createRegistryClient({ config }) : null), [config]);

  useEffect(() => {
    const onPopState = () => setPage(pageFromPath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

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

  function saveConnection(nextConfig: RegistryConnectionConfig) {
    setConfigState(nextConfig);
    writeStoredConnection(nextConfig);
    setConnectionDialogVisible(false);
  }

  function clearConnection() {
    setConfigState(null);
    clearStoredConnection();
    setConnectionDialogVisible(true);
    navigate("overview", true);
  }

  if (!client || !config) {
    return (
      <>
        <main className="centered-shell">
          <Card className="connection-required-card" shadows="hover">
            <Space vertical spacing={12} className="full-width">
              <Avatar color="teal" size="large">
                <IconServer />
              </Avatar>
              <Title heading={3}>{t("connection.requiredTitle")}</Title>
              <Text type="tertiary">{t("connection.requiredDescription")}</Text>
            </Space>
          </Card>
        </main>
        <ConnectionDialog
          config={config}
          force
          visible={connectionDialogVisible}
          onCancel={() => setConnectionDialogVisible(false)}
          onSave={saveConnection}
        />
      </>
    );
  }

  return (
    <RegistryConnectionContext.Provider
      value={{
        client,
        config,
        onClearConnection: clearConnection,
        onEditConnection: () => setConnectionDialogVisible(true)
      }}
    >
      <AppShell
        activePage={page}
        onNavigate={navigate}
      />
      <ConnectionDialog
        config={config}
        visible={connectionDialogVisible}
        onCancel={() => setConnectionDialogVisible(false)}
        onSave={saveConnection}
      />
    </RegistryConnectionContext.Provider>
  );
}

function ConnectionDialog({
  config,
  force = false,
  visible,
  onCancel,
  onSave
}: {
  config: RegistryConnectionConfig | null;
  force?: boolean;
  visible: boolean;
  onCancel: () => void;
  onSave: (config: RegistryConnectionConfig) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<RegistryConnectionConfig>(() => defaultConnectionConfig(config));
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (visible) {
      setDraft(defaultConnectionConfig(config));
      setError("");
    }
  }, [config, visible]);

  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const normalizedConfig = {
      ...draft,
      registryUrl: normalizeRegistryUrl(draft.registryUrl),
      pageSize: clampNumber(draft.pageSize, 10, 1000, 100),
      requestTimeoutSeconds: clampNumber(draft.requestTimeoutSeconds, 1, 300, 30)
    };

    if (!normalizedConfig.registryUrl) {
      setError(t("connection.invalidUrl"));
      return;
    }

    setTesting(true);
    setError("");
    try {
      const testClient = createRegistryClient({ config: normalizedConfig });
      const status = await testClient.status();
      if (!status.available || !status.authenticated) {
        setError(status.error ? formatApiError(status.error, t("connection.testFailed")) : t("connection.testFailed"));
        return;
      }
      onSave(normalizedConfig);
    } catch (exception) {
      setError(formatApiException(exception, t("connection.testFailed")));
    } finally {
      setTesting(false);
    }
  }

  function updateDraft<K extends keyof RegistryConnectionConfig>(key: K, value: RegistryConnectionConfig[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <Modal
      cancelText={force ? undefined : t("actions.cancel")}
      centered
      closable={!force}
      confirmLoading={testing}
      hasCancel={!force}
      maskClosable={!force}
      okText={t("actions.testAndSave")}
      title={t("connection.title")}
      visible={visible}
      width={640}
      onCancel={force ? undefined : onCancel}
      onOk={() => void submit()}
    >
      <form className="semi-form-stack compact-form" onSubmit={(event) => void submit(event)}>
        <Banner
          closeIcon={null}
          type="info"
          description={t("connection.corsNotice")}
        />
        <Form.Label text={t("common.registryUrl")} />
        <Input
          autoFocus
          placeholder="https://registry.example.com"
          prefix={<IconServer />}
          value={draft.registryUrl}
          onChange={(value) => updateDraft("registryUrl", value)}
        />
        <Row gutter={12}>
          <Col span={12}>
            <Form.Label text={t("login.username")} />
            <Input
              autoComplete="username"
              placeholder="robot"
              value={draft.username ?? ""}
              onChange={(value) => updateDraft("username", value)}
            />
          </Col>
          <Col span={12}>
            <Form.Label text={t("login.password")} />
            <Input
              autoComplete="current-password"
              mode="password"
              placeholder={t("connection.optionalPassword")}
              value={draft.password ?? ""}
              onChange={(value) => updateDraft("password", value)}
            />
          </Col>
        </Row>
        <Row gutter={12}>
          <Col span={12}>
            <Form.Label text={t("common.pageSize")} />
            <Input
              value={String(draft.pageSize)}
              onChange={(value) => updateDraft("pageSize", Number(value))}
            />
          </Col>
          <Col span={12}>
            <Form.Label text={t("common.requestTimeout")} />
            <Input
              suffix="s"
              value={String(draft.requestTimeoutSeconds)}
              onChange={(value) => updateDraft("requestTimeoutSeconds", Number(value))}
            />
          </Col>
        </Row>
        {error ? <Banner type="danger" description={error} closeIcon={null} /> : null}
        <button className="hidden-submit" type="submit" aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}

function AppShell({
  activePage,
  onNavigate
}: {
  activePage: Page;
  onNavigate: (page: Page) => void;
}) {
  const { language, setLanguage, t } = useI18n();
  const connection = useContext(RegistryConnectionContext);
  const navigation = useMemo(
    () => [
      { itemKey: "overview", text: t("nav.overview"), icon: <IconHome /> },
      { itemKey: "repositories", text: t("nav.repositories"), icon: <IconLayers /> },
      { itemKey: "settings", text: t("nav.settings"), icon: <IconSetting /> }
    ],
    [t]
  );

  return (
    <Layout className="app-layout">
      <Sider className="app-sider" aria-label={t("nav.primary")}>
        <Nav
          bodyStyle={{ flex: 1 }}
          className="app-nav"
          footer={
            connection ? (
              <Button
                block
                icon={<IconExit />}
                onClick={connection.onClearConnection}
                theme="borderless"
                type="tertiary"
              >
                {t("actions.disconnect")}
              </Button>
            ) : null
          }
          header={{
            logo: (
              <Avatar color="teal" size="small">
                <IconServer />
              </Avatar>
            ),
            text: t("app.name")
          }}
          items={navigation}
          selectedKeys={[activePage]}
          onSelect={({ itemKey }) => onNavigate(itemKey as Page)}
        />
      </Sider>
      <Layout className="app-main">
        <Header className="app-header">
          <div>
            <Text strong>{t("app.product")}</Text>
            <Text type="tertiary">{t("app.headerSubtitle")}</Text>
          </div>
          <Space>
            <Tag color="green" prefixIcon={<IconTerminal />}>{t("app.registryVersion")}</Tag>
            {connection ? (
              <Button icon={<IconSetting />} onClick={connection.onEditConnection} size="small" theme="light" type="tertiary">
                {t("actions.connection")}
              </Button>
            ) : null}
            <Select
              aria-label={t("language.switcherLabel")}
              optionList={[
                { label: "English", value: "en" },
                { label: "中文", value: "zh" }
              ]}
              size="small"
              value={language}
              onChange={(value) => setLanguage(normalizeLanguage(value))}
            />
          </Space>
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
  const { language, t } = useI18n();
  const { client } = useRegistryConnection();
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
      scope: next && hasNext ? t("common.currentPage") : t("common.loaded")
    }));
  }, [hasNext, next, query, repositories, t]);

  const columns = useMemo(
    () => [
      {
        title: t("common.repository"),
        dataIndex: "repository",
        render: (repository: string) => (
          <a className="resource-link" href={repositoryPath(repository)}>
            <IconLayers />
            <span>{repository}</span>
          </a>
        )
      },
      {
        title: t("common.loadScope"),
        dataIndex: "scope",
        width: 150,
        render: (scope: string) => <Tag color={scope === t("common.loaded") ? "green" : "blue"}>{scope}</Tag>
      }
    ],
    [t]
  );

  async function fetchRepositoryPage(last = "") {
    return client.listRepositories(last) as Promise<RepositoryResponse>;
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
      setError(t("errors.loadRepositories"));
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
      setError(t("errors.loadAllRepositories"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadFirstPage();
  }, [client]);

  return (
    <section className="page-frame">
      <div className="page-heading">
        <div>
          <Tag color="teal" size="large">{t("nav.repositories")}</Tag>
          <Title heading={2}>{t("nav.repositories")}</Title>
          <Paragraph type="tertiary">{t("repositories.description")}</Paragraph>
        </div>
        <div className="page-actions">
          <Space>
            <Button icon={<IconRefresh />} loading={loading} onClick={loadFirstPage} theme="light" type="tertiary">
              {t("actions.refresh")}
            </Button>
            <Button disabled={!hasNext || loading} onClick={loadAllRepositories} theme="solid" type="primary">
              {t("actions.loadAll")}
            </Button>
          </Space>
        </div>
      </div>
      <Space vertical spacing={20} className="full-width">
        <Card className="workspace-card" shadows="hover">
          <div className="table-toolbar">
            <Input
              className="search-input"
              placeholder={t("repositories.searchPlaceholder")}
              prefix={<IconSearch />}
              showClear
              value={query}
              onChange={setQuery}
            />
            <Text type="tertiary">{loadedText(language, repositories.length)}</Text>
          </div>
          {error ? <Banner type="danger" description={error} closeIcon={null} /> : null}
          <Table<RepositoryRow>
            columns={columns}
            dataSource={filteredRepositories}
            empty={<Empty title={t("empty.repositoriesTitle")} description={t("empty.repositoriesDescription")} />}
            loading={loading}
            pagination={false}
            rowKey="key"
            size="middle"
          />
        </Card>
      </Space>
    </section>
  );
}

function ManifestDetailPage({ repository, reference }: { repository: string; reference: string }) {
  const { t } = useI18n();
  const { client } = useRegistryConnection();
  const [manifest, setManifest] = useState<ManifestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadManifest() {
      setLoading(true);
      setError("");
      try {
        const body = await client.getManifest(repository, reference);
        if (active) {
          setManifest(body);
        }
      } catch (exception) {
        if (active) {
          setError(formatApiException(exception, t("errors.loadManifest")));
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
  }, [client, reference, repository, t]);

  return (
    <section className="page-frame">
      <div className="page-heading">
        <div>
          <Tag color="teal" size="large">{t("actions.manifest")}</Tag>
          <Title heading={2}>{reference}</Title>
          <Paragraph type="tertiary">{repository}</Paragraph>
        </div>
        <div className="page-actions">
          <Button
            icon={<IconChevronLeft />}
            onClick={() => openDocumentPath(repositoryPath(repository))}
            theme="light"
            type="tertiary"
          >
            {t("actions.backToTags")}
          </Button>
        </div>
      </div>
      <Space vertical spacing={20} className="full-width">
        {error ? <Banner type="danger" description={error} closeIcon={null} /> : null}
        <Spin spinning={loading}>
          {manifest ? (
            <Space vertical spacing={20} className="full-width">
              <Card className="workspace-card" shadows="hover">
                <Descriptions
                  align="plain"
                  column={2}
                  data={[
                    { key: t("common.repository"), value: manifest.repository },
                    { key: t("common.reference"), value: manifest.reference },
                    { key: t("common.digest"), value: <code className="inline-code">{manifest.digest}</code>, span: 2 },
                    { key: t("common.mediaType"), value: manifest.mediaType },
                    { key: t("common.schemaVersion"), value: String(manifest.schemaVersion) },
                    { key: t("common.tagSize"), value: formatBytes(manifest.size) }
                  ]}
                />
              </Card>
              <ManifestDescriptors manifest={manifest} />
              <Card className="workspace-card" shadows="hover" title={t("common.rawJson")}>
                <pre className="raw-json">{JSON.stringify(manifest.raw, null, 2)}</pre>
              </Card>
            </Space>
          ) : null}
        </Spin>
      </Space>
    </section>
  );
}

function ManifestDescriptors({ manifest }: { manifest: ManifestResponse }) {
  const { t } = useI18n();
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
        title: t("common.digest"),
        dataIndex: "digest",
        render: (digest: string) => <code className="inline-code">{digest}</code>
      },
      {
        title: manifest.layers && manifest.layers.length > 0 ? t("common.mediaType") : t("common.platform"),
        dataIndex: "mediaType",
        render: (value: string) => <Text>{value}</Text>
      },
      {
        title: t("common.size"),
        dataIndex: "size",
        width: 130
      }
    ],
    [manifest.layers, t]
  );

  const title = manifest.layers && manifest.layers.length > 0 ? t("common.layers") : t("common.platformManifests");
  const description = manifest.layers && manifest.layers.length > 0
    ? undefined
    : t("common.childManifestNote");

  return (
    <Card className="workspace-card" shadows="hover" title={title}>
      {description ? <Paragraph type="tertiary">{description}</Paragraph> : null}
      <Table<DescriptorRow>
        columns={columns}
        dataSource={rows}
        empty={<Empty title={t("empty.descriptorTitle")} description={t("empty.descriptorDescription")} />}
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
  const { language, t } = useI18n();
  const { client, config } = useRegistryConnection();
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
      command: registryUrl ? pullCommandFor(registryUrl, repository, tag) : `${t("common.registryUrl")}...`
    }));
  }, [query, registryUrl, repository, tags, t]);

  const columns = useMemo(
    () => [
      {
        title: t("common.tag"),
        dataIndex: "tag",
        render: (tag: string, record: TagRow) => (
          <div className="tag-cell">
            <Text strong>{tag}</Text>
            <code>{record.command}</code>
          </div>
        )
      },
      {
        title: t("common.operation"),
        dataIndex: "tag",
        width: 330,
        render: (tag: string) => (
          <Space wrap>
            <Button
              icon={<IconFile />}
              onClick={() => openDocumentPath(`${repositoryPath(repository)}/manifests/${encodeURIComponent(tag)}`)}
              size="small"
              theme="light"
              type="tertiary"
            >
              {t("actions.manifest")}
            </Button>
            <Button
              icon={<IconCopy />}
              onClick={() => void copyPullCommand(tag)}
              size="small"
              theme="light"
              type={copiedTag === tag ? "primary" : "tertiary"}
            >
              {copiedTag === tag ? t("common.copied") : t("actions.pull")}
            </Button>
            <Button
              icon={<IconDelete />}
              loading={deleteLoadingTag === tag}
              onClick={() => void startDelete(tag)}
              size="small"
              theme="light"
              type="danger"
            >
              {t("actions.delete")}
            </Button>
          </Space>
        )
      }
    ],
    [copiedTag, deleteLoadingTag, repository, t]
  );

  async function fetchTagPage(last = "") {
    return client.listTags(repository, last) as Promise<TagsResponse>;
  }

  async function loadFirstPage() {
    setLoading(true);
    setError("");
    try {
      const body = await fetchTagPage();
      setTags(body.tags);
      setNext(body.pagination.next ?? "");
      setHasNext(body.pagination.hasNext);
    } catch (exception) {
      setError(formatApiException(exception, t("errors.loadTags")));
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
    } catch (exception) {
      setError(formatApiException(exception, t("errors.loadAllTags")));
    } finally {
      setLoading(false);
    }
  }

  async function copyPullCommand(tag: string) {
    const command = pullCommandFor(registryUrl, repository, tag);
    await navigator.clipboard.writeText(command);
    setCopiedTag(tag);
    Toast.success(t("toast.pullCopied"));
  }

  async function startDelete(tag: string) {
    setDeleteLoadingTag(tag);
    setDeleteError("");
    setDeleteStatus("");
    setDeleteInput("");
    try {
      const body = await client.getDigest(repository, tag) as DigestResponse;
      setDeleteTarget({ tag, digest: body.digest });
    } catch (deleteException) {
      setDeleteError(formatApiException(deleteException, t("errors.resolveDigest")));
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
      const body = await client.deleteManifest(repository, deleteTarget.digest) as DeleteManifestResponse;
      setDeleteStatus(language === "zh" ? `删除请求已接受，状态码 ${body.status}。` : `Deletion accepted with status ${body.status}.`);
      setDeleteTarget(null);
      setDeleteInput("");
      await loadFirstPage();
    } catch (deleteException) {
      setDeleteError(formatApiException(deleteException, t("errors.deleteManifest")));
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
    setRegistryUrl(config.registryUrl);
    void loadFirstPage();
  }, [client, config.registryUrl, repository]);

  return (
    <section className="page-frame">
      <div className="page-heading">
        <div>
          <Tag color="teal" size="large">{t("repositoryDetail.title")}</Tag>
          <Title heading={2}>{repository}</Title>
          <Paragraph type="tertiary">{t("repositoryDetail.description")}</Paragraph>
        </div>
        <div className="page-actions">
          <Space>
            <Button
              icon={<IconChevronLeft />}
              onClick={() => openDocumentPath("/repositories")}
              theme="light"
              type="tertiary"
            >
              {t("actions.back")}
            </Button>
            <Button icon={<IconRefresh />} loading={loading} onClick={loadFirstPage} theme="light" type="tertiary">
              {t("actions.refresh")}
            </Button>
            <Button disabled={!hasNext || loading} onClick={loadAllTags} theme="solid" type="primary">
              {t("actions.loadAll")}
            </Button>
          </Space>
        </div>
      </div>
      <Space vertical spacing={20} className="full-width">
        <Card className="workspace-card" shadows="hover">
          <div className="table-toolbar">
            <Input
              className="search-input"
              placeholder={t("tags.searchPlaceholder")}
              prefix={<IconSearch />}
              showClear
              value={query}
              onChange={setQuery}
            />
            <Text type="tertiary">{loadedText(language, tags.length)}</Text>
          </div>
          {error ? <Banner type="danger" description={error} closeIcon={null} /> : null}
          {deleteError && !deleteTarget ? <Banner type="danger" description={deleteError} closeIcon={null} /> : null}
          {deleteStatus ? <Banner type="success" description={deleteStatus} closeIcon={null} /> : null}
          <Table<TagRow>
            columns={columns}
            dataSource={filteredTags}
            empty={<Empty title={t("empty.tagsTitle")} description={t("empty.tagsDescription")} />}
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
      </Space>
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
  deleteTarget: DeleteTarget | null;
  deleting: boolean;
  onCancel: () => void;
  onChangeInput: (value: string) => void;
  onConfirm: () => void;
  repository: string;
}) {
  const { t } = useI18n();
  const operation = deleteTarget ? `DELETE /v2/${repository}/manifests/${deleteTarget.digest}` : "";
  const canDelete = Boolean(deleteTarget) && deleteInput === deleteTarget?.tag && !deleting;

  return (
    <Modal
      cancelText={t("actions.cancel")}
      centered
      confirmLoading={deleting}
      hasCancel
      okButtonProps={{ disabled: !canDelete, type: "danger" }}
      okText={t("actions.deleteManifest")}
      title={t("delete.confirmTitle")}
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
              { key: t("common.repository"), value: repository },
              { key: t("common.tag"), value: deleteTarget.tag },
              { key: t("common.digest"), value: <code className="inline-code">{deleteTarget.digest}</code> },
              { key: t("common.operation"), value: <code className="inline-code">{operation}</code> }
            ]}
          />
          <Banner
            type="warning"
            closeIcon={null}
            description={t("delete.warning")}
          />
          <Form.Label text={t("delete.confirmTypeLabel")} />
          <Input
            autoFocus
            placeholder={deleteTarget.tag}
            value={deleteInput}
            validateStatus={deleteInput && deleteInput !== deleteTarget.tag ? "warning" : "default"}
            onChange={onChangeInput}
          />
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

function formatApiException(exception: unknown, fallback: string): string {
  if (isApiErrorPayload(exception)) {
    return formatApiError(exception, fallback);
  }
  return exception instanceof Error ? exception.message : fallback;
}

function formatApiError(error: ApiErrorPayload, fallback: string): string {
  if (!error.message) {
    return fallback;
  }
  const baseMessage = error.registryStatus
    ? `${error.message} Registry status ${error.registryStatus}.`
    : error.message;
  if (error.registryErrors && error.registryErrors.length > 0) {
    const registryDetails = error.registryErrors
      .map((registryError) => `${registryError.code}: ${registryError.message}`)
      .join(" ");
    return `${baseMessage} ${registryDetails}`;
  }
  return baseMessage;
}

function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
  return Boolean(value && typeof value === "object" && "code" in value && "status" in value);
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function OverviewPage() {
  const { language, t } = useI18n();
  const { client } = useRegistryConnection();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadStatus() {
      setError("");
      const body = await client.status();
      if (active) {
        setStatus(body);
      }
    }

    void loadStatus().catch(() => {
      if (active) {
        setError(t("errors.loadStatus"));
      }
    });

    return () => {
      active = false;
    };
  }, [client, t]);

  return (
    <section className="page-frame">
      <div className="page-heading">
        <div>
          <Tag color="teal" size="large">{t("nav.overview")}</Tag>
          <Title heading={2}>{t("overview.title")}</Title>
          <Paragraph type="tertiary">{t("overview.description")}</Paragraph>
        </div>
      </div>
      <Space vertical spacing={20} className="full-width">
        {error ? <Banner type="danger" description={error} closeIcon={null} /> : null}
        {status ? (
          <Space vertical spacing={20} className="full-width">
            {status.insecureTLS ? <InsecureTLSWarning /> : null}
            <Card className="workspace-card" shadows="hover" title={t("common.connection")}>
              <Descriptions
                align="plain"
                column={2}
                data={[
                  { key: t("common.registryUrl"), value: status.registryUrl, span: 2 },
                  { key: t("common.requestTimeout"), value: status.requestTimeout },
                  { key: t("common.insecureTLS"), value: status.insecureTLS ? t("common.enabled") : t("common.disabled") }
                ]}
              />
            </Card>
            <Row className="overview-status-row" gutter={[16, 16]}>
              <Col xs={24} sm={12} lg={8}>
                <Card className="workspace-card overview-status-card" shadows="hover">
                  <Space align="center" spacing={12}>
                    <Text type="tertiary">{t("common.apiStatus")}:</Text>
                    <Tag color={status.available ? "green" : "red"}>{status.available ? t("common.available") : t("common.unavailable")}</Tag>
                  </Space>
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={8}>
                <Card className="workspace-card overview-status-card" shadows="hover">
                  <Space align="center" spacing={12}>
                    <Text type="tertiary">{t("common.authentication")}:</Text>
                    <Tag color={status.authenticated ? "green" : "orange"}>{status.authenticated ? t("common.authenticated") : t("common.notAuthenticated")}</Tag>
                  </Space>
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={8}>
                <Card className="workspace-card overview-status-card" shadows="hover">
                  <Space align="center" spacing={12}>
                    <Text type="tertiary">{t("common.deleteCapability")}:</Text>
                    <Tag color={status.deleteCapability === "available" ? "orange" : "grey"}>{deleteCapabilityLabel(language, status.deleteCapability)}</Tag>
                  </Space>
                </Card>
              </Col>
            </Row>
          </Space>
        ) : (
          <Card className="workspace-card">
            <Spin />
          </Card>
        )}
        {status?.error ? (
          <Card className="error-card" shadows="hover" title={t("common.registryError")}>
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
      </Space>
    </section>
  );
}

function SettingsPage() {
  const { t } = useI18n();
  const { client, onEditConnection } = useRegistryConnection();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadSettings() {
      setError("");
      const body = await client.status();
      if (active) {
        setStatus(body);
      }
    }

    void loadSettings().catch(() => {
      if (active) {
        setError(t("errors.loadSettings"));
      }
    });

    return () => {
      active = false;
    };
  }, [client, t]);

  return (
    <section className="page-frame">
      <div className="page-heading">
        <div>
          <Tag color="teal" size="large">{t("nav.settings")}</Tag>
          <Title heading={2}>{t("settings.title")}</Title>
          <Paragraph type="tertiary">{t("settings.description")}</Paragraph>
        </div>
        <div className="page-actions">
          <Button icon={<IconSetting />} onClick={onEditConnection} theme="solid" type="primary">
            {t("actions.connection")}
          </Button>
        </div>
      </div>
      <Space vertical spacing={20} className="full-width">
        {error ? <Banner type="danger" description={error} closeIcon={null} /> : null}
        {status ? (
          <Space vertical spacing={20} className="full-width">
            {status.insecureTLS ? <InsecureTLSWarning /> : null}
            <Card className="workspace-card" shadows="hover">
              <Descriptions
                align="plain"
                column={2}
                data={[
                  { key: t("common.registryUrl"), value: status.registryUrl, span: 2 },
                  { key: t("common.pageSize"), value: String(status.pageSize) },
                  { key: t("common.requestTimeout"), value: status.requestTimeout },
                  { key: t("common.insecureTLS"), value: status.insecureTLS ? t("common.enabled") : t("common.disabled") },
                  { key: t("common.mode"), value: t("common.readOnly") }
                ]}
              />
            </Card>
          </Space>
        ) : (
          <Card className="workspace-card">
            <Spin />
          </Card>
        )}
      </Space>
    </section>
  );
}

function InsecureTLSWarning() {
  const { t } = useI18n();
  return (
    <Banner
      closeIcon={null}
      icon={<IconAlertTriangle />}
      type="warning"
      description={t("warning.insecureTLS")}
    />
  );
}
