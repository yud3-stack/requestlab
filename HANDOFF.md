# RequestLab Handoff

## Projenin amacı

RequestLab, gerçek uygulamalardaki API hatalarını kaydetmek, incelemek ve test ortamında tekrar çalıştırmak için geliştirilen geliştirici aracıdır.

## Aşama 2'de tamamlananlar

- Prisma PostgreSQL modelleri, migration ve tekrar çalıştırılabilir seed eklendi.
- Proje ve environment CRUD başlangıç endpointleri eklendi.
- API key üretme, listeleme, iptal etme ve audit kaydı eklendi.
- API key ile event ingestion ve proje/environment izolasyonu eklendi.
- Event listesi filtreleme, sayfalama ve detay endpointi eklendi.
- Hassas veri maskeleme ve payload limitleri eklendi.
- Ortak Zod sözleşmeleri `packages/shared` içine taşındı.
- `app.ts` / `server.ts` ayrımıyla Fastify test edilebilir hale getirildi.

## Veritabanı modelleri

`User`, `Project`, `ProjectMember`, `Environment`, `ApiKey`, `RequestEvent` ve `AuditEvent` modelleri `packages/database/prisma/schema.prisma` içindedir. Project/external event, project/environment ve sorgu filtreleri için gerekli unique constraint ve indeksler migration SQL'de bulunur.

Production environment için API oluşturma akışında `replayEnabled` varsayılanı `false` olarak uygulanır. Seed de production'ı kapalı oluşturur.

## Endpoint listesi

- `GET /health`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:projectId`
- `GET /api/projects/:projectId/environments`
- `POST /api/projects/:projectId/environments`
- `GET /api/projects/:projectId/api-keys`
- `POST /api/projects/:projectId/api-keys`
- `DELETE /api/projects/:projectId/api-keys/:apiKeyId`
- `POST /api/v1/events`
- `GET /api/projects/:projectId/events`
- `GET /api/projects/:projectId/events/:eventId`

## Kimlik doğrulama yaklaşımı

Kullanıcı endpointleri geçici olarak `x-requestlab-user-id` header'ı ile çalışır. Development modunda header yoksa `DEV_USER_ID` kullanılır; production modunda fallback yoktur. Membership kontrolü proje erişiminde yapılır. Ingestion kullanıcı header'ı kullanmaz; `X-RequestLab-Key` prefix adayını bulur, SHA-256 hash'i timing-safe karşılaştırır, revoked/expired anahtarları reddeder ve `lastUsedAt` günceller.

API key plaintext yalnızca oluşturma cevabında bir kez döndürülür. Veritabanında yalnızca `keyPrefix` ve hash saklanır.

## Seed bilgileri

`pnpm db:seed` şu verileri idempotent biçimde oluşturur:

- `demo@requestlab.local` demo kullanıcısı
- `shop-api` slug'lı `Shop API` projesi
- Demo kullanıcı için `OWNER` üyeliği
- development, test ve production environment'ları
- `DEV_INGESTION_KEY` ile hash'lenen geliştirme API key'i

Seed sonrası demo kullanıcının ID'si çıktıdan alınarak `DEV_USER_ID` veya header olarak kullanılmalıdır.

## Önemli dosyalar

- `apps/api/src/app.ts`: Fastify uygulama factory'si
- `apps/api/src/server.ts`: production/dev dinleyici
- `apps/api/src/modules/*/routes.ts`: modüler route'lar
- `apps/api/src/lib/auth.ts`: geçici kullanıcı ve membership auth
- `apps/api/src/lib/api-key-auth.ts`: ingestion key doğrulaması
- `apps/api/src/lib/masking.ts`: immutable hassas veri temizleme
- `packages/database/prisma/schema.prisma`: modeller
- `packages/database/prisma.config.ts`: `DIRECT_URL` kullanan Prisma CLI config'i
- `.github/workflows/database-migration.yml`: manuel migration workflow'u
- `packages/database/prisma/migrations/20260909120000_init/migration.sql`: migration
- `packages/database/prisma/seed.ts`: seed
- `packages/shared/src/index.ts`: ortak Zod şemaları ve DTO tipleri
- `apps/api/tests/api.test.ts`: route ve güvenlik testleri

Database scriptleri `packages/database/prisma.config.ts` üzerinden `DIRECT_URL` alır. Yerel çalışmada config ve seed kök `.env` dosyasını opsiyonel yükler; `.env` yoksa process environment kullanılabilir. API server ve runtime Prisma Client ise `DATABASE_URL` kullanır; böylece Supabase Transaction Pooler (6543) uygulama runtime'ında, Session Pooler (5432) Prisma migration işlemlerinde ayrıştırılır.

`.github/workflows/database-migration.yml` yalnızca `workflow_dispatch` ile manuel çalışır. `DIRECT_URL` secret'ı job environment içinde hem `DIRECT_URL` hem `DATABASE_URL` olarak kullanılır; başka secret veya bağlantı değeri yazdırılmaz. Workflow mevcut migration'ları deploy eder; seed, migration üretimi ve reset çalıştırmaz.

## Çalıştırılan doğrulamalar

- `corepack pnpm install`: başarılı
- `corepack pnpm db:generate`: başarılı
- `corepack pnpm typecheck`: başarılı
- `corepack pnpm lint`: başarılı
- `corepack pnpm test`: başarılı, 10 test
- `corepack pnpm build`: başarılı
- Prisma schema validation: başarılı.
- Derlenmiş API `/health`: başarılı, `{"status":"ok","service":"api"}`.
- `pnpm db:validate`: Başarılı; Supabase bağlantı URI formatı Prisma tarafından kabul edildi.
- `pnpm db:generate`: Başarılı.
- `pnpm db:validate`: Başarılı; Prisma config yüklendi ve CLI datasource `DIRECT_URL` üzerinden doğrulandı.
- GitHub Actions `Database Migration`: başarılı; mevcut migration deploy edildi.
- `pnpm db:seed` iki kez: başarılı; seed idempotence doğrulandı.
- Gerçek API smoke testleri: başarılı; health, proje listesi, environment listesi, event ingestion, event listesi/detayı, hassas veri maskeleme, duplicate event `409` ve invalid API key `401` doğrulandı.
- `corepack pnpm install --frozen-lockfile`: başarılı.
- `corepack pnpm test`: başarılı, 10 test.
- `corepack pnpm typecheck`: başarılı.
- `corepack pnpm lint`: başarılı.
- `corepack pnpm build`: başarılı.

Docker CLI bu ortamda bulunmadı; gerekli migration GitHub Actions üzerinden çalıştırıldı. Migration geçmişi değiştirilmedi, yeni migration üretilmedi ve 6543 Transaction Pooler üzerinden migration çalıştırılmadı. Gerçek Supabase veritabanı round-trip doğrulaması tamamlandı. Event ID, API key ve bağlantı değerleri loglanmadı veya dokümana yazılmadı.

GitHub Actions migration workflow'u manuel `workflow_dispatch` ile başarıyla kullanıldı. Workflow validation, client generation ve mevcut migration deploy adımlarını içerir; seed, reset ve migration generation içermez.

## Bilinen sınırlamalar

- Geçici kullanıcı header auth gerçek login yerine geçmez.
- Gerçek PostgreSQL integration test suite'i yoktur; route testleri `app.inject` ve mock DB ile çalışır.
- API key hash'i genel amaçlı SHA-256'dır; düşük hacimli ingestion anahtarı doğrulaması için kullanılmıştır.
- Redis, worker, Node SDK, replay ve dashboard bu aşamada kullanılmaz.

## Aşama 3 için başlangıç noktası

Önce `apps/api/src/modules/events` sözleşmelerini sabitleyip Node SDK'nin bu Event API'ye bağlanması önerilir. Ardından demo hata senaryoları ve frontend dashboard eklenebilir. Replay/worker geliştirmesi bu aşamanın dışındadır.

Her sonraki aşamanın sonunda bu dosya güncellenmelidir.
