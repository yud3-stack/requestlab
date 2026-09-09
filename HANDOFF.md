# RequestLab Handoff

## Projenin amacı

RequestLab, gerçek uygulamalardaki API hatalarını kaydetmek, incelemek ve test ortamında tekrar çalıştırmak için geliştirilen bir geliştirici aracıdır.

## Tamamlanan aşama

Aşama 1, monorepo ve temel altyapı olarak tamamlandı. Ürün özellikleri eklenmedi.

## Oluşturulan servisler

- `apps/web`: React + Vite başlangıç sayfası
- `apps/api`: Fastify `/health` endpoint'i ve merkezi hata yakalama temeli
- `apps/demo-api`: Fastify `/health` endpoint'i
- `apps/worker`: Hazır mesajı yazan minimum worker
- PostgreSQL ve Redis: Docker Compose servisleri ve health check'leri

## Kullanılan komutlar

- `pnpm install`: Bağımlılık kurulumu
- `pnpm dev`: Web, API, worker ve demo API'yi paralel başlatır
- `pnpm build`: Workspace build'leri
- `pnpm typecheck`: Strict TypeScript kontrolü
- `pnpm lint`: ESLint kontrolü
- `pnpm test`: Henüz test olmadığını kontrollü bildirir
- `pnpm docker:up` / `pnpm docker:down`: Altyapı servisleri
- `pnpm db:generate`: Prisma client üretimi

## Önemli dosyalar

- `package.json`: Kök workspace script'leri
- `pnpm-workspace.yaml`: Workspace kapsamı
- `tsconfig.base.json`: Strict TypeScript tabanı
- `packages/shared/src/index.ts`: `ServiceHealth` ortak tipi
- `packages/database/prisma/schema.prisma`: Ürün tablosu içermeyen Prisma şeması
- `infrastructure/docker-compose.yml`: PostgreSQL ve Redis
- `.env.example`: Yerel geliştirme değişkenleri

## Teknik kararlar

- Node.js 20.19+ ve pnpm 10 hedeflendi.
- Uygulamalar ESM ve strict TypeScript kullanır.
- API ve demo API health cevapları `@requestlab/shared` içindeki `ServiceHealth` tipiyle yazılır.
- Prisma bağlantısı `DATABASE_URL` üzerinden alınır; henüz model/migration eklenmedi.
- Compose parolası yalnızca yerel geliştirme varsayılanıdır; gerçek sır kullanılmadı.

## Bilinen sorunlar

- Test framework'ü ve ürün testleri henüz yoktur.
- Worker'da BullMQ görevi işleme yoktur.
- PostgreSQL için migration veya ürün tablosu yoktur.
- Docker'ın kurulu/çalışır olması doğrulama ortamına bağlıdır.

## Sonraki aşamada yapılacaklar

Aşama 2'de event veri modelini ve API'sini tasarlayıp eklemek, Prisma tablolarını oluşturmak ve demo API hata senaryolarını eklemek gerekir. SDK, replay ve kapsamlı dashboard sonraki aşamalara bırakılmalıdır.

Her sonraki aşamanın sonunda bu `HANDOFF.md` dosyası güncellenmelidir.

## Son doğrulama sonuçları

- `corepack pnpm install`: Başarılı.
- `corepack pnpm db:generate`: Başarılı; Prisma Client üretildi.
- `corepack pnpm typecheck`: Başarılı.
- `corepack pnpm lint`: Başarılı.
- `corepack pnpm build`: Başarılı; web, API, demo API, worker ve paketler derlendi.
- `corepack pnpm test`: Başarılı; bu aşamada test bulunmadığı kontrollü bildirildi.
- Derlenmiş API `/health`: `{"status":"ok","service":"api"}`.
- Derlenmiş demo API `/health`: `{"status":"ok","service":"demo-api"}`.
- Docker Compose doğrulaması: Docker CLI ortamda kurulu olmadığı için çalıştırılamadı; Compose dosyası oluşturuldu ve Docker erişimi olan ortamda `docker compose ... config` ile tekrar doğrulanmalı.
