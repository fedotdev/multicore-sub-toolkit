/** DNS-конфигурация: пресеты, валидация, сериализация в Xray/Mihomo. */

import type { DnsConfig, DnsServer } from './model'

export interface DnsWarnings {
  plainUdp: string[]
  throttled: string[]
  hostsPinned: string[]
}

export interface DnsPreset {
  id: string
  title: string
  description: string
  build: () => DnsConfig
}

export const DNS_PRESETS: DnsPreset[] = [
  {
    id: 'doh-tunnel',
    title: 'DoH через туннель',
    description: 'Cloudflare + Quad9 (+ Google) через туннель с закреплёнными hosts.',
    build: () => ({
      presetId: 'doh-tunnel',
      servers: [
        { id: 'cf', address: 'https://cloudflare-dns.com/dns-query', domains: [], skipFallback: false, via: 'tunnel', enabled: true },
        { id: 'quad9', address: 'https://dns.quad9.net/dns-query', domains: [], skipFallback: false, via: 'tunnel', enabled: true },
        { id: 'google', address: 'https://dns.google/dns-query', domains: [], skipFallback: false, via: 'tunnel', enabled: false },
      ],
      hosts: {
        'dns.quad9.net': ['9.9.9.9', '149.112.112.112'],
        'dns.google': ['8.8.8.8', '8.8.4.4'],
        'cloudflare-dns.com': ['1.1.1.1', '1.0.0.1'],
        'dns.cloudflare.com': ['1.1.1.1', '1.0.0.1'],
      },
      unexpectedIPs: ['geoip:private'],
    }),
  },
  {
    id: 'udp-direct',
    title: 'UDP direct для RU + DoH туннель',
    description: 'Российские домены — через выбранный UDP-резолвер (по умолчанию 9.9.9.9), остальное — DoH через туннель.',
    build: () => ({
      presetId: 'udp-direct',
      servers: [
        { id: 'udp', address: '9.9.9.9', domains: ['geosite:category-ru', 'domain:ru'], skipFallback: false, via: 'direct', enabled: true },
        { id: 'cf', address: 'https://cloudflare-dns.com/dns-query', domains: [], skipFallback: false, via: 'tunnel', enabled: true },
      ],
      hosts: {
        'dns.quad9.net': ['9.9.9.9', '149.112.112.112'],
        'dns.google': ['8.8.8.8', '8.8.4.4'],
        'cloudflare-dns.com': ['1.1.1.1', '1.0.0.1'],
      },
      unexpectedIPs: ['geoip:private'],
    }),
  },
]

export function presetById(id: string): DnsPreset | undefined {
  return DNS_PRESETS.find((p) => p.id === id)
}

export function isDoH(address: string): boolean {
  return address.startsWith('https://') || address.startsWith('http://')
}

export function isDoT(address: string): boolean {
  return address.startsWith('tls://')
}

export function detectDnsWarnings(cfg: DnsConfig): DnsWarnings {
  const plainUdp: string[] = []
  const throttled: string[] = []
  const hostsPinned: string[] = []
  cfg.servers.forEach((s) => {
    if (!s.enabled) return
    if (!isDoH(s.address) && !isDoT(s.address)) plainUdp.push(s.address)
  })
  const dohThrottled = ['dns.quad9.net', 'dns.google', 'cloudflare-dns.com']
  dohThrottled.forEach((h) => {
    if (cfg.hosts[h]) hostsPinned.push(h)
    cfg.servers.forEach((s) => {
      if (s.address.includes(h)) throttled.push(h)
    })
  })
  return { plainUdp, throttled: [...new Set(throttled)], hostsPinned: [...new Set(hostsPinned)] }
}

/* ---------- Xray DNS ---------- */

export function xrayDns(cfg: DnsConfig): Record<string, unknown> {
  const servers: Record<string, unknown>[] = []
  const directServers: string[] = []
  const tunnelServers: string[] = []
  cfg.servers.forEach((s) => {
    if (!s.enabled) return
    const entry: Record<string, unknown> = { address: s.address }
    if (s.queryStrategy) entry['queryStrategy'] = s.queryStrategy
    if (s.domains.length) entry['domains'] = s.domains
    servers.push(entry)
    if (s.via === 'direct') directServers.push(s.address)
    else tunnelServers.push(s.address)
  })
  const dns: Record<string, unknown> = {
    servers,
    // hosts для закрепления DoH имён на прямые IP
    hosts: cfg.hosts,
    // unexpectedIPs — geoip:private означает «не приватные адреса → не доверять»
    unexpectedIPs: cfg.unexpectedIPs,
    // clientIp опционально
  }
  if (directServers.length) dns['clientIp'] = '8.8.8.8'
  return dns
}

/* ---------- Mihomo DNS ---------- */

export function mihomoDns(cfg: DnsConfig): Record<string, unknown> {
  const nameservers: string[] = []
  const proxyServerNameservers: string[] = []
  const directNameservers: string[] = []
  cfg.servers.forEach((s) => {
    if (!s.enabled) return
    const name = isDoH(s.address) || isDoT(s.address) ? s.address : `${s.address}:53`
    const suffixed = s.via === 'tunnel' ? `#tunnel` : name
    if (s.via === 'tunnel') proxyServerNameservers.push(suffixed)
    else directNameservers.push(suffixed)
    nameservers.push(suffixed)
  })
  const dns: Record<string, unknown> = {
    enable: true,
    'enhanced-mode': 'redir-host',
    'prefer-h3': false,
    nameserver: nameservers,
    ...(directNameservers.length ? { 'direct-nameserver': directNameservers } : {}),
    ...(proxyServerNameservers.length ? { 'proxy-server-nameserver': proxyServerNameservers } : {}),
  }
  if (cfg.unexpectedIPs.length) dns['unexpectedIPs'] = cfg.unexpectedIPs
  if (Object.keys(cfg.hosts).length) dns['hosts'] = cfg.hosts
  return dns
}
