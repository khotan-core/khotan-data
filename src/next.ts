import { toNextJsHandler, type KhotanHandler } from "./factory.js";

interface KhotanRouteInstance {
  handler: KhotanHandler;
}

interface KhotanRouteModule {
  default?: KhotanRouteInstance;
  khotanData?: KhotanRouteInstance;
}

async function defaultKhotanHandler(request: Request): Promise<Response> {
  const khotanModule = "@/khotan/khotan";
  const mod = (await import(khotanModule)) as KhotanRouteModule;
  const instance = mod.default ?? mod.khotanData;

  if (!instance || typeof instance.handler !== "function") {
    throw new Error(
      'khotan-data/next expected "@/khotan/khotan" to export a khotan instance as default or khotanData',
    );
  }

  return instance.handler(request);
}

export const { GET, POST, PUT, PATCH, DELETE } =
  toNextJsHandler(defaultKhotanHandler);
