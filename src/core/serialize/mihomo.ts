/** Сериализация в Mihomo/Clash Meta YAML. */

import yaml from 'js-yaml'
import type { ProxyNode } from '../model'
import { mihomoDns } from '../dns'
import { DISCORD_VOICE_UDP_RANGES } from '../routing'

export interface MihomoOptions {
  redact: boolean
  supportMlkem: boolean
  zapretGroup: boolean
}

function proxyYaml(node: ProxyNode, opts: MihomoOptions): Record<string, unknown> {
  const p: Record<string, unknown> = {
    name: node.name,
    type: 'vless',
    server: node.server,
    port: node.port,
    uuid: node.uuid || '',
    encryption: node.encryption || 'none',
    udp: node.udp === undefined ? true : node.udp,
    tls: node.security === 'tls' || node.security === 'reality',
    network: node.network,
    'client-fingerprint': node.fp || 'chrome',
    flow: node.flow || undefined,
  }
  if (node.security === 'reality' || node.security === 'tls') {
    p['servername'] = node.sni || ''
  }
  if (node.alpn?.length) p['alpn'] = node.alpn

  if (node.security === 'reality') {
    const ro: Record<string, unknown> = { 'public-key': node.pbk || '', 'short-id': node.sid || '' }
    if (node.spx) ro['spider-x'] = node.spx
    if (node.pqv) ro['mldsa65-verify'] = node.pqv
    p['reality-opts'] = ro
    // Mihomo + mlkem + reality warning is UI-side; here we just keep encryption.
    if (!opts.supportMlkem && node.encryption && node.encryption.startsWith('mlkem')) {
      p['encryption'] = 'none'
    }
  }

  // network-specific opts
  if (node.network === 'ws') {
    const w: Record<string, unknown> = { path: node.path || '/', headers: {} }
    if (node.host) (w['headers'] as Record<string, unknown>)['Host'] = node.host
    p['ws-opts'] = w
  } else if (node.network === 'grpc') {
    p['grpc-opts'] = { 'grpc-service-name': node.serviceName || '' }
  } else if (node.network === 'xhttp') {
    const x: Record<string, unknown> = {}
    if (node.path) x['path'] = node.path
    if (node.host) x['host'] = node.host
    if (node.mode) x['mode'] = node.mode
    if (node.extra) {
      const xmux = (node.extra as any).xmux
      if (xmux) {
        const reuse: Record<string, unknown> = {}
        if (xmux.maxConnections !== undefined) reuse['max-connections'] = xmux.maxConnections
        if (xmux.cMaxReuseTimes !== undefined) reuse['c-max-reuse-times'] = xmux.cMaxReuseTimes
        if (xmux.hMaxReusableSecs !== undefined) reuse['h-max-reusable-secs'] = xmux.hMaxReusableSecs
        if (xmux.maxConcurrency !== undefined) reuse['max-concurrency'] = xmux.maxConcurrency
        if (xmux.hMaxRequestTimes !== undefined) reuse['h-max-request-times'] = xmux.hMaxRequestTimes
        if (xmux.hKeepAlivePeriod !== undefined) reuse['h-keep-alive-period'] = xmux.hKeepAlivePeriod
        if (Object.keys(reuse).length) x['reuse-settings'] = reuse
      }
      // pass through any other extra keys
      for (const [k, v] of Object.entries(node.extra)) {
        if (k !== 'xmux') x[k] = v
      }
    }
    p['xhttp-opts'] = x
  } else if (node.network === 'h2' || node.network === 'http') {
    p['http-opts'] = { path: node.path || '/', headers: {} }
    if (node.host) (p['http-opts'] as any).headers['Host'] = node.host
  } else if (node.network === 'tcp' && node.headerType === 'http') {
    p['tcp-opts'] = { header: { type: 'http' } }
  }

  // Убираем undefined
  const clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(p)) {
    if (v !== undefined && v !== null) clean[k] = v
  }
  return clean
}

export function buildMihomoConfig(
  nodes: ProxyNode[],
  opts: MihomoOptions,
  zapret: { mode: 'on' | 'off'; lists: Array<{ id: string; enabled: boolean; lines: string[] }> },
): Record<string, unknown> {
  const proxies = nodes.map((n) => proxyYaml(n, opts))

  const names: string[] = nodes.map((n) => n.name)

  const groups: Record<string, unknown>[] = [
    { name: '🌍 VPN', type: 'select', proxies: [...names, 'DIRECT'] },
    {
      name: '⚡ Auto',
      type: 'url-test',
      url: 'http://www.gstatic.com/generate_204',
      interval: 300,
      tolerance: 50,
      proxies: [...names],
    },
    { name: '📥 Fallback', type: 'fallback', url: 'http://www.gstatic.com/generate_204', expectedStatus: 204, maxFailedTimes: 3, proxies: [...names] },
    { name: '💬 Telegram', type: 'select', proxies: ['🌍 VPN', 'DIRECT'] },
    { name: '🇷🇺 Blocked RU', type: 'select', proxies: ['🌍 VPN', 'DIRECT'] },
    { name: '🇷🇺 RU Direct', type: 'select', proxies: ['DIRECT'] },
    { name: '🚫 Blocked', type: 'select', proxies: ['REJECT', 'DIRECT'] },
  ]

  if (opts.zapretGroup) {
    groups.push({ name: '🧩 Zapret', type: 'select', proxies: ['DIRECT', '🌍 VPN'] })
  }
  groups.push({ name: '🎯 Final', type: 'select', proxies: ['🌍 VPN', 'DIRECT'] })

  const rules: string[] = []

  // Zapret lists (DIRECT if ON else VPN through group)
  const zapretOn = zapret.mode === 'on'
  zapret.lists.forEach((list) => {
    if (!list.enabled) return
    list.lines.forEach((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return
      let entry = trimmed.startsWith('^') ? trimmed.slice(1) : trimmed
      if (!/^geoip:|domain:|full:/i.test(entry)) entry = `+.${entry}`
      const target = zapretOn ? 'DIRECT' : '🌍 VPN'
      rules.push(`DOMAIN-SUFFIX,${entry},${target}`)
    })
  })
  // Discord voice
  if (zapret.mode === 'on') {
    DISCORD_VOICE_UDP_RANGES.forEach((r) => rules.push(`IP-CIDR,${r},DIRECT`))
  }

  // Preset rules
  rules.push('DOMAIN-SUFFIX,+,🎯 Final') // placeholder; will be replaced by proper preset in UI
  // Actually build a reasonable default
  const defaultRules = [
    'DOMAIN,localhost,DIRECT',
    'IP-CIDR,10.0.0.0/8,DIRECT',
    'IP-CIDR,172.16.0.0/12,DIRECT',
    'IP-CIDR,192.168.0.0/16,DIRECT',
    'GEOIP,private,DIRECT',
    'GEOSITE,category-ru,DIRECT',
    'GEOSITE,category-bank-ru,DIRECT',
    'GEOSITE,category-gov-ru,DIRECT',
    'PORT,5228-5230,🌍 VPN',
    'DOMAIN-SUFFIX,t.me,🌍 VPN',
    'DOMAIN-SUFFIX,telegram.org,🌍 VPN',
    'MATCH,🎯 Final',
  ]
  rules.length = 0
  rules.push(...defaultRules)

  const dns = mihomoDns({ presetId: 'doh-tunnel', servers: [], hosts: {}, unexpectedIPs: ['geoip:private'] })

  return {
    proxies,
    'proxy-groups': groups,
    'rule-providers': {},
    rules,
    dns,
    tun: { enable: true, stack: 'system', 'auto-route': true, 'strict-route': true },
    sniffer: {
      enable: true,
      overrideDestination: false,
      parsePing: false,
      forceHost: ['captive.apple.com', 'detectportal.firefox.com', 'das.apple.com'],
    },
  }
}

export function mihomoToYaml(config: Record<string, unknown>): string {
  return yaml.dump(config, { indent: 2, lineWidth: -1, quotingType: "'", forceQuotes: false })
}
