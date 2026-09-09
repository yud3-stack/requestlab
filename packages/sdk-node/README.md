# @requestlab/sdk-node

RequestLab Node.js SDK'sı, Fastify isteklerini fail-open biçimde yakalar, hassas alanları kaynakta maskeler ve mevcut `POST /api/v1/events` endpoint'ine sınırlandırılmış bellek kuyruğundan gönderir.

```ts
import Fastify from "fastify";
import { requestLabPlugin } from "@requestlab/sdk-node";

const app = Fastify();
await app.register(requestLabPlugin, {
  apiUrl: process.env.REQUESTLAB_API_URL!,
  apiKey: process.env.REQUESTLAB_API_KEY!,
  environment: process.env.REQUESTLAB_ENVIRONMENT ?? "development",
  captureMode: "all"
});
```

Gönderim hataları ana HTTP isteğine yansıtılmaz. `flush()` kapanış öncesi kuyruğun gönderilmesini beklemek için kullanılabilir. SDK request/response nesnelerini değiştirmez ve API key'i loglamaz.
