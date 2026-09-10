import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams
} from "react-router-dom";
import { QueryClient, QueryClientProvider, useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  FileJson,
  Filter,
  Gauge,
  KeyRound,
  LayoutDashboard,
  Menu,
  Play,
  RefreshCw,
  Search,
  Settings,
  X,
  Zap,
  CheckCircle2,
  CircleDot,
  FileWarning,
  SlidersHorizontal
} from "lucide-react";
import {
  CreateReplayInputSchema,
  type EventStats,
  type ReplayDetail,
  type ReplayStatus,
  type RequestEventDetail,
  type RequestEventSummary
} from "@requestlab/shared";
import type { ApiKey, Environment, Project } from "./api";
import { api, ApiError } from "./api";
import "./styles.css";

const client = new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, retry: 1 } } });
const navItems = [
  { to: "/", label: "Genel Bakış", icon: LayoutDashboard },
  { to: "/requests", label: "İstekler", icon: Activity },
  { to: "/replays", label: "Tekrar Çalıştırmalar", icon: Play },
  { to: "/settings", label: "Ayarlar", icon: Settings }
];

export function App() {
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.projects });
  const [projectId, setProjectId] = useState(
    () => localStorage.getItem("requestlab-project") || ""
  );
  const project =
    projects.data?.data.find((item) => item.id === projectId) || projects.data?.data[0];
  useEffect(() => {
    if (project) {
      setProjectId(project.id);
      localStorage.setItem("requestlab-project", project.id);
    }
  }, [project]);
  if (projects.isLoading)
    return (
      <div className="center-state">
        <Spinner />
        <span>Projeler yükleniyor...</span>
      </div>
    );
  if (projects.isError || !project)
    return (
      <div className="center-state">
        <AlertTriangle />
        <strong>Project verisi alınamadı</strong>
        <p>{errorMessage(projects.error)}</p>
      </div>
    );
  return (
    <Shell
      project={project}
      projects={projects.data!.data}
      projectId={projectId || project.id}
      onProject={setProjectId}
    />
  );
}

function Shell({
  project,
  projects,
  projectId,
  onProject
}: {
  project: Project;
  projects: Project[];
  projectId: string;
  onProject: (id: string) => void;
}) {
  const environments = useQuery({
    queryKey: ["environments", projectId],
    queryFn: () => api.environments(projectId)
  });
  const [environmentId, setEnvironmentId] = useState(
    () => localStorage.getItem("requestlab-environment") || ""
  );
  const [mobileNav, setMobileNav] = useState(false);
  const environment =
    environments.data?.data.find((item) => item.id === environmentId) || environments.data?.data[0];
  useEffect(() => {
    if (environment) {
      setEnvironmentId(environment.id);
      localStorage.setItem("requestlab-environment", environment.id);
    }
  }, [environment]);
  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="icon-button mobile-menu"
          onClick={() => setMobileNav(true)}
          aria-label="Menüyü aç"
        >
          <Menu />
        </button>
        <Link className="brand" to="/">
          <span className="brand-mark">{`{ }`}</span>
          <span>RequestLab</span>
        </Link>
        <div className="selectors">
          <label>
            Proje
            <select value={projectId} onChange={(e) => onProject(e.target.value)}>
              {projects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ortam
            <select
              value={environment?.id || ""}
              onChange={(e) => setEnvironmentId(e.target.value)}
            >
              {environments.data?.data.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <Connection />
        </div>
        <div className="top-actions">
          <button className="icon-button" aria-label="Ara">
            <Search />
          </button>
          <button className="docs-button">
            Dokümantasyon <CircleHelp size={16} />
          </button>
        </div>
      </header>
      <div className="layout">
        <aside className={mobileNav ? "sidebar open" : "sidebar"}>
          <div className="sidebar-head">
            <span>ÇALIŞMA ALANI</span>
            <button
              className="icon-button mobile-close"
              onClick={() => setMobileNav(false)}
              aria-label="Menüyü kapat"
            >
              <X />
            </button>
          </div>
          <nav>
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setMobileNav(false)}
                className={({ isActive }: { isActive?: boolean }) => (isActive ? "active" : "")}
              >
                <Icon size={18} />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-foot">
            <div className="avatar">RL</div>
            <div>
              <strong>{project.name}</strong>
              <small>{project.slug}</small>
            </div>
          </div>
        </aside>
        {mobileNav && (
          <button
            className="backdrop"
            onClick={() => setMobileNav(false)}
            aria-label="Menüyü kapat"
          />
        )}
      </div>
      <main className="content">
        <Routes>
          <Route
            path="/"
            element={<Overview projectId={projectId} environmentId={environment?.id} />}
          />
          <Route
            path="/requests"
            element={
              <Requests projectId={projectId} environments={environments.data?.data || []} />
            }
          />
          <Route
            path="/replays"
            element={<Replays projectId={projectId} environments={environments.data?.data || []} />}
          />
          <Route
            path="/replays/:replayId"
            element={
              <ReplayDetailPage
                projectId={projectId}
                environments={environments.data?.data || []}
              />
            }
          />
          <Route
            path="/settings"
            element={
              <SettingsPage project={project} environments={environments.data?.data || []} />
            }
          />
        </Routes>
      </main>
    </div>
  );
}

function Connection() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => api.health(),
    refetchInterval: 30_000
  });
  return (
    <span className={health.isSuccess ? "connection online" : "connection"}>
      <i />
      {health.isSuccess ? "Bağlı" : "Bağlantı yok"}
    </span>
  );
}
function Overview({ projectId, environmentId }: { projectId: string; environmentId?: string }) {
  const stats = useQuery({
    queryKey: ["stats", projectId, environmentId],
    queryFn: () => api.stats(projectId, { environmentId }),
    refetchInterval: 30_000
  });
  return (
    <Page title="Genel Bakış" subtitle="Gerçek API trafiğinizin sağlık görünümü">
      <Toolbar onRefresh={() => stats.refetch()} loading={stats.isFetching} />
      {stats.isLoading ? (
        <SkeletonGrid />
      ) : stats.isError ? (
        <ErrorState error={stats.error} />
      ) : (
        <OverviewContent stats={stats.data!.data} />
      )}
    </Page>
  );
}
function OverviewContent({ stats }: { stats: EventStats }) {
  const max = Math.max(...stats.statusDistribution.map((item) => item.count), 1);
  return (
    <>
      <div className="metric-grid">
        <Metric
          icon={<Zap />}
          label="Toplam istek"
          value={stats.totalRequests.toLocaleString("tr-TR")}
          hint="Seçili ortam"
          tone="purple"
        />
        <Metric
          icon={<AlertTriangle />}
          label="Hata oranı"
          value={`%${(stats.errorRate * 100).toFixed(1)}`}
          hint={`${stats.errorCount} hata`}
          tone="red"
        />
        <Metric
          icon={<Clock3 />}
          label="Ort. yanıt süresi"
          value={`${stats.averageDurationMs} ms`}
          hint="Gerçek event verisi"
          tone="blue"
        />
      </div>
      <div className="overview-grid">
        <section className="panel chart-panel">
          <div className="panel-title">
            <div>
              <span className="eyebrow">TRAFFIC HEALTH</span>
              <h2>Durum kodu dağılımı</h2>
            </div>
            <BarChart3 />
          </div>
          <div className="bars">
            {stats.statusDistribution.length ? (
              stats.statusDistribution.map((item) => (
                <div className="bar-row" key={item.statusCode}>
                  <span className={`status-dot status-${item.statusCode}`}>{item.statusCode}</span>
                  <div className="bar-track">
                    <b
                      className={`bar-fill status-${item.statusCode}`}
                      style={{ width: `${Math.max((item.count / max) * 100, 3)}%` }}
                    />
                  </div>
                  <strong>{item.count}</strong>
                </div>
              ))
            ) : (
              <EmptyState title="Henüz event bulunmuyor" />
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-title">
            <div>
              <span className="eyebrow">HOTSPOTS</span>
              <h2>En çok hata veren endpoint'ler</h2>
            </div>
            <Gauge />
          </div>
          <div className="endpoint-list">
            {stats.topEndpoints.length ? (
              stats.topEndpoints.map((item) => (
                <div className="endpoint-row" key={item.path}>
                  <code>{item.path}</code>
                  <span>
                    {item.errorCount} hata / {item.count}
                  </span>
                </div>
              ))
            ) : (
              <EmptyState title="Henüz endpoint bulunmuyor" />
            )}
          </div>
        </section>
      </div>
      <section className="panel">
        <div className="panel-title">
          <div>
            <span className="eyebrow">RECENT FAILURES</span>
            <h2>Son hatalar</h2>
          </div>
          <Link to="/requests?statusCode=500">
            Tümünü gör <ChevronRight size={15} />
          </Link>
        </div>
        <EventTable events={stats.recentErrors} compact />
      </section>
    </>
  );
}
function Requests({ projectId, environments }: { projectId: string; environments: Environment[] }) {
  const location = useLocation();
  const navigate = useNavigate();
  const environmentQuery = useQuery({
    queryKey: ["environments", projectId],
    queryFn: () => api.environments(projectId)
  });
  const availableEnvironments = environmentQuery.data?.data || environments;
  const params = new URLSearchParams(location.search);
  const [search, setSearch] = useState(params.get("search") || "");
  const [debounced, setDebounced] = useState(search);
  const [page, setPage] = useState(Number(params.get("page") || 1));
  const [selected, setSelected] = useState(params.get("event") || "");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const query = {
    page,
    pageSize: Number(params.get("pageSize") || 20),
    search: debounced,
    method: params.get("method") || undefined,
    statusCode: params.get("statusCode") || undefined,
    environmentId: params.get("environmentId") || undefined,
    from: params.get("from") || undefined,
    to: params.get("to") || undefined
  };
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search]);
  const events = useQuery({
    queryKey: ["events", projectId, query],
    queryFn: ({ signal }) => api.events(projectId, query, signal),
    refetchInterval: autoRefresh ? 30_000 : false
  });
  const detail = useQuery({
    queryKey: ["event", projectId, selected],
    queryFn: ({ signal }) => api.event(projectId, selected, signal),
    enabled: Boolean(selected)
  });
  function update(key: string, value: string) {
    const next = new URLSearchParams(location.search);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    navigate(`/requests?${next}`);
    setPage(1);
  }
  return (
    <Page title="İstekler" subtitle="API trafiğini inceleyin, filtreleyin ve hataları anlayın">
      <div className="request-toolbar">
        <div className="search-field">
          <Search size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Endpoint, istek ID veya hata ara..."
            aria-label="İstek ara"
          />
        </div>
        <select value={query.method || ""} onChange={(e) => update("method", e.target.value)}>
          <option value="">Tüm metotlar</option>
          <option>GET</option>
          <option>POST</option>
          <option>PATCH</option>
          <option>DELETE</option>
        </select>
        <select
          value={query.statusCode || ""}
          onChange={(e) => update("statusCode", e.target.value)}
        >
          <option value="">Tüm durumlar</option>
          <option value="200">200 başarılı</option>
          <option value="400">4xx istemci</option>
          <option value="500">5xx sunucu</option>
        </select>
        <select
          value={query.environmentId || ""}
          onChange={(e) => update("environmentId", e.target.value)}
        >
          <option value="">Tüm ortamlar</option>
          {availableEnvironments.map((env) => (
            <option key={env.id} value={env.id}>
              {env.name}
            </option>
          ))}
        </select>
        <button
          className="ghost-button"
          onClick={() => {
            setSearch("");
            navigate("/requests");
          }}
        >
          <Filter size={15} /> Temizle
        </button>
        <label className="refresh-toggle">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />{" "}
          Otomatik yenile
        </label>
      </div>
      {events.isLoading ? (
        <SkeletonTable />
      ) : events.isError ? (
        <ErrorState error={events.error} />
      ) : events.data!.data.length ? (
        <>
          <EventTable
            events={events.data!.data}
            onSelect={(id) => {
              setSelected(id);
              navigate(
                `/requests?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(location.search)), event: id })}`
              );
            }}
          />
          <div className="pagination">
            <span>{events.data!.pagination.total} sonuç</span>
            <div>
              <button
                className="icon-button"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft />
              </button>
              <b>
                {page} / {Math.max(events.data!.pagination.totalPages, 1)}
              </b>
              <button
                className="icon-button"
                disabled={page >= events.data!.pagination.totalPages}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight />
              </button>
            </div>
          </div>
        </>
      ) : (
        <EmptyState
          title="Henüz event bulunmuyor"
          description="Yeni istekler geldiğinde burada görünecek."
        />
      )}
      {selected && (
        <Drawer
          loading={detail.isLoading}
          error={detail.error}
          event={detail.data?.data}
          projectId={projectId}
          environments={availableEnvironments}
          onClose={() => {
            setSelected("");
            const next = new URLSearchParams(location.search);
            next.delete("event");
            navigate(`/requests?${next}`);
          }}
        />
      )}
    </Page>
  );
}
function EventTable({
  events,
  onSelect,
  compact = false
}: {
  events: RequestEventSummary[];
  onSelect?: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "event-table compact" : "event-table"}>
      <div className="table-head">
        <span>Metot</span>
        <span>Endpoint</span>
        <span>Durum</span>
        <span>Süre</span>
        <span>Zaman</span>
      </div>
      {events.map((event) => (
        <button className="table-row" key={event.id} onClick={() => onSelect?.(event.id)}>
          <span>
            <Method method={event.method} />
          </span>
          <code>{event.path}</code>
          <span>
            <Status code={event.statusCode} />
          </span>
          <span>{event.durationMs == null ? "—" : `${event.durationMs} ms`}</span>
          <time>{formatDate(event.occurredAt)}</time>
        </button>
      ))}
    </div>
  );
}
function Drawer({
  event,
  loading,
  error,
  onClose,
  projectId,
  environments
}: {
  event?: RequestEventDetail;
  loading: boolean;
  error?: unknown;
  onClose: () => void;
  projectId: string;
  environments: Environment[];
}) {
  const [tab, setTab] = useState("summary");
  const [replayOpen, setReplayOpen] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <>
      <button className="drawer-backdrop" onClick={onClose} aria-label="Detayı kapat" />
      <aside className="drawer" aria-label="İstek detayı">
        <div className="drawer-head">
          <div>
            <span className="eyebrow">EVENT DETAIL</span>
            <h2>İstek detayı</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Kapat">
            <X />
          </button>
        </div>
        {loading ? (
          <SkeletonTable />
        ) : error ? (
          <ErrorState error={error} />
        ) : (
          event && (
            <>
              <div className="detail-hero">
                <div>
                  <Method method={event.method} />
                  <code>{event.path}</code>
                </div>
                <Status code={event.statusCode} />
              </div>
              <div className="detail-meta">
                <Meta label="Request ID" value={event.requestId || "—"} />
                <Meta label="Route" value={event.route || "—"} mono />
                <Meta label="Süre" value={`${event.durationMs ?? "—"} ms`} />
                <Meta label="Environment" value={event.environmentId} />
                <Meta label="Oluşma zamanı" value={formatDate(event.occurredAt)} />
              </div>
              <div className="tabs">
                {[
                  ["summary", "Özet"],
                  ["request", "Request"],
                  ["response", "Response"],
                  ["error", "Hata"]
                ].map(([id, label]) => (
                  <button
                    className={tab === id ? "selected" : ""}
                    onClick={() => setTab(id || "summary")}
                    key={id}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {tab === "summary" && (
                <div className="detail-section">
                  <Meta label="Hata türü" value={event.errorType || "Yok"} />
                  <Meta label="Hata mesajı" value={event.errorMessage || "Yok"} />
                  <button
                    className="replay-button"
                    disabled={!canReplay(event, environments)}
                    title={replayAvailability(event, environments)}
                    onClick={() => setReplayOpen(true)}
                  >
                    <Play size={15} /> Test ortamında tekrar çalıştır
                  </button>
                  {!canReplay(event, environments) && (
                    <p className="field-help">{replayAvailability(event, environments)}</p>
                  )}
                </div>
              )}
              {tab === "request" && (
                <JsonSections
                  values={[
                    ["Headers", event.requestHeaders],
                    ["Query", event.query],
                    ["Body", event.requestBody]
                  ]}
                />
              )}
              {tab === "response" && (
                <JsonSections
                  values={[
                    ["Headers", event.responseHeaders],
                    ["Body", event.responseBody]
                  ]}
                />
              )}
              {tab === "error" && (
                <JsonSections
                  values={[
                    ["Error type", event.errorType],
                    ["Error message", event.errorMessage],
                    ["Stack trace", event.stackTrace]
                  ]}
                />
              )}
            </>
          )
        )}
      </aside>
      {replayOpen && event && (
        <ReplayForm
          projectId={projectId}
          event={event}
          environments={environments}
          onClose={() => setReplayOpen(false)}
          onCreated={(id) => navigate(`/replays/${id}`)}
        />
      )}
    </>
  );
}

const blockedReplayHeaders = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "host",
  "content-length",
  "connection",
  "transfer-encoding",
  "forwarded",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-real-ip"
]);
const sideEffectMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const terminalStatuses = new Set<ReplayStatus>(["SUCCEEDED", "FAILED", "UNCERTAIN"]);

function replayEnvironments(environments: Environment[]) {
  return environments.filter(
    (environment) => environment.type !== "PRODUCTION" && environment.replayEnabled
  );
}
function canReplay(event: RequestEventDetail, environments: Environment[]) {
  return event.statusCode >= 400 && replayEnvironments(environments).length > 0;
}
function replayAvailability(event: RequestEventDetail, environments: Environment[]) {
  if (event.statusCode < 400) return "Yalnızca hatalı event'ler tekrar çalıştırılabilir.";
  if (!replayEnvironments(environments).length)
    return "Replay açık development, test veya staging ortamı bulunmuyor.";
  return "";
}
type ReplayFormValues = {
  environmentId: string;
  query: string;
  headers: string;
  body: string;
  confirm: boolean;
};

function ReplayForm({
  projectId,
  event,
  environments,
  onClose,
  onCreated
}: {
  projectId: string;
  event: RequestEventDetail;
  environments: Environment[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const eligible = replayEnvironments(environments);
  const defaultEnvironment = eligible[0];
  const { register, handleSubmit, setValue, watch } = useForm<ReplayFormValues>({
    defaultValues: {
      environmentId: defaultEnvironment?.id ?? "",
      query: jsonText(event.query),
      headers: jsonText(safeReplayHeaders(event.requestHeaders)),
      body: jsonText(event.requestBody),
      confirm: false
    }
  });
  const selected = eligible.find((item) => item.id === watch("environmentId"));
  const method = event.method.toUpperCase();
  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof api.createReplay>[2]) =>
      api.createReplay(projectId, event.id, input)
  });
  const [formError, setFormError] = useState("");
  const [jsonErrors, setJsonErrors] = useState<Record<string, string>>({});
  const submit = (values: ReplayFormValues) => {
    const parsed: Record<string, unknown> = {};
    const nextErrors: Record<string, string> = {};
    for (const field of ["query", "headers", "body"] as const) {
      if (!values[field].trim()) continue;
      try {
        parsed[field] = JSON.parse(values[field]);
      } catch {
        nextErrors[field] = "Geçerli JSON girin veya alanı boş bırakın.";
      }
    }
    setJsonErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    const input = {
      environmentId: values.environmentId,
      query: cleanRedacted(parsed.query) as Record<string, unknown> | undefined,
      headers: cleanHeaders(parsed.headers),
      body: cleanRedacted(parsed.body),
      ...(sideEffectMethods.has(method) ? { confirmSideEffects: values.confirm } : {})
    };
    const valid = CreateReplayInputSchema.safeParse(input);
    if (!valid.success) {
      setFormError("Replay formundaki değerleri kontrol edin.");
      return;
    }
    if (sideEffectMethods.has(method) && !values.confirm) {
      setFormError("Yan etki onayı gerekli.");
      return;
    }
    setFormError("");
    mutation.mutate(valid.data, {
      onSuccess: (result) => onCreated(result.data.id),
      onError: (error) => setFormError(errorMessage(error))
    });
  };
  return (
    <>
      <button className="drawer-backdrop" onClick={onClose} aria-label="Replay formunu kapat" />
      <aside className="drawer replay-drawer" aria-label="Replay oluştur">
        <div className="drawer-head">
          <div>
            <span className="eyebrow">SAFE REPLAY</span>
            <h2>Tekrar çalıştır</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Replay formunu kapat">
            <X />
          </button>
        </div>
        <form onSubmit={handleSubmit(submit)} className="replay-form" noValidate>
          <div className="replay-summary">
            <div>
              <Method method={method} />
              <code>{event.path}</code>
            </div>
            <span>
              Orijinal: <Status code={event.statusCode} />
            </span>
          </div>
          <label>
            HTTP method
            <input value={method} readOnly />
          </label>
          <label>
            Orijinal path
            <input value={event.path} readOnly />
          </label>
          <label>
            Hedef environment
            <select {...register("environmentId")} aria-label="Hedef environment">
              {eligible.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.type})
                </option>
              ))}
            </select>
          </label>
          {selected && (
            <div className="readonly-url">
              <span>Hedef base URL</span>
              <code>{selected.baseUrl || "Tanımlanmamış"}</code>
            </div>
          )}
          <JsonEditor
            label="Query parametreleri"
            value={watch("query")}
            original={jsonText(event.query)}
            error={jsonErrors.query}
            onChange={(value) => setValue("query", value)}
          />
          <JsonEditor
            label="Güvenli header'lar"
            value={watch("headers")}
            original={jsonText(safeReplayHeaders(event.requestHeaders))}
            error={jsonErrors.headers}
            onChange={(value) => setValue("headers", value)}
            note="Authorization, cookie, host ve forwarding header'ları gösterilmez veya backend tarafından gönderilmez."
          />
          <JsonEditor
            label="Request body"
            value={watch("body")}
            original={jsonText(event.requestBody)}
            error={jsonErrors.body}
            onChange={(value) => setValue("body", value)}
            note="[REDACTED] alanlar gerçek değer değildir ve gönderilmez."
          />
          {sideEffectMethods.has(method) && (
            <label className="confirm-row">
              <input type="checkbox" {...register("confirm")} /> Bu isteğin test ortamındaki
              verileri değiştirebileceğini anlıyorum.
            </label>
          )}
          {formError && (
            <div className="form-error" role="alert">
              {formError}
            </div>
          )}
          <div className="form-actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Vazgeç
            </button>
            <button
              className="primary-button"
              type="submit"
              disabled={mutation.isPending || !selected}
            >
              {mutation.isPending ? (
                <>
                  <RefreshCw className="spin" size={15} /> Kuyruğa ekleniyor...
                </>
              ) : (
                <>
                  <Play size={15} /> Replay başlat
                </>
              )}
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}

function JsonEditor({
  label,
  value,
  original,
  error,
  onChange,
  note
}: {
  label: string;
  value: string;
  original: string;
  error?: string;
  onChange: (value: string) => void;
  note?: string;
}) {
  return (
    <div className="json-editor">
      <div className="editor-head">
        <label htmlFor={`json-${label}`}>{label}</label>
        <div>
          <button type="button" onClick={() => onChange(formatJson(value))}>
            Format JSON
          </button>
          <button type="button" onClick={() => onChange(original)}>
            Orijinale dön
          </button>
          <button type="button" onClick={() => navigator.clipboard?.writeText(value)}>
            Kopyala
          </button>
        </div>
      </div>
      <textarea
        id={`json-${label}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `error-${label}` : undefined}
        spellCheck={false}
      />
      {note && <small className="field-help">{note}</small>}
      {error && (
        <small className="form-error" id={`error-${label}`}>
          {error}
        </small>
      )}
    </div>
  );
}

function Replays({ projectId, environments }: { projectId: string; environments: Environment[] }) {
  const [status, setStatus] = useState("");
  const [environmentId, setEnvironmentId] = useState("");
  const [page, setPage] = useState(1);
  const result = useQuery({
    queryKey: ["replays", projectId, status, environmentId, page],
    queryFn: () =>
      api.replays(projectId, {
        status: status || undefined,
        environmentId: environmentId || undefined,
        page,
        pageSize: 20
      }),
    refetchInterval: 15_000
  });
  return (
    <Page title="Tekrar Çalıştırmalar" subtitle="Güvenli replay görevlerini ve sonuçlarını izleyin">
      <div className="request-toolbar replay-filters">
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          aria-label="Replay durumu"
        >
          <option value="">Tüm durumlar</option>
          {["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "UNCERTAIN"].map((item) => (
            <option key={item} value={item}>
              {statusLabel(item as ReplayStatus)}
            </option>
          ))}
        </select>
        <select
          value={environmentId}
          onChange={(event) => {
            setEnvironmentId(event.target.value);
            setPage(1);
          }}
          aria-label="Replay environment"
        >
          <option value="">Tüm ortamlar</option>
          {environments
            .filter((item) => item.type !== "PRODUCTION")
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
        </select>
        <button className="ghost-button" onClick={() => result.refetch()}>
          <RefreshCw size={15} className={result.isFetching ? "spin" : ""} /> Yenile
        </button>
      </div>
      {result.isLoading ? (
        <SkeletonTable />
      ) : result.isError ? (
        <ErrorState error={result.error} />
      ) : result.data?.data.length ? (
        <>
          <div className="replay-list">
            {result.data.data.map((replay) => (
              <Link className="replay-card" to={`/replays/${replay.id}`} key={replay.id}>
                <div>
                  <Method method={replay.method} />
                  <code>{replay.targetUrl}</code>
                </div>
                <StatusBadge status={replay.status} />
                <span>{replay.statusCode ?? "—"}</span>
                <span>{replay.durationMs == null ? "—" : `${replay.durationMs} ms`}</span>
                <time>{formatDate(replay.createdAt)}</time>
              </Link>
            ))}
          </div>
          <Pagination
            page={page}
            totalPages={result.data.pagination.totalPages}
            total={result.data.pagination.total}
            onPage={setPage}
          />
        </>
      ) : (
        <EmptyState
          title="Henüz replay bulunmuyor"
          description="Bir event detayından güvenli replay başlatabilirsiniz."
        />
      )}
    </Page>
  );
}

function ReplayDetailPage({
  projectId,
  environments
}: {
  projectId: string;
  environments: Environment[];
}) {
  const { replayId = "" } = useParams();
  const [manualRefresh, setManualRefresh] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const timeout = useRef<number | undefined>(undefined);
  const replay = useQuery({
    queryKey: ["replay", projectId, replayId, manualRefresh],
    queryFn: ({ signal }) => api.replay(projectId, replayId, signal),
    enabled: Boolean(replayId),
    refetchInterval: (query) => {
      const status = query.state.data?.data.status;
      return timedOut || (status && terminalStatuses.has(status)) ? false : 1000;
    }
  });
  const original = useQuery({
    queryKey: ["event", projectId, replay.data?.data.originalEventId],
    queryFn: () => api.event(projectId, replay.data!.data.originalEventId),
    enabled: Boolean(replay.data?.data.originalEventId)
  });
  useEffect(() => {
    timeout.current = window.setTimeout(() => setTimedOut(true), 30_000);
    return () => {
      if (timeout.current) window.clearTimeout(timeout.current);
    };
  }, []);
  if (replay.isLoading)
    return (
      <Page title="Replay detayı" subtitle="Durum yükleniyor...">
        <SkeletonTable />
      </Page>
    );
  if (replay.isError || !replay.data)
    return (
      <Page title="Replay detayı" subtitle="Replay sonucu">
        <ErrorState error={replay.error} />
      </Page>
    );
  const item = replay.data.data;
  const env = environments.find((entry) => entry.id === item.environmentId);
  const event = original.data?.data;
  return (
    <Page
      title="Replay detayı"
      subtitle={env ? `${env.name} ortamında güvenli tekrar çalıştırma` : "Replay sonucu"}
    >
      <Link className="back-link" to="/replays">
        <ChevronLeft size={15} /> Tüm replay'ler
      </Link>
      <section className="panel replay-status-panel">
        <div>
          <span className="eyebrow">REPLAY STATUS</span>
          <h2>
            <StatusBadge status={item.status} />
          </h2>
        </div>
        <button
          className="ghost-button"
          onClick={() => {
            setTimedOut(false);
            setManualRefresh((value) => value + 1);
          }}
        >
          <RefreshCw size={15} /> Yenile
        </button>
        <p aria-live="polite">
          {timedOut && !terminalStatuses.has(item.status)
            ? "Durum henüz kesinleşmedi. Manuel yenileme ile tekrar kontrol edin."
            : item.status === "QUEUED"
              ? "Replay kuyruğa alındı."
              : item.status === "RUNNING"
                ? "Replay çalışıyor..."
                : item.status === "UNCERTAIN"
                  ? "Durum henüz kesinleşmedi."
                  : item.errorMessage || "Replay tamamlandı."}
        </p>
      </section>
      {event && <Comparison original={event} replay={item} environment={env} />}
    </Page>
  );
}

function Comparison({
  original,
  replay,
  environment
}: {
  original: RequestEventDetail;
  replay: ReplayDetail;
  environment?: Environment;
}) {
  const [onlyChanges, setOnlyChanges] = useState(false);
  const requestDiff = diffJson(original.requestBody, replay.requestBody);
  const responseDiff = diffJson(original.responseBody, replay.responseBody);
  return (
    <div className="comparison">
      <div className="comparison-head">
        <div>
          <span className="eyebrow">RESULT COMPARISON</span>
          <h2>Orijinal ve replay sonucu</h2>
        </div>
        <label className="refresh-toggle">
          <input
            type="checkbox"
            checked={onlyChanges}
            onChange={(event) => setOnlyChanges(event.target.checked)}
          />{" "}
          Sadece değişiklikleri göster
        </label>
      </div>
      <div className="result-columns">
        <ResultColumn
          title="Orijinal İstek"
          code={original.statusCode}
          duration={original.durationMs}
          body={original.requestBody}
          response={original.responseBody}
          date={original.occurredAt}
        />
        <ResultColumn
          title="Tekrar Çalıştırma"
          code={replay.statusCode}
          duration={replay.durationMs}
          body={replay.requestBody}
          response={replay.responseBody}
          date={replay.finishedAt}
        />
      </div>
      <div className="comparison-meta">
        <Meta label="Environment" value={environment?.name || replay.environmentId} />
        <Meta label="Süre farkı" value={durationDelta(original.durationMs, replay.durationMs)} />
        <Meta label="Oluşma" value={formatDate(original.occurredAt)} />
        <Meta label="Başlama" value={replay.startedAt ? formatDate(replay.startedAt) : "—"} />
        <Meta label="Bitirme" value={replay.finishedAt ? formatDate(replay.finishedAt) : "—"} />
      </div>
      <section className="panel diff-panel">
        <div className="panel-title">
          <div>
            <span className="eyebrow">JSON DIFF</span>
            <h2>Request body farkı</h2>
          </div>
          <SlidersHorizontal />
        </div>
        <DiffList entries={requestDiff} onlyChanges={onlyChanges} />
        <h3>Response body farkı</h3>
        <DiffList entries={responseDiff} onlyChanges={onlyChanges} />
      </section>
    </div>
  );
}
function ResultColumn({
  title,
  code,
  duration,
  body,
  response,
  date
}: {
  title: string;
  code: number | null;
  duration: number | null;
  body: unknown;
  response: unknown;
  date: string | null;
}) {
  return (
    <article className="result-column">
      <div className="result-title">
        <h3>{title}</h3>
        <Status code={code ?? 0} />
      </div>
      <strong>{code ? statusText(code) : "Sonuç bekleniyor"}</strong>
      <span>{duration == null ? "—" : `${duration} ms`}</span>
      <time>{date ? formatDate(date) : "—"}</time>
      <JsonBlock label="Request body" value={body} />
      <JsonBlock label="Response body" value={response} />
    </article>
  );
}
type DiffEntry = {
  path: string;
  kind: "added" | "removed" | "changed" | "same";
  original: unknown;
  replay: unknown;
};
export function diffJson(
  original: unknown,
  replay: unknown,
  path = "$",
  entries: DiffEntry[] = []
) {
  if (Object.is(original, replay)) {
    entries.push({ path, kind: "same", original, replay });
    return entries;
  }
  if (isRecord(original) && isRecord(replay)) {
    const keys = new Set([...Object.keys(original), ...Object.keys(replay)]);
    for (const key of keys) diffJson(original[key], replay[key], `${path}.${key}`, entries);
    return entries;
  }
  if (original === undefined) entries.push({ path, kind: "added", original, replay });
  else if (replay === undefined) entries.push({ path, kind: "removed", original, replay });
  else entries.push({ path, kind: "changed", original, replay });
  return entries;
}
function DiffList({ entries, onlyChanges }: { entries: DiffEntry[]; onlyChanges: boolean }) {
  const visible = onlyChanges ? entries.filter((entry) => entry.kind !== "same") : entries;
  return (
    <div className="diff-list">
      {visible.length ? (
        visible.map((entry) => (
          <div className={`diff-row ${entry.kind}`} key={entry.path}>
            <b>
              {entry.kind === "added"
                ? "+"
                : entry.kind === "removed"
                  ? "−"
                  : entry.kind === "changed"
                    ? "~"
                    : "="}
            </b>
            <code>{entry.path}</code>
            <span>
              {entry.kind === "removed"
                ? jsonText(entry.original)
                : entry.kind === "added"
                  ? jsonText(entry.replay)
                  : `${jsonText(entry.original)} → ${jsonText(entry.replay)}`}
            </span>
          </div>
        ))
      ) : (
        <span className="field-help">Değişiklik yok.</span>
      )}
    </div>
  );
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
export function durationDelta(original: number | null, replay: number | null) {
  if (original == null || replay == null) return "—";
  const delta = replay - original;
  const percentage = original ? Math.round((delta / original) * 100) : 0;
  return `${delta >= 0 ? "+" : ""}${delta} ms (${percentage >= 0 ? "+" : ""}${percentage}%)`;
}
function statusText(code: number) {
  return code >= 500
    ? "Internal Server Error"
    : code === 201
      ? "Created"
      : code >= 400
        ? "Error"
        : "OK";
}
function StatusBadge({ status }: { status: ReplayStatus }) {
  const Icon =
    status === "SUCCEEDED"
      ? CheckCircle2
      : status === "FAILED"
        ? AlertTriangle
        : status === "UNCERTAIN"
          ? FileWarning
          : CircleDot;
  return (
    <span className={`replay-status ${status.toLowerCase()}`}>
      <Icon size={15} /> {statusLabel(status)}
    </span>
  );
}
function statusLabel(status: ReplayStatus) {
  return {
    QUEUED: "Kuyrukta",
    RUNNING: "Çalışıyor",
    SUCCEEDED: "Tamamlandı",
    FAILED: "Başarısız",
    UNCERTAIN: "Belirsiz"
  }[status];
}
function Pagination({
  page,
  totalPages,
  total,
  onPage
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="pagination">
      <span>{total} sonuç</span>
      <div>
        <button className="icon-button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft />
        </button>
        <b>
          {page} / {Math.max(totalPages, 1)}
        </b>
        <button
          className="icon-button"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight />
        </button>
      </div>
    </div>
  );
}
function jsonText(value: unknown) {
  return value == null ? "" : JSON.stringify(value, null, 2);
}
function formatJson(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}
function safeReplayHeaders(value: unknown) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, item]) => !blockedReplayHeaders.has(key.toLowerCase()) && item !== "[REDACTED]"
    )
  );
}
function cleanRedacted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cleanRedacted);
  if (isRecord(value))
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== "[REDACTED]")
        .map(([key, item]) => [key, cleanRedacted(item)])
    );
  return value;
}
function cleanHeaders(value: unknown) {
  return Object.fromEntries(
    Object.entries(isRecord(value) ? value : {}).filter(
      ([key, item]) =>
        !blockedReplayHeaders.has(key.toLowerCase()) &&
        typeof item === "string" &&
        item !== "[REDACTED]"
    )
  );
}
function JsonSections({ values }: { values: Array<[string, unknown]> }) {
  return (
    <div className="json-sections">
      {values.map(([label, value]) => (
        <JsonBlock key={label} label={label} value={value} />
      ))}
    </div>
  );
}
function JsonBlock({ label, value }: { label: string; value: unknown }) {
  const [copied, setCopied] = useState(false);
  const text =
    typeof value === "string" ? value : value == null ? "" : JSON.stringify(value, null, 2);
  return (
    <section className="json-block">
      <div>
        <span>{label}</span>
        <button
          className="copy-button"
          disabled={!text}
          onClick={() => {
            navigator.clipboard?.writeText(text);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          }}
        >
          <Copy size={14} /> {copied ? "Kopyalandı" : "Kopyala"}
        </button>
      </div>
      {text ? <pre>{highlight(text)}</pre> : <em>Veri yok</em>}
    </section>
  );
}
function highlight(text: string) {
  return text.split(/(\b\d+(?:\.\d+)?\b|"[^"\n]*"|\btrue\b|\bfalse\b|\bnull\b)/g).map((part, i) => (
    <span
      key={i}
      className={
        part.startsWith('"')
          ? "json-string"
          : /^(true|false|null|\d)/.test(part)
            ? "json-value"
            : undefined
      }
    >
      {part}
    </span>
  ));
}
function SettingsPage({
  project,
  environments
}: {
  project: Project;
  environments: Environment[];
}) {
  const keys = useQuery({ queryKey: ["keys", project.id], queryFn: () => api.keys(project.id) });
  return (
    <Page title="Ayarlar" subtitle="Proje ve ortam yapılandırması">
      <section className="settings-grid">
        <div className="panel">
          <span className="eyebrow">PROJECT</span>
          <h2>{project.name}</h2>
          <div className="settings-row">
            <span>Slug</span>
            <code>{project.slug}</code>
          </div>
          <div className="settings-row">
            <span>Oluşturulma</span>
            <span>{formatDate(project.createdAt)}</span>
          </div>
        </div>
        <div className="panel">
          <span className="eyebrow">ENVIRONMENTS</span>
          <h2>Ortamlar</h2>
          {environments.map((env) => (
            <div className="environment-row" key={env.id}>
              <div>
                <strong>{env.name}</strong>
                <small>{env.type}</small>
              </div>
              <span className={env.replayEnabled ? "pill good" : "pill muted"}>
                {env.replayEnabled ? "Replay açık" : "Replay kapalı"}
              </span>
            </div>
          ))}
        </div>
        <div className="panel keys-panel">
          <span className="eyebrow">API KEYS</span>
          <h2>API anahtarları</h2>
          {keys.isLoading ? (
            <Spinner />
          ) : keys.isError ? (
            <ErrorState error={keys.error} />
          ) : (
            keys.data!.data.map((key: ApiKey) => (
              <div className="key-row" key={key.id}>
                <KeyRound size={16} />
                <div>
                  <strong>{key.name}</strong>
                  <code>{key.keyPrefix}••••</code>
                </div>
                <span>
                  {key.revokedAt
                    ? "İptal edildi"
                    : `Son kullanım: ${key.lastUsedAt ? formatDate(key.lastUsedAt) : "Yok"}`}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </Page>
  );
}
function Page({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">REQUESTLAB / WORKSPACE</span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
function Metric({
  icon,
  label,
  value,
  hint,
  tone
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: string;
}) {
  return (
    <div className={`metric ${tone}`}>
      <div className="metric-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{hint}</small>
      </div>
    </div>
  );
}
function Toolbar({ onRefresh, loading }: { onRefresh: () => void; loading: boolean }) {
  return (
    <div className="toolbar">
      <span>
        <i className="live-dot" /> Son veriler
      </span>
      <button className="ghost-button" onClick={onRefresh}>
        <RefreshCw className={loading ? "spin" : ""} size={15} /> Yenile
      </button>
    </div>
  );
}
function Meta({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="meta">
      <span>{label}</span>
      <strong className={mono ? "mono" : ""}>{value}</strong>
    </div>
  );
}
function Method({ method }: { method: string }) {
  return <b className={`method method-${method.toLowerCase()}`}>{method}</b>;
}
function Status({ code }: { code: number }) {
  return <b className={`status status-${code}`}>{code}</b>;
}
function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="empty-state">
      <FileJson size={20} />
      <strong>{title}</strong>
      {description && <span>{description}</span>}
    </div>
  );
}
function ErrorState({ error }: { error: unknown }) {
  return (
    <div className="error-state">
      <AlertTriangle size={20} />
      <strong>Veriler alınamadı</strong>
      <span>{errorMessage(error)}</span>
    </div>
  );
}
function SkeletonGrid() {
  return (
    <div className="metric-grid">
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
    </div>
  );
}
function SkeletonTable() {
  return (
    <div className="skeleton-table">
      {[1, 2, 3, 4].map((i) => (
        <div className="skeleton" key={i} />
      ))}
    </div>
  );
}
function Spinner() {
  return <RefreshCw className="spin" size={18} />;
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value)
  );
}
function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "Beklenmeyen bir bağlantı hatası oluştu.";
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>
  );
}
