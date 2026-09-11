# RequestLab

RequestLab, gerçek uygulamalarda oluşan API hatalarını kaydetmek, incelemek ve test ortamında yeniden çalıştırmak için geliştirilen bir geliştirici aracıdır.

## Aşama 5B durumu

PostgreSQL veri modeli, Event API, Node SDK, replay backend'i ve gerçek Supabase verileriyle çalışan frontend dashboard tamamlandı. Replay frontend'i güvenli form, polling, liste/detay ve JSON karşılaştırma akışlarını içerir. Gerçek kullanıcı login'i ve production deployment kapsam dışıdır.

## Live Demo

Aşama 6B'de eklenecek. Bu aşamada gerçek deployment, DNS veya public URL doğrulaması yapılmadı.

## Teknolojiler ve klasörler

- `apps/api`: Fastify API, auth, maskeleme ve modüler route'lar
- `apps/web`: React/Vite dashboard; overview, istekler, event detay drawer'ı, ayarlar ve responsive mobil menü
- `apps/worker`: BullMQ replay worker'ı
- `apps/demo-api`: SDK entegrasyonlu demo ürün, sipariş, login ve yavaş istek senaryoları
- `packages/sdk-node`: Node.js event capture SDK'sı ve Fastify hook entegrasyonu
- `packages/database`: Prisma client, schema, migration ve seed
- `packages/shared`: Zod tabanlı ortak request/response sözleşmeleri ve TypeScript tipleri
- `packages/config`: Merkezi ESLint/Prettier ayarları
- `infrastructure`: PostgreSQL ve Redis Compose tanımları

## Gereksinimler

- Node.js 20.19 veya üzeri
- pnpm 10 veya üzeri
- PostgreSQL için Docker Desktop veya erişilebilir bir PostgreSQL

## Kurulum ve veritabanı

```bash
pnpm install
cp .env.example .env
pnpm db:generate
pnpm docker:up
pnpm db:migrate
pnpm db:seed
```

PowerShell için `.env` oluşturma:

```powershell
Copy-Item .env.example .env
```

`DATABASE_URL`, uygulama runtime'ı için Supabase Transaction Pooler bağlantısıdır ve port 6543 kullanır. `DIRECT_URL`, yalnızca Prisma CLI ve migration işlemleri için Supabase Session Pooler bağlantısıdır ve port 5432 kullanır. Her iki değişken de gerçek değerleri `.env` içinde tutar; `.env.example` içinde boştur. Prisma CLI config'i `DIRECT_URL`, çalışma zamanı Prisma Client ise `DATABASE_URL` kullanır. `DEV_USER_ID`, kullanıcı header'ı verilmediğinde development modunda kullanılacak kullanıcı kimliğidir. Seed çıktısındaki demo kullanıcı ID'sini veya `.env` içinde bilinen bir ID'yi kullanın. `DEV_INGESTION_KEY` yerel seed anahtarının kaynağıdır; gerçek anahtar commit edilmemelidir. `CORS_ALLOWED_ORIGINS`, virgülle ayrılmış frontend origin listesidir; development varsayılanları localhost ve 127.0.0.1 port 5173'tür. Production'da origin listesi açıkça verilmelidir; wildcard kullanılmaz.

Frontend için `apps/web/.env.local` dosyasında yalnızca `VITE_REQUESTLAB_API_URL` ve `VITE_REQUESTLAB_DEV_USER_ID` tanımlanır; örnek `apps/web/.env.example` içindedir. Vite config'inde `envDir` açıkça `apps/web` olarak ayarlandığı için bu dosya yüklenir. `VITE_REQUESTLAB_DEV_USER_ID`, `pnpm db:seed` çıktısındaki seed kullanıcısının ID'siyle aynı olmalıdır; bu değer client tarafından `x-requestlab-user-id` header'ı olarak gönderilir. Frontend ingestion API key, `DATABASE_URL` veya `DIRECT_URL` içermez. Bu development header'ı production kimlik doğrulaması değildir.

SDK kullanan demo API için `.env` içinde `REQUESTLAB_API_URL`, `REQUESTLAB_API_KEY` ve isteğe bağlı `REQUESTLAB_ENVIRONMENT` değişkenlerini tanımlayın. SDK yapılandırılmamışsa demo API yine başlar ve yalnızca yerel senaryoları çalıştırır.

Compose servisleri:

```bash
pnpm docker:up
pnpm docker:down
```

## API'yi çalıştırma

```bash
pnpm dev
```

API varsayılan olarak `http://localhost:3001` adresindedir. Sağlık kontrolü:

```bash
curl http://localhost:3001/health
```

### Geçici geliştirme kimliği

Gerçek login sistemi henüz yoktur. Kullanıcı gerektiren endpointlerde `x-requestlab-user-id` header'ı kullanılabilir. `NODE_ENV=development` iken header yoksa `DEV_USER_ID` fallback'i devreye girer. Production modunda fallback yoktur ve kullanıcı bulunamazsa `401` döner. Proje üyesi olmayan kullanıcı `403` alır.

### API key oluşturma

Proje ve environment endpointleri için üye kullanıcı header'ı gerekir. API key oluşturma yalnızca `OWNER` veya `ADMIN` rolündedir:

```bash
curl -X POST http://localhost:3001/api/projects/<PROJECT_ID>/api-keys \
  -H "content-type: application/json" \
  -H "x-requestlab-user-id: <USER_ID>" \
  -d '{"name":"local ingestion"}'
```

Tam key yalnızca bu oluşturma cevabında bir kez döner. Liste endpointi yalnızca prefix ve metadata döndürür; plaintext veya hash döndürmez.

### Event gönderme

```bash
curl -X POST http://localhost:3001/api/v1/events \
  -H "content-type: application/json" \
  -H "X-RequestLab-Key: rlk_..." \
  -d '{
    "externalEventId":"evt_local_001",
    "environment":"development",
    "requestId":"req_001",
    "method":"POST",
    "path":"/api/orders",
    "route":"/api/orders",
    "query":{},
    "requestHeaders":{"content-type":"application/json","authorization":"Bearer secret"},
    "requestBody":{"productId":42,"password":"secret"},
    "responseHeaders":{"content-type":"application/json"},
    "responseBody":{"error":"ValidationError"},
    "statusCode":500,
    "durationMs":324,
    "errorType":"ValidationError",
    "errorMessage":"Missing shipping address",
    "occurredAt":"2026-09-09T10:00:00.000Z"
  }'
```

Event aynı proje ve `externalEventId` ile tekrar gönderilirse `409 DUPLICATE_EVENT` döner. API key'in projesine ait olmayan environment kullanılamaz.

### Event listeleme ve detay

```bash
curl "http://localhost:3001/api/projects/<PROJECT_ID>/events?page=1&pageSize=20&statusCode=500&sortOrder=desc" \
  -H "x-requestlab-user-id: <USER_ID>"

curl http://localhost:3001/api/projects/<PROJECT_ID>/events/<EVENT_ID> \
  -H "x-requestlab-user-id: <USER_ID>"
```

Liste endpointi `page`, `pageSize`, `search`, `method`, `statusCode`, `environmentId`, `from`, `to` ve `sortOrder` filtrelerini destekler. `pageSize` en fazla 100'dür. Liste cevabı body alanlarını içermez; body ve header ayrıntıları yalnızca detay cevabındadır.

### Maskeleme ve hata formatı

Authorization, cookie, set-cookie, password, token, accessToken, refreshToken, secret, apiKey, creditCard ve cvv alanları iç içe nesne/diziler dahil `[REDACTED]` olur. Maskeleme veritabanına yazmadan önce backend'de yapılır. Header sınırı 32 KiB, her JSON body sınırı 128 KiB'dir; limit aşımı `413 PAYLOAD_TOO_LARGE` döndürür.

Hatalar `{ "error": { "code", "message", "details" } }` biçimindedir. Backend stack trace'i response'a gönderilmez.

## Komutlar

```bash
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Demo API:

```bash
pnpm --filter @requestlab/demo-api dev
pnpm --filter @requestlab/web dev
pnpm exec node scripts/real-smoke.mjs
```

Senaryo endpointleri `GET /api/products`, `POST /api/orders`, `POST /api/login`, `GET /api/slow` ve `GET /api/scenarios` yollarıdır. SDK varsayılan olarak yalnızca hata eventlerini yakalar; demo için `REQUESTLAB_CAPTURE_MODE=all` kullanılabilir. Fastify entegrasyonunda `ignorePaths` veya eşdeğer `excludePaths` ile tam path'ler event capture dışı bırakılabilir; `includePaths` veya eşdeğer `capturePaths` verildiğinde yalnızca listedeki tam path'ler yakalanır. Karşılaştırmalar query string'i dikkate almaz. Demo API allowlist'i yalnızca `/api/products`, `/api/orders`, `/api/orders/order-1`, `/api/auth/login` ve `/api/demo/slow` yollarını içerir; Render health-check, internal scenario wrapper, scanner ve bilinmeyen 404 istekleri event oluşturmaz.

Eski demo health event'lerini temizlemek için önce yalnızca hedef sayısını gösteren dry-run çalıştırın. `DEMO_PROJECT_SLUG` tek bir proje slug'ı olmalıdır:

```bash
pnpm demo:cleanup-health
pnpm demo:cleanup-health -- --apply
```

İkinci komut yalnızca açıkça `--apply` verildiğinde exact `/health` event'lerini ve bunlara bağlı replay kayıtlarını siler; `/health-check`, query içeren farklı path'ler ve diğer projeler korunur. Production veritabanında çalıştırmadan önce deployment prosedürünü takip edin.

Prisma migration komutları `packages/database/prisma.config.ts` üzerinden `DIRECT_URL` kullanır; migration için Transaction Pooler (`DATABASE_URL`, 6543) kullanılmaz.

## GitHub Actions migration

Yerel ağ Session Pooler'a erişemiyorsa mevcut migration'ları manuel olarak GitHub Actions üzerinden uygulayın:

1. Repository Settings > Secrets and variables > Actions bölümünde yalnızca `DIRECT_URL` secret'ını tanımlayın. Workflow bunu hem `DIRECT_URL` hem de Prisma schema validation uyumluluğu için `DATABASE_URL` olarak sağlar.
2. Actions > `Database Migration` workflow'unu açın.
3. `Run workflow` ile manuel çalıştırın.

Workflow Ubuntu runner üzerinde Node.js ve pnpm kurar, frozen lockfile ile bağımlılıkları yükler, Prisma schema/client doğrulamasını yapar ve yalnızca mevcut migration'ları `prisma migrate deploy` ile uygular. Seed, migration üretimi ve veritabanı reset işlemi yapmaz. Secret workflow komutlarında yazdırılmaz.

## Sonraki aşamalar

Gerçek kullanıcı login sistemi, production deployment ve browser otomasyonlu görsel regresyon sonraki aşamalardır.

## Dashboard

Dashboard gerçek API'den proje, environment, event liste/detay, API key metadata ve `/api/projects/:projectId/events/stats` verilerini okur. Genel Bakış istatistikleri sayfa örnekleminden değil PostgreSQL agregasyonundan üretilir. İstekler ekranı URL filtreleri, debounce arama, pagination, otomatik yenileme ve mobil event görünümünü destekler. Geçici development user header davranışı production auth yerine geçmez.

## Replay backend (Aşama 5A)

Replay backend'i yalnızca başarısız event'leri seçilen development/test/staging environment'ına kuyruğa alır. `POST /api/projects/<PROJECT_ID>/events/<EVENT_ID>/replays` gövdesi `environmentId` ve isteğe bağlı `query`, `headers`, `body`, `confirmSideEffects` içerir; target URL, method ve path kullanıcıdan alınmaz. Sonuçlar `GET /api/projects/<PROJECT_ID>/replays` ve `GET /api/projects/<PROJECT_ID>/replays/<REPLAY_ID>` ile okunur. Replay oluşturma OWNER, ADMIN ve DEVELOPER rollerine açıktır; VIEWER yalnızca sonuçları okuyabilir.

Redis için `REDIS_URL` gerekir; `redis://` ve Upstash `rediss://` desteklenir. API ve worker ayrı BullMQ/Redis bağlantıları kullanır. Redis yoksa API normal endpoint'lerle başlar, replay oluşturma `503 REPLAY_UNAVAILABLE` döndürür. Worker Redis olmadan güvenli bir hata mesajıyla başlamaz. `REPLAY_TIMEOUT_MS` varsayılan 10000, `REPLAY_MAX_RESPONSE_BYTES` varsayılan 131072'dir.

Replay worker yalnızca http/https hedeflerini, credentials içermeyen URL'leri kabul eder; production/replay kapalı environment'lar, loopback/private/link-local/multicast/metadata adresleri ve DNS sonuçlarındaki güvenli olmayan IP'ler engellenir. Redirect takip edilmez, response boyutu sınırlıdır ve response verileri tekrar maskelenir. `ALLOW_PRIVATE_REPLAY_TARGETS=true` yalnızca development'ta yerel demo hedefleri için kullanılabilir; production'da yok sayılır. Authorization, cookie, host, forwarding ve bağlantı header'ları gönderilmez. Yan etkili method'larda `confirmSideEffects=true` ve yeni idempotency key zorunludur.

Örnek:

```bash
curl -X POST http://localhost:3001/api/projects/<PROJECT_ID>/events/<EVENT_ID>/replays \
  -H "content-type: application/json" \
  -H "x-requestlab-user-id: <USER_ID>" \
  -d '{"environmentId":"<TEST_ENVIRONMENT_ID>","confirmSideEffects":true}'
```

Replay migration'ı `20260909130000_replay_runs` adındadır. Yerel pooler erişimi yoksa mevcut GitHub Actions `Database Migration` workflow'u ile `DIRECT_URL` secret'ı üzerinden uygulanmalıdır. Seed scripti ReplayRun kayıtlarına dokunmaz; seed tekrar çalıştırıldığında replay geçmişi silinmez.

## Replay frontend (Aşama 5B)

Başarısız event detayından güvenli replay formu açılır. Form yalnızca aynı projedeki production olmayan ve `replayEnabled` açık environment'ları gösterir; POST/PUT/PATCH/DELETE için yan etki onayı ister. Authorization, cookie, host, forwarding header'ları ve `[REDACTED]` alanları gönderilmez.

`/replays` replay geçmişini durum ve environment filtreleriyle listeler. `/replays/:replayId` QUEUED/RUNNING durumlarını polling ile izler, terminal durumda veya 30 saniye sonra durur ve sonuç oluştuğunda orijinal event ile JSON body/duration karşılaştırması gösterir.

Production deployment hazırlığı, public demo auth/scenario sınırları, Vercel/Render blueprint'leri ve cleanup süreci için `docs/deployment.md` dosyasına bakın. Render free servisleri uykuya geçebilir ve ilk istekte cold start yaşanabilir.

## Supabase doğrulama notu

Supabase CLI bağlantı ayrımı Prisma schema validation'dan geçti. Migration GitHub Actions üzerinden başarıyla uygulandı ve seed iki kez çalıştırılarak idempotence doğrulandı. Gerçek API smoke testlerinde health, proje/environment sorguları, event ingestion, liste/detay, hassas veri maskeleme, duplicate event ve geçersiz API key akışları doğrulandı. Bağlantı adresleri ve secret değerleri dokümana yazılmaz.

Gerçek Supabase SDK smoke testi başarıyla tamamlandı: API ve demo API ayrı child process'lerde çalıştırıldı, health endpoint'leri zaman sınırıyla beklendi ve test sonunda başlatılan süreçler kapatıldı. Ürün, eksik shipping address, hatalı login ve 1500 ms yavaş istek senaryolarında beklenen HTTP sonuçları ve 5 yeni event doğrulandı; slow event duration `1507ms` olarak kaydedildi. Event detaylarında password, token ve authorization değerleri `[REDACTED]` oldu. RequestLab API durdurulduğunda demo API `200` yanıt vermeye devam etti ve SDK flush tamamlandı.

Gerçek Upstash Redis + Supabase replay smoke testi `scripts/replay-smoke.mjs` ile başarıyla tamamlandı. `20260909130000_replay_runs` applied olarak doğrulandı, seed iki kez idempotent çalıştı, development environment demo API'ye yönlendirildi, eksik shipping address isteği `500` event oluşturdu ve BullMQ worker geçerli shipping address ile replay'i `SUCCEEDED`/`201` tamamladı. Replay duration/finishedAt, audit kaydı, tehlikeli header filtreleme, response masking ve aynı replay ID için tek job doğrulandı. API, worker ve demo süreçleri PID ile kapatıldı; smoke portlarında listener kalmadı. Secret, tam kimlik ve event/replay ID raporlanmadı.
