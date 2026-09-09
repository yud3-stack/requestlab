import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate
} from "react-router-dom";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
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
  Zap
} from "lucide-react";
import type { EventStats, RequestEventDetail, RequestEventSummary } from "@requestlab/shared";
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
            element={<EmptyPage title="Tekrar Çalıştırmalar" icon={<Play />} />}
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
          {environments.map((env) => (
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
  onClose
}: {
  event?: RequestEventDetail;
  loading: boolean;
  error?: unknown;
  onClose: () => void;
}) {
  const [tab, setTab] = useState("summary");
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
                  <button className="replay-disabled" disabled>
                    <Play size={15} /> Tekrar çalıştırma yakında
                  </button>
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
    </>
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
function EmptyPage({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <Page title={title} subtitle="Güvenli ve kontrollü çalışma alanı">
      <div className="empty-feature">
        <div className="feature-icon">{icon}</div>
        <h2>Henüz tekrar çalıştırma bulunmuyor</h2>
        <p>Event'leri inceleyin; tekrar çalıştırma akışı yakında kullanıma sunulacak.</p>
      </div>
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
