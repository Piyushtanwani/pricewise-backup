import { amazonProvider } from './amazon';
import { flipkartProvider } from './flipkart';
import { ProviderId, StoreProvider } from './types';

export const providers: StoreProvider[] = [amazonProvider, flipkartProvider];

export const configuredProviders = (): StoreProvider[] => providers.filter((p) => p.isConfigured());

export const findProvider = (id: string): StoreProvider | undefined => providers.find((p) => p.id === id);

export const providerStatus = () =>
  providers.map((p) => ({
    id: p.id as ProviderId,
    store: p.storeName,
    configured: p.isConfigured(),
    missing: p.missingConfig(),
  }));

export * from './types';
