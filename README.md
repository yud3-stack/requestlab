# RequestLab

RequestLab, gerçek uygulamalarda oluşan API hatalarını kaydetmek, incelemek ve test ortamında yeniden çalıştırmak için geliştirilen bir geliştirici aracıdır.

## Aşama 1 durumu

Bu sürüm yalnızca monorepo ve temel altyapıyı içerir. Web başlangıç sayfası, API health endpoint'leri, worker başlangıcı, Prisma bağlantı altyapısı ve PostgreSQL/Redis Compose servisleri hazırdır. Hata event API'si, SDK, dashboard özellikleri, demo hata senaryoları ve replay akışı henüz geliştirilmemiştir.

## Teknolojiler

- pnpm workspaces ve TypeScript strict mode
- React, Vite ve Fastify
- PostgreSQL, Redis, Prisma
- Docker Compose, ESLint ve Prettier

## Klasörler

- `apps/web`: Vite tabanlı minimum React arayüzü
- `apps/api`: RequestLab ana Fastify API'si
- `apps/worker`: İleride arka plan görevleri için worker başlangıcı
- `apps/demo-api`: Test senaryoları için Fastify demo API'si
- `packages/shared`: Uygulamalar arası tipler
- `packages/database`: Prisma client ve PostgreSQL şeması
- `packages/config`: Ortak ESLint ve Prettier ayarları
- `infrastructure`: Docker Compose servisleri
- `docs`: Proje belgeleri

## Gereksinimler

- Node.js 20.19 veya üzeri
- pnpm 10 veya üzeri
- Docker Desktop (PostgreSQL ve Redis için)

## Kurulum

```bash
pnpm install
Copy-Item .env.example .env
pnpm db:generate
```

Unix sistemlerde `.env` oluşturma komutu:

```bash
cp .env.example .env
```

`.env.example` içindeki değerler yalnızca yerel geliştirme içindir. Gerçek parola veya API anahtarı içermez; `.env` Git'e eklenmez. Portlar gerektiğinde `.env` üzerinden değiştirilebilir.

## Docker servisleri

```bash
pnpm docker:up
pnpm docker:down
```

Compose PostgreSQL'i `requestlab` kullanıcısı, `requestlab_dev` geliştirme parolası ve `requestlab` veritabanı ile başlatır. PostgreSQL ve Redis verileri kalıcı Docker volume'larında tutulur.

## Uygulamaları çalıştırma

Tüm uygulamaları paralel başlatmak için:

```bash
pnpm dev
```

Tek tek production benzeri build almak için:

```bash
pnpm build
```

Web arayüzü varsayılan olarak `http://localhost:5173`, API `http://localhost:3001`, demo API `http://localhost:3002` adresindedir.

## Health endpoint'leri

```bash
curl http://localhost:3001/health
curl http://localhost:3002/health
```

Beklenen cevaplar sırasıyla `{"status":"ok","service":"api"}` ve `{"status":"ok","service":"demo-api"}` değerleridir.

## Yararlı komutlar

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm db:generate
```

Test altyapısı henüz eklenmediği için `pnpm test` kontrollü biçimde test olmadığını bildirir ve başarılı sonlanır.

## Sonraki aşama

Aşama 2'de event alma modelinin ve API'sinin tasarlanması, veritabanı tablolarının eklenmesi ve demo hata senaryolarının oluşturulması önerilir. Bu aşamaya geçerken önce `HANDOFF.md` güncellenmelidir.
