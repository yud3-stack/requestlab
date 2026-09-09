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

## Aşama 3'te tamamlananlar

- `packages/sdk-node` içinde bounded queue, timeout, fail-open gönderim ve hassas veri maskeleme destekli Node SDK eklendi.
- SDK, circular/Date/Error/Buffer değerlerini güvenli biçimde serialize eder ve request/response body limitlerini uygular.
- Fastify `onRequest`/`onResponse` hook entegrasyonu, request ID koruma/üretme ve flush desteği eklendi.
- `apps/demo-api` ürün, sipariş, login, slow request ve scenario endpointleriyle oluşturuldu.
- Demo API SDK yapılandırması olmadan da çalışır; yapılandırıldığında başarılı, hatalı ve yavaş istekleri event olarak yakalar.
- Demo API için idempotency, deterministic hata senaryoları ve SDK integration testleri eklendi.

## Aşama 4'te tamamlananlar

- `apps/web` gerçek API ve Supabase verileriyle çalışan koyu temalı responsive dashboard'a dönüştürüldü.
- Genel Bakış, İstekler, Tekrar Çalıştırmalar boş durumu ve Ayarlar sayfaları eklendi.
- Merkezi timeout'lu frontend API istemcisi; development user header, standart hata ayrıştırma ve güvenli JSON render desteği eklendi.
- `GET /api/projects/:projectId/events/stats` üyelik korumalı PostgreSQL agregasyon endpoint'i eklendi.
- Event detail drawer, request/response/error sekmeleri, masking görünümü, URL event seçimi, pagination ve otomatik yenileme eklendi.
- Frontend React Testing Library regression testleri eklendi; ingestion key ve database bağlantı değerleri frontend'e taşınmadı.
- Fastify 5 uyumlu global `@fastify/cors` eklendi; izinli origin listesi `CORS_ALLOWED_ORIGINS` üzerinden okunur, development localhost varsayılanları korunur ve credentials açılmaz.
- CORS preflight ile GET/POST/DELETE/OPTIONS metotları ve `Content-Type`, `X-RequestLab-User-Id`, `X-RequestLab-Key` header'ları desteklenir; izinli origin'lerde 401/403 yanıtları da CORS header'ı taşır.
- Vite `envDir` açıkça `apps/web` dizinine ayarlandı. `apps/web/.env.local` içindeki `VITE_REQUESTLAB_DEV_USER_ID`, seed kullanıcısının ID'si olmalı; frontend yalnızca bu geçici kullanıcı header'ını gönderir, secret/API key içermez.

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
- `GET /api/projects/:projectId/events/stats` (`environmentId`, `from`, `to` filtreleri; toplam, hata oranı, ortalama duration, status dağılımı, endpoint hot spot'ları ve son hatalar)

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
- `apps/api/src/config/index.ts`: CORS origin ve development config yükleme
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
- `packages/sdk-node/src/client.ts`: SDK client ve event gönderimi
- `packages/sdk-node/src/fastify.ts`: Fastify hook entegrasyonu
- `packages/sdk-node/src/queue.ts`: bounded fail-open queue
- `apps/demo-api/src/app.ts`: demo API factory ve SDK kurulumu
- `apps/demo-api/tests/demo.test.ts`: demo senaryoları ve SDK capture testleri
- `apps/web/src/api.ts`: merkezi frontend API istemcisi
- `apps/web/src/main.tsx`: dashboard route'ları ve bileşenleri
- `apps/web/src/styles.css`: responsive dashboard görsel sistemi
- `apps/web/tests/dashboard.test.tsx`: frontend loading, error, empty, drawer, masking ve mobil menü testleri
- `apps/web/tests/api-client.test.ts`: development user header testleri

Database scriptleri `packages/database/prisma.config.ts` üzerinden `DIRECT_URL` alır. Yerel çalışmada config ve seed kök `.env` dosyasını opsiyonel yükler; `.env` yoksa process environment kullanılabilir. API server ve runtime Prisma Client ise `DATABASE_URL` kullanır; böylece Supabase Transaction Pooler (6543) uygulama runtime'ında, Session Pooler (5432) Prisma migration işlemlerinde ayrıştırılır.

`.github/workflows/database-migration.yml` yalnızca `workflow_dispatch` ile manuel çalışır. `DIRECT_URL` secret'ı job environment içinde hem `DIRECT_URL` hem `DATABASE_URL` olarak kullanılır; başka secret veya bağlantı değeri yazdırılmaz. Workflow mevcut migration'ları deploy eder; seed, migration üretimi ve reset çalıştırmaz.

## Çalıştırılan doğrulamalar

- `corepack pnpm install`: başarılı
- `corepack pnpm db:generate`: başarılı
- `corepack pnpm typecheck`: başarılı
- `corepack pnpm lint`: başarılı
- `corepack pnpm test`: başarılı, 20 test
- `corepack pnpm build`: başarılı
- Prisma schema validation: başarılı.
- Derlenmiş API `/health`: başarılı, `{"status":"ok","service":"api"}`.
- `pnpm db:validate`: Başarılı; Supabase bağlantı URI formatı Prisma tarafından kabul edildi.
- `pnpm db:generate`: Başarılı.
- `pnpm db:validate`: Başarılı; Prisma config yüklendi ve CLI datasource `DIRECT_URL` üzerinden doğrulandı.
- GitHub Actions `Database Migration`: başarılı; mevcut migration deploy edildi.
- `pnpm db:seed` iki kez: başarılı; seed idempotence doğrulandı.
- Gerçek API smoke testleri: başarılı; health, proje listesi, environment listesi, event ingestion, event listesi/detayı, hassas veri maskeleme, duplicate event `409` ve invalid API key `401` doğrulandı.
- Gerçek Supabase SDK smoke testi: başarılı; API ve demo API ayrı süreçlerde çalıştırıldı, health kontrolleri zaman sınırıyla tamamlandı, ürün `200`, eksik shipping address `500`, hatalı login `401` ve slow request `200` event'leri doğrulandı. 5 yeni event içinde slow duration `1507ms`, password/token/authorization masking, API erişilemezken demo API fail-open davranışı, SDK flush ve süreç cleanup doğrulandı.
- Gerçek Supabase frontend smoke testi: API ve Vite web sunucusu ayrı kontrollü süreçlerde başlatıldı; API health `200`, web root document `200` ve frontend process cleanup doğrulandı. API gerçek Supabase event verisini ve stats sözleşmesini sunuyor. Bu ortamda browser otomasyon aracı bulunmadığından detail drawer, responsive pixel görünümü ve browser console kontrolü otomatikleştirilemedi; manuel tarayıcı kontrolü açık sınırlamadır.
- `corepack pnpm install --frozen-lockfile`: başarılı.
- `corepack pnpm test`: başarılı, 10 test.
- `corepack pnpm typecheck`: başarılı.
- `corepack pnpm lint`: başarılı.
- `corepack pnpm build`: başarılı.
- SDK ve demo API build/typecheck: başarılı.
- `corepack pnpm lint`: başarılı.
- `corepack pnpm exec prettier --check .`: başarılı.
- `git diff --check`: başarılı.
- CORS regression testleri: izinli preflight, doğru origin, user header allow-list, CORS'lu 401 ve izin­siz origin doğrulandı.

Docker CLI bu ortamda bulunmadı; gerekli migration GitHub Actions üzerinden çalıştırıldı. Migration geçmişi değiştirilmedi, yeni migration üretilmedi ve 6543 Transaction Pooler üzerinden migration çalıştırılmadı. Gerçek Supabase veritabanı round-trip doğrulaması tamamlandı. Event ID, API key ve bağlantı değerleri loglanmadı veya dokümana yazılmadı.

GitHub Actions migration workflow'u manuel `workflow_dispatch` ile başarıyla kullanıldı. Workflow validation, client generation ve mevcut migration deploy adımlarını içerir; seed, reset ve migration generation içermez.

## Bilinen sınırlamalar

- Geçici kullanıcı header auth gerçek login yerine geçmez.
- CORS için production origin listesi deployment ortamında `CORS_ALLOWED_ORIGINS` ile açıkça sağlanmalıdır.
- Gerçek PostgreSQL integration test suite'i yoktur; route testleri `app.inject` ve mock DB ile çalışır.
- API key hash'i genel amaçlı SHA-256'dır; düşük hacimli ingestion anahtarı doğrulaması için kullanılmıştır.
- Redis, replay, dashboard ve gerçek kullanıcı login sistemi bu aşamada kullanılmaz.

## Aşama 5 için başlangıç noktası

Replay worker, Redis/BullMQ işleme, gerçek kullanıcı login'i ve production deployment ele alınabilir. Frontend dashboard ve mevcut gerçek veri sözleşmeleri korunmalıdır.

## Aşama 4 için başlangıç noktası

SDK ve demo API tamamlandı. Sonraki aşamada frontend dashboard, replay akışı veya Redis/worker işleme ele alınabilir. Gerçek Supabase SDK smoke testleri, geçerli API key ve URL ile ürün, 500 sipariş, 401 login, slow endpoint ve masking/detail doğrulamalarını kapsamalıdır.

Her sonraki aşamanın sonunda bu dosya güncellenmelidir.
