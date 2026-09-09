# RequestLab

RequestLab, gerçek uygulamalarda oluşan API hatalarını kaydetmek, incelemek ve test ortamında yeniden çalıştırmak için geliştirilen bir geliştirici aracıdır.

## Aşama 2 durumu

Bu aşamada PostgreSQL veri modeli, migration/seed altyapısı ve Event API tamamlandı. Proje, environment, ingestion API key ve event listeleme/detay endpointleri kullanılabilir. Node SDK, gelişmiş demo hata senaryoları, frontend dashboard, replay ve Redis/worker işleme bu aşamada yoktur.

## Teknolojiler ve klasörler

- `apps/api`: Fastify API, auth, maskeleme ve modüler route'lar
- `apps/web`: Aşama 1 minimum React sayfası
- `apps/worker`: Aşama 1 başlangıç worker'ı; bu aşamada kullanılmaz
- `apps/demo-api`: Aşama 1 health endpoint'i; demo hata senaryoları sonraki aşamadadır
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

`DATABASE_URL`, uygulama runtime'ı için Supabase Transaction Pooler bağlantısıdır ve port 6543 kullanır. `DIRECT_URL`, yalnızca Prisma CLI ve migration işlemleri için Supabase Session Pooler bağlantısıdır ve port 5432 kullanır. Her iki değişken de gerçek değerleri `.env` içinde tutar; `.env.example` içinde boştur. Prisma CLI config'i `DIRECT_URL`, çalışma zamanı Prisma Client ise `DATABASE_URL` kullanır. `DEV_USER_ID`, kullanıcı header'ı verilmediğinde development modunda kullanılacak kullanıcı kimliğidir. Seed çıktısındaki demo kullanıcı ID'sini veya `.env` içinde bilinen bir ID'yi kullanın. `DEV_INGESTION_KEY` yerel seed anahtarının kaynağıdır; gerçek anahtar commit edilmemelidir.

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

Prisma migration komutları `packages/database/prisma.config.ts` üzerinden `DIRECT_URL` kullanır; migration için Transaction Pooler (`DATABASE_URL`, 6543) kullanılmaz.

## GitHub Actions migration

Yerel ağ Session Pooler'a erişemiyorsa mevcut migration'ları manuel olarak GitHub Actions üzerinden uygulayın:

1. Repository Settings > Secrets and variables > Actions bölümünde yalnızca `DIRECT_URL` secret'ını tanımlayın. Workflow bunu hem `DIRECT_URL` hem de Prisma schema validation uyumluluğu için `DATABASE_URL` olarak sağlar.
2. Actions > `Database Migration` workflow'unu açın.
3. `Run workflow` ile manuel çalıştırın.

Workflow Ubuntu runner üzerinde Node.js ve pnpm kurar, frozen lockfile ile bağımlılıkları yükler, Prisma schema/client doğrulamasını yapar ve yalnızca mevcut migration'ları `prisma migrate deploy` ile uygular. Seed, migration üretimi ve veritabanı reset işlemi yapmaz. Secret workflow komutlarında yazdırılmaz.

## Aşama 3'te olmayanlar

Node SDK, gelişmiş demo API hata senaryoları, frontend dashboard, replay iş akışı, BullMQ/Redis görev işleme ve gerçek kullanıcı login sistemi henüz geliştirilmemiştir.

## Supabase doğrulama notu

Supabase CLI bağlantı ayrımı Prisma schema validation'dan geçti. Migration GitHub Actions üzerinden başarıyla uygulandı ve seed iki kez çalıştırılarak idempotence doğrulandı. Gerçek API smoke testlerinde health, proje/environment sorguları, event ingestion, liste/detay, hassas veri maskeleme, duplicate event ve geçersiz API key akışları doğrulandı. Bağlantı adresleri ve secret değerleri dokümana yazılmaz.
