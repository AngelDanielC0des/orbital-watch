/** Environmental layer id → data provider. The hook reads providers only through this map. */
import type { DataProvider, EnvironmentalLayerId, LayerConfigMap, LayerPayloadMap } from "@/types/layers";
import { ozoneProvider } from "./ozone/ozone.service";

export type ProviderMap = { [K in EnvironmentalLayerId]?: DataProvider<LayerConfigMap[K], LayerPayloadMap[K]> };

export const PROVIDERS: ProviderMap = {
  ozone: ozoneProvider,
};
