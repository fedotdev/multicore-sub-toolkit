/** Happ JSON — массив полных Xray-конфигов (по одному на узел) с remarks. */

import type { ProxyNode } from '../model'
import { buildXrayConfig, type XrayOptions } from './xray'

export function buildHappJson(nodes: ProxyNode[], opts: XrayOptions): Record<string, unknown>[] {
  return nodes.map((node) => {
    const config = buildXrayConfig(node, opts)
    return { ...config, remarks: node.name }
  })
}

export function happToJson(configs: Record<string, unknown>[]): string {
  return JSON.stringify(configs, null, 2)
}
