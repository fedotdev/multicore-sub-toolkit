/** Единая внутренняя модель узла. Чистые типы, без DOM. */

export type Protocol = 'vless' | 'vmess' | 'trojan' | 'ss' | 'hysteria2' | 'tuic'
export type Network = 'tcp' | 'ws' | 'grpc' | 'xhttp' | 'httpupgrade' | 'h2' | 'http' | 'kcp' | 'quic'
export type Security = 'none' | 'tls' | 'reality'
export type QueryStrategy = 'UseIP' | 'UseIPv4' | 'UseIPv6' | 'AsIs'

export interface Xmux {
  maxConnections?: number | string
  maxConcurrency?: number | string
  cMaxReuseTimes?: number | string
  hMaxRequestTimes?: string
  hMaxReusableSecs?: string
  hKeepAlivePeriod?: number | string
  [key: string]: unknown
}

/** xhttp extra / xmux, сохраняем как есть, чтобы не терять параметры. */
export interface XhttpExtra {
  xmux?: Xmux
  [key: string]: unknown
}

export interface ProxyNode {
  /** Внутренний стабильный id (не секрет). */
  id: string
  protocol: Protocol
  name: string
  server: string
  port: number
  /** vless/vmess/tuic */
  uuid?: string
  /** trojan/ss/hysteria2/tuic */
  password?: string
  /** ss method */
  method?: string
  /** vless encryption, в т.ч. mlkem768x25519plus... */
  encryption?: string
  security: Security
  network: Network
  sni?: string
  fp?: string
  alpn?: string[]
  pbk?: string
  sid?: string
  spx?: string
  /** ML-DSA-65 verify (vless pqv / mldsa65Verify) */
  pqv?: string
  flow?: string
  headerType?: string
  path?: string
  host?: string
  /** xhttp mode: auto / packet-up / stream-up / stream-one */
  mode?: string
  extra?: XhttpExtra
  /** grpc serviceName */
  serviceName?: string
  obfs?: string
  obfsPassword?: string
  auth?: string
  /** hysteria2 port hopping */
  ports?: string
  hop?: string
  allowInsecure?: boolean
  udp?: boolean
  /** vmess */
  alterId?: number
  cipher?: string
  /** ss plugin */
  plugin?: string
  pluginOpts?: Record<string, string>
  /** Оригинальная share-ссылка, если узел пришёл из неё. */
  raw?: string
  /** Неизвестные/неподдержанные параметры, сохраняем и показываем предупреждение. */
  unmapped?: Record<string, string>
  /** Предупреждения по конкретному узлу. */
  warnings?: string[]
  /** Группа/источник (для подписок из YAML/JSON). */
  group?: string
}

export interface ParseIssue {
  line: number
  link: string
  message: string
}

export interface ParseResult {
  nodes: ProxyNode[]
  issues: ParseIssue[]
  /** happ://crypto… и т.п. */
  encrypted: { line: number; link: string }[]
}

/** DNS */
export type DnsVia = 'direct' | 'tunnel'
export interface DnsServer {
  id: string
  /** IP (UDP), https://… (DoH), tls://… (DoT) */
  address: string
  /** Домены/теги, для которых применяется сервер: geosite:…, domain:…, full:… */
  domains: string[]
  skipFallback: boolean
  queryStrategy?: QueryStrategy
  via: DnsVia
  enabled: boolean
}
export interface DnsConfig {
  presetId: string
  servers: DnsServer[]
  hosts: Record<string, string[]>
  unexpectedIPs: string[]
}

/** Zapret / доменные списки */
export type ListId = 'general' | 'google' | 'exclude' | 'ipset-exclude' | 'ipset-all' | 'user'

export interface DomainList {
  id: ListId
  title: string
  /** Сырые строки из источника (без комментариев). */
  lines: string[]
  enabled: boolean
  fetchedAt?: number
  source?: string
  isUser?: boolean
}

export interface ZapretState {
  /** ON → домены Zapret идут DIRECT, OFF → VPN */
  mode: 'on' | 'off'
  lists: DomainList[]
  /** Discord voice UDP + Flowseal general.bat */
  discordVoice: boolean
  discordVoiceRanges: string[]
  warnCloudfront: boolean
}

/** Routing */
export type RoutingPreset = 'vpn-first' | 'direct-first'

export interface RoutingConfig {
  preset: RoutingPreset
  blockAds: boolean
  blockBitTorrent: boolean
  telegramViaVpn: boolean
  ruDirect: boolean
  /** allow-list для direct-first */
  allowDomains: string[]
  blockMalware: boolean
  blockQuic: boolean
}

/** Общие настройки экспорта */
export interface ExportOptions {
  redact: boolean
  /** Mihomo: support-x25519mlkem768 */
  supportMlkem: boolean
  /** v2rayNG all-in-one: включить balancers */
  balancers: boolean
  /** v2rayNG all-in-one: selector pinning */
  pinSelector: boolean
  /** Mihomo: выбирать Zapret-режим через group */
  zapretGroup: boolean
  /** порт socks/http для Happ */
  socksPort: number
  httpPort: number
}

export const DEFAULT_EXPORT: ExportOptions = {
  redact: false,
  supportMlkem: true,
  balancers: true,
  pinSelector: false,
  zapretGroup: true,
  socksPort: 10808,
  httpPort: 10809,
}

let idCounter = 0
export function nextNodeId(): string {
  idCounter += 1
  return `n${idCounter}`
}

export function defaultDnsConfig(): DnsConfig {
  return {
    presetId: 'doh-tunnel',
    servers: [
      {
        id: 'cf',
        address: 'https://cloudflare-dns.com/dns-query',
        domains: [],
        skipFallback: false,
        via: 'tunnel',
        enabled: true,
      },
      {
        id: 'quad9',
        address: 'https://dns.quad9.net/dns-query',
        domains: [],
        skipFallback: false,
        via: 'tunnel',
        enabled: true,
      },
      {
        id: 'google',
        address: 'https://dns.google/dns-query',
        domains: [],
        skipFallback: false,
        via: 'tunnel',
        enabled: false,
      },
    ],
    hosts: {
      'dns.quad9.net': ['9.9.9.9', '149.112.112.112'],
      'dns.google': ['8.8.8.8', '8.8.4.4'],
      'cloudflare-dns.com': ['1.1.1.1', '1.0.0.1'],
      'dns.cloudflare.com': ['1.1.1.1', '1.0.0.1'],
    },
    unexpectedIPs: ['geoip:private'],
  }
}

export function defaultRouting(): RoutingConfig {
  return {
    preset: 'vpn-first',
    blockAds: false,
    blockBitTorrent: true,
    telegramViaVpn: true,
    ruDirect: true,
    allowDomains: [],
    blockMalware: false,
    blockQuic: false,
  }
}
