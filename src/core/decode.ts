import yaml from 'js-yaml'
import {
  nextNodeId,
  type Network,
  type ParseIssue,
  type ProxyNode,
  type Security,
} from './model'
import { b64decode, decodeName, looksLikeBase64, parseLinks } from './parse'

export type DecodeFormat =
  | 'links'
  | 'base64'
  | 'clash'
  | 'xray'
  | 'singbox'
  | 'happ-encrypted'
  | 'empty'
  | 'unknown'

export interface DecodeResult {
  format: DecodeFormat
  /** Человекочитаемое описание формата. */
  label: string
  nodes: ProxyNode[]
  issues: ParseIssue[]
  encrypted: { line: number; link: string }[]
  warnings: string[]
}

const FORMAT_LABELS: Record<DecodeFormat, string> = {
  links: 'Список share-ссылок',
  base64: 'Base64-подписка (share-ссылки)',
  clash: 'Clash / Mihomo YAML',
  xray: 'Xray / Happ JSON',
  singbox: 'sing-box JSON',
  'happ-encrypted': 'Happ encrypted (crypto)',
  empty: 'Пустой ввод',
  unknown: 'Неизвестный формат',
}

/** Убираем BOM и лишние пробелы по краям. */
function clean(raw: string): string {
  return raw.replace(/^\uFEFF/, '').trim()
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/)
}

function decodeBase64Subscription(text: string): string | null {
  const compact = text.replace(/\s+/g, '')
  if (!looksLikeBase64(compact) || compact.length < 16) return null
  try {
    const decoded = b64decode(compact)
    if (!decoded || decoded === text) return null
    const trimmed = decoded.trim()
    if (
      trimmed.includes('://') ||
      /"outbounds"\s*:/.test(trimmed) ||
      /^proxies\s*:/m.test(trimmed) ||
      /^\s*\{/.test(trimmed) ||
      /^\s*\[/.test(trimmed)
    ) {
      return decoded
    }
    return null
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/* Clash YAML                                                          */
/* ------------------------------------------------------------------ */

const CLASH_KNOWN = new Set([
  'name', 'type', 'server', 'port', 'uuid', 'password', 'method', 'cipher',
  'network', 'tls', 'servername', 'sni', 'client-fingerprint', 'fingerprint',
  'alpn', 'flow', 'udp', 'skip-cert-verify', 'reality-opts', 'ws-opts',
  'grpc-opts', 'xhttp-opts', 'hysteria2-opts', 'plugin', 'plugin-opts',
  'alterId', 'alter-id', 'encryption', 'packet-encoding', 'ip-version',
])

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

function boostNetwork(raw: unknown): Network {
  const n = String(raw ?? 'tcp').toLowerCase()
  if (n === 'ws') return 'ws'
  if (n === 'grpc') return 'grpc'
  if (n === 'xhttp' || n === 'splithttp') return 'xhttp'
  if (n === 'httpupgrade') return 'httpupgrade'
  if (n === 'h2' || n === 'http') return 'h2'
  if (n === 'quic') return 'quic'
  return 'tcp'
}

function clashProxyToNode(proxy: Record<string, unknown>): ProxyNode | null {
  const type = String(proxy.type ?? '').toLowerCase()
  const protocolMap: Record<string, ProxyNode['protocol']> = {
    vless: 'vless',
    vmess: 'vmess',
    trojan: 'trojan',
    ss: 'ss',
    shadowsocks: 'ss',
    hysteria2: 'hysteria2',
    hy2: 'hysteria2',
    tuic: 'tuic',
  }
  const protocol = protocolMap[type]
  if (!protocol) return null

  const server = String(proxy.server ?? '')
  const port = Number.parseInt(String(proxy.port ?? ''), 10)
  if (!server || !Number.isFinite(port)) return null

  const node: ProxyNode = {
    id: nextNodeId(),
    protocol,
    name: String(proxy.name ?? `${protocol} ${server}:${port}`),
    server,
    port,
    security: 'none',
    network: protocol === 'hysteria2' || protocol === 'tuic' ? 'quic' : boostNetwork(proxy.network),
    udp: proxy.udp === undefined ? true : Boolean(proxy.udp),
    warnings: [],
  }

  node.uuid = proxy.uuid !== undefined ? String(proxy.uuid) : undefined
  if (typeof proxy.password === 'string') node.password = proxy.password
  if (typeof proxy.method === 'string') node.method = proxy.method
  else if (typeof proxy.cipher === 'string') node.cipher = proxy.cipher
  if (typeof proxy.encryption === 'string') node.encryption = proxy.encryption
  if (typeof proxy.flow === 'string') node.flow = proxy.flow
  node.alpn = Array.isArray(proxy.alpn) ? proxy.alpn.map(String) : undefined

  const tls = proxy.tls === true
  const sni = proxy.servername ?? proxy.sni
  if (sni) node.sni = String(sni)
  const fp = proxy['client-fingerprint'] ?? proxy.fingerprint
  if (fp) node.fp = String(fp)
  if (proxy['skip-cert-verify'] === true) node.allowInsecure = true

  if (protocol === 'trojan' || tls) node.security = 'tls'
  const reality = proxy['reality-opts'] as Record<string, unknown> | undefined
  if (reality) {
    node.security = 'reality'
    if (reality['public-key']) node.pbk = String(reality['public-key'])
    if (reality['short-id'] !== undefined) node.sid = String(reality['short-id'])
    if (reality['spider-x']) node.spx = String(reality['spider-x'])
    if (reality['mldsa65-verify']) node.pqv = String(reality['mldsa65-verify'])
  }

  if (node.network === 'ws') {
    const ws = (proxy['ws-opts'] ?? {}) as Record<string, unknown>
    node.path = ws.path ? String(ws.path) : '/'
    const headers = (ws.headers ?? {}) as Record<string, unknown>
    if (headers.Host) node.host = String(headers.Host)
  } else if (node.network === 'grpc') {
    const grpc = (proxy['grpc-opts'] ?? {}) as Record<string, unknown>
    if (grpc['grpc-service-name']) node.serviceName = String(grpc['grpc-service-name'])
  } else if (node.network === 'xhttp') {
    const xhttp = (proxy['xhttp-opts'] ?? {}) as Record<string, unknown>
    if (xhttp.path) node.path = String(xhttp.path)
    if (xhttp.host) node.host = String(xhttp.host)
    if (xhttp.mode) node.mode = String(xhttp.mode)
    const extra = xhttp.extra as Record<string, unknown> | undefined
    if (extra) node.extra = extra
    if (xhttp['reuse-settings'] !== undefined) {
      node.extra = {
        ...(node.extra ?? {}),
        xmux: { ...(node.extra?.xmux ?? {}), 'reuse-settings': xhttp['reuse-settings'] },
      }
    }
  } else if (node.network === 'h2') {
    node.path = proxy.path ? String(proxy.path) : undefined
    node.host = proxy.host ? String(proxy.host) : undefined
  }

  if (protocol === 'hysteria2') {
    node.security = 'tls'
    const hy = (proxy['hysteria2-opts'] ?? {}) as Record<string, unknown>
    if (hy.obfs) node.obfs = String(hy.obfs)
    if (hy['obfs-password']) node.obfsPassword = String(hy['obfs-password'])
    if (typeof proxy.password === 'string') {
      node.auth = proxy.password
    }
    if (Array.isArray(proxy.alpn)) node.alpn = (proxy.alpn as unknown[]).map(String)
  }
  if (protocol === 'tuic') {
    node.security = 'tls'
  }

  if (typeof proxy.plugin === 'string') {
    node.plugin = proxy.plugin
    const opts = proxy['plugin-opts'] as Record<string, unknown> | undefined
    if (opts) {
      node.pluginOpts = Object.fromEntries(Object.entries(opts).map(([k, v]) => [k, String(v)]))
    }
  }

  const unmapped: Record<string, string> = {}
  for (const [key, value] of Object.entries(proxy)) {
    if (CLASH_KNOWN.has(key)) continue
    if (value === undefined || value === null || value === '') continue
    unmapped[key] = typeof value === 'string' ? value : JSON.stringify(value)
  }
  if (Object.keys(unmapped).length) {
    node.unmapped = unmapped
    node.warnings = [...(node.warnings ?? []), `Неподдержанные параметры: ${Object.keys(unmapped).join(', ')}`]
  }
  return node
}

function decodeClash(text: string): DecodeResult | null {
  if (!/(^|\n)\s*proxies\s*:/.test(text)) return null
  try {
    const doc = yaml.load(text) as Record<string, unknown> | null
    if (!doc || typeof doc !== 'object') return null
    const proxies = doc.proxies
    if (!Array.isArray(proxies)) {
      return {
        format: 'clash',
        label: FORMAT_LABELS.clash,
        nodes: [],
        issues: [],
        encrypted: [],
        warnings: ['В YAML нет массива proxies.'],
      }
    }
    const nodes: ProxyNode[] = []
    const issues: ParseIssue[] = []
    proxies.forEach((proxy, index) => {
      if (!proxy || typeof proxy !== 'object') return
      const node = clashProxyToNode(proxy as Record<string, unknown>)
      if (node) nodes.push(node)
      else {
        issues.push({
          line: index + 1,
          link: '',
          message: `Прокси #${index + 1}: неподдерживаемый тип «${String((proxy as Record<string, unknown>).type ?? '?')}».`,
        })
      }
    })
    return {
      format: 'clash',
      label: FORMAT_LABELS.clash,
      nodes,
      issues,
      encrypted: [],
      warnings: [],
    }
  } catch (err) {
    return {
      format: 'clash',
      label: FORMAT_LABELS.clash,
      nodes: [],
      issues: [{ line: 0, link: '', message: `Ошибка YAML: ${err instanceof Error ? err.message : String(err)}` }],
      encrypted: [],
      warnings: [],
    }
  }
}

/* ------------------------------------------------------------------ */
/* Xray JSON                                                           */
/* ------------------------------------------------------------------ */

type JsonObject = Record<string, unknown>

function obj(value: unknown): JsonObject | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : undefined
}

function xrayOutboundToNode(out: JsonObject, remarks?: string): ProxyNode | null {
  const protocolRaw = String(out.protocol ?? '').toLowerCase()
  let protocol: ProxyNode['protocol'] | null = null
  if (protocolRaw === 'vless') protocol = 'vless'
  else if (protocolRaw === 'vmess') protocol = 'vmess'
  else if (protocolRaw === 'trojan') protocol = 'trojan'
  else if (protocolRaw === 'shadowsocks' || protocolRaw === 'ss') protocol = 'ss'
  else if (protocolRaw === 'hysteria2' || protocolRaw === 'hy2' || protocolRaw === 'hysteria') protocol = 'hysteria2'
  else if (protocolRaw === 'tuic') protocol = 'tuic'
  if (!protocol) return null

  const settings = obj(out.settings) ?? {}
  const stream = obj(out.streamSettings) ?? obj(out.stream_settings) ?? {}

  const vnext = asArray(settings.vnext as JsonObject | JsonObject[])[0]
  const sservers = asArray(settings.servers as JsonObject | JsonObject[])[0]
  const users = asArray((vnext ?? sservers)?.users as JsonObject | JsonObject[])[0] ?? {}

  const address = String(
    vnext?.address ?? sservers?.address ?? settings.address ?? settings.server ?? '',
  )
  const port = Number.parseInt(String(vnext?.port ?? sservers?.port ?? settings.port ?? ''), 10)
  if (!address || !Number.isFinite(port)) return null

  const node: ProxyNode = {
    id: nextNodeId(),
    protocol,
    name: remarks || decodeName(String(out.tag ?? '')) || `${protocol} ${address}:${port}`,
    server: address,
    port,
    security: 'none',
    network: boostNetwork(stream.network),
    udp: true,
    warnings: [],
  }
  if (protocol === 'hysteria2' || protocol === 'tuic') node.network = 'quic'

  const type = protocol
  if (type === 'vless' || type === 'vmess') {
    node.uuid = users.id ? String(users.id) : undefined
    if (users.encryption) node.encryption = String(users.encryption)
    if (users.flow) node.flow = String(users.flow)
    if (type === 'vmess') {
      node.alterId = Number.parseInt(String(users.alterId ?? users.aid ?? 0), 10) || 0
      if (users.security) node.cipher = String(users.security)
    }
  } else if (type === 'trojan' || type === 'ss') {
    node.password = sservers?.password !== undefined ? String(sservers.password) : undefined
    if (type === 'ss' && sservers?.method) node.method = String(sservers.method)
  } else if (type === 'hysteria2') {
    const hy = obj(stream.hysteriaSettings) ?? {}
    node.auth = hy.auth ? String(hy.auth) : settings.auth ? String(settings.auth) : undefined
    node.password = node.auth
  } else if (type === 'tuic') {
    node.uuid = sservers?.uuid ? String(sservers.uuid) : users.id ? String(users.id) : undefined
    node.password = sservers?.password ? String(sservers.password) : undefined
  }

  const securityRaw = String(stream.security ?? 'none').toLowerCase()
  if (securityRaw === 'tls' || securityRaw === 'reality') {
    node.security = securityRaw as Security
  } else if (protocol === 'trojan' || protocol === 'hysteria2' || protocol === 'tuic') {
    node.security = 'tls'
  }

  const tls = obj(stream.tlsSettings) ?? {}
  const reality = obj(stream.realitySettings) ?? {}
  if (node.security === 'reality') {
    node.sni = reality.serverName ? String(reality.serverName) : undefined
    node.fp = reality.fingerprint ? String(reality.fingerprint) : undefined
    node.pbk = reality.publicKey ? String(reality.publicKey) : undefined
    node.sid = reality.shortId !== undefined ? String(reality.shortId) : undefined
    node.spx = reality.spiderX !== undefined ? String(reality.spiderX) : undefined
    node.pqv = reality.mldsa65Verify ? String(reality.mldsa65Verify) : undefined
  } else if (node.security === 'tls') {
    node.sni = tls.serverName ? String(tls.serverName) : undefined
    node.fp = tls.fingerprint ? String(tls.fingerprint) : undefined
    node.alpn = Array.isArray(tls.alpn) ? tls.alpn.map(String) : undefined
    if (tls.allowInsecure === true) node.allowInsecure = true
  }
  if (obj(stream.hysteriaSettings)?.auth) node.auth = String(obj(stream.hysteriaSettings)!.auth)

  if (node.network === 'ws') {
    const ws = obj(stream.wsSettings) ?? {}
    node.path = ws.path ? String(ws.path) : '/'
    const headers = obj(ws.headers) ?? {}
    if (headers.Host) node.host = String(headers.Host)
  } else if (node.network === 'grpc') {
    const grpc = obj(stream.grpcSettings) ?? {}
    if (grpc.serviceName) node.serviceName = String(grpc.serviceName)
  } else if (node.network === 'xhttp') {
    const xhttp = obj(stream.xhttpSettings) ?? {}
    if (xhttp.path) node.path = String(xhttp.path)
    if (xhttp.host) node.host = String(xhttp.host)
    if (xhttp.mode) node.mode = String(xhttp.mode)
    if (xhttp.extra && typeof xhttp.extra === 'object') node.extra = xhttp.extra as Record<string, unknown>
  } else if (node.network === 'h2') {
    const http = obj(stream.httpSettings) ?? {}
    if (http.path) node.path = String(http.path)
    if (http.host) node.host = Array.isArray(http.host) ? String(http.host[0]) : String(http.host)
  } else if (stream.tcpSettings) {
    const tcp = obj(stream.tcpSettings) ?? {}
    const header = obj(tcp.header) ?? {}
    if (header.type && header.type !== 'none') node.headerType = String(header.type)
  }
  return node
}

function decodeXrayJson(data: unknown): DecodeResult | null {
  if (Array.isArray(data)) {
    // Happ: массив полных конфигов с remarks
    if (data.length === 0) return null
    const looksLikeConfigs = data.every(
      (item) => item && typeof item === 'object' && ('outbounds' in (item as JsonObject) || 'remarks' in (item as JsonObject)),
    )
    if (!looksLikeConfigs) {
      // Xray: массив outbounds
      const nodes = data
        .map((item) => (obj(item) ? xrayOutboundToNode(item as JsonObject) : null))
        .filter((n): n is ProxyNode => n !== null)
      if (!nodes.length) return null
      return { format: 'xray', label: FORMAT_LABELS.xray, nodes, issues: [], encrypted: [], warnings: [] }
    }
    const nodes: ProxyNode[] = []
    const issues: ParseIssue[] = []
    data.forEach((item, index) => {
      const cfg = obj(item)
      if (!cfg) return
      const remarks = cfg.remarks ? String(cfg.remarks) : undefined
      const outbounds = asArray(cfg.outbounds as JsonObject | JsonObject[])
      let found = false
      for (const out of outbounds) {
        const node = xrayOutboundToNode(out, remarks)
        if (node) {
          nodes.push(node)
          found = true
          break
        }
      }
      if (!found) issues.push({ line: index + 1, link: '', message: 'В конфиге нет поддерживаемого outbound.' })
    })
    return { format: 'xray', label: FORMAT_LABELS.xray, nodes, issues, encrypted: [], warnings: [] }
  }

  const cfg = obj(data)
  if (!cfg) return null
  if (Array.isArray(cfg.outbounds)) {
    const remarks = cfg.remarks ? String(cfg.remarks) : undefined
    const nodes: ProxyNode[] = []
    for (const raw of cfg.outbounds) {
      const out = obj(raw)
      if (!out) continue
      const node = xrayOutboundToNode(out, nodes.length === 0 ? remarks : undefined)
      if (node) nodes.push(node)
      if (remarks && nodes.length === 1) break // remarks относится к основному прокси
    }
    if (!nodes.length) return null
    return { format: 'xray', label: FORMAT_LABELS.xray, nodes, issues: [], encrypted: [], warnings: [] }
  }
  const single = xrayOutboundToNode(cfg, cfg.remarks ? String(cfg.remarks) : undefined)
  if (single) {
    return { format: 'xray', label: FORMAT_LABELS.xray, nodes: [single], issues: [], encrypted: [], warnings: [] }
  }
  return null
}

/* ------------------------------------------------------------------ */
/* sing-box JSON                                                       */
/* ------------------------------------------------------------------ */

function singboxOutboundToNode(out: JsonObject): ProxyNode | null {
  const type = String(out.type ?? '').toLowerCase()
  const map: Record<string, ProxyNode['protocol']> = {
    vless: 'vless',
    vmess: 'vmess',
    trojan: 'trojan',
    shadowsocks: 'ss',
    hysteria2: 'hysteria2',
    tuic: 'tuic',
  }
  const protocol = map[type]
  if (!protocol) return null
  const server = String(out.server ?? '')
  const port = Number.parseInt(String(out.server_port ?? out.port ?? ''), 10)
  if (!server || !Number.isFinite(port)) return null

  const node: ProxyNode = {
    id: nextNodeId(),
    protocol,
    name: decodeName(String(out.tag ?? '')) || `${protocol} ${server}:${port}`,
    server,
    port,
    security: 'none',
    network: protocol === 'hysteria2' || protocol === 'tuic' ? 'quic' : 'tcp',
    udp: true,
    warnings: [],
  }
  if (out.uuid !== undefined) node.uuid = String(out.uuid)
  if (out.password !== undefined) node.password = String(out.password)
  if (out.method !== undefined) node.method = String(out.method)
  if (out.flow !== undefined) node.flow = String(out.flow)
  if (out.encryption !== undefined) node.encryption = String(out.encryption)
  if (out.obfs) {
    const obfs = obj(out.obfs)
    if (obfs?.type) node.obfs = String(obfs.type)
    if (obfs?.password) node.obfsPassword = String(obfs.password)
  }
  if (type === 'hysteria2' && out.password !== undefined) node.auth = String(out.password)

  const tls = obj(out.tls)
  if (tls) {
    const enabled = tls.enabled !== false
    if (enabled) node.security = 'tls'
    if (tls.server_name) node.sni = String(tls.server_name)
    if (Array.isArray(tls.alpn)) node.alpn = tls.alpn.map(String)
    if (tls.insecure === true) node.allowInsecure = true
    const utls = obj(tls.utls)
    if (utls?.fingerprint) node.fp = String(utls.fingerprint)
    const reality = obj(tls.reality)
    if (reality) {
      node.security = 'reality'
      if (reality.public_key) node.pbk = String(reality.public_key)
      if (reality.short_id !== undefined) node.sid = String(reality.short_id)
    }
  } else if (protocol === 'hysteria2' || protocol === 'tuic') {
    node.security = 'tls'
  }

  const transport = obj(out.transport)
  if (transport?.type) {
    node.network = boostNetwork(transport.type)
    if (node.network === 'ws' || node.network === 'httpupgrade') {
      node.path = transport.path ? String(transport.path) : '/'
      const headers = obj(transport.headers) ?? {}
      if (headers.Host) node.host = Array.isArray(headers.Host) ? String(headers.Host[0]) : String(headers.Host)
    } else if (node.network === 'grpc') {
      if (transport.service_name) node.serviceName = String(transport.service_name)
    } else if (node.network === 'h2' || node.network === 'http') {
      node.path = transport.path ? String(transport.path) : undefined
      const headers = obj(transport.headers) ?? {}
      if (headers.Host) node.host = Array.isArray(headers.Host) ? String(headers.Host[0]) : String(headers.Host)
    }
  }

  if (protocol === 'tuic') {
    const cc = out.congestion_control ?? out.congestionControl
    const relay = out.udp_relay_mode ?? out.udpRelayMode
    if (cc || relay) node.extra = { ...(cc ? { congestion_control: String(cc) } : {}), ...(relay ? { udp_relay_mode: String(relay) } : {}) }
  }
  return node
}

function decodeSingboxJson(data: unknown): DecodeResult | null {
  const cfg = Array.isArray(data) ? undefined : obj(data)
  if (!cfg || !Array.isArray(cfg.outbounds)) return null
  const nodes: ProxyNode[] = []
  for (const raw of cfg.outbounds) {
    const out = obj(raw)
    if (!out) continue
    const node = singboxOutboundToNode(out)
    if (node) nodes.push(node)
  }
  if (!nodes.length) return null
  return { format: 'singbox', label: FORMAT_LABELS.singbox, nodes, issues: [], encrypted: [], warnings: [] }
}

/* ------------------------------------------------------------------ */
/* main entry                                                          */
/* ------------------------------------------------------------------ */

export function decodeSubscription(raw: string, depth = 0): DecodeResult {
  const text = clean(raw)
  if (!text) {
    return { format: 'empty', label: FORMAT_LABELS.empty, nodes: [], issues: [], encrypted: [], warnings: [] }
  }

  // Happ encrypted
  if (/^happ:\/\//i.test(text) && !text.includes('\n')) {
    return {
      format: 'happ-encrypted',
      label: FORMAT_LABELS['happ-encrypted'],
      nodes: [],
      issues: [],
      encrypted: [{ line: 1, link: text }],
      warnings: ['Ссылка Happ зашифрована (happ://crypto…). Расшифровать её без ключа невозможно.'],
    }
  }

  // JSON
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const data = JSON.parse(text)
      const singbox = decodeSingboxJson(data)
      if (singbox) return singbox
      const xray = decodeXrayJson(data)
      if (xray) return xray
    } catch {
      /* не JSON, идём дальше */
    }
  }

  // Clash YAML
  const clash = decodeClash(text)
  if (clash) return clash

  // Base64-подписка
  if (depth < 3) {
    const decoded = decodeBase64Subscription(text)
    if (decoded) {
      const inner = decodeSubscription(decoded, depth + 1)
      return {
        ...inner,
        format: 'base64',
        label: FORMAT_LABELS.base64,
        warnings: [...inner.warnings],
      }
    }
  }

  // Обычный текст со ссылками
  const parsed = parseLinks(text)
  if (parsed.nodes.length || parsed.issues.length || parsed.encrypted.length) {
    const warnings: string[] = []
    if (parsed.encrypted.length) {
      warnings.push(
        `Обнаружено зашифрованных Happ-ссылок: ${parsed.encrypted.length}. Они не могут быть расшифрованы без ключа.`,
      )
    }
    return { format: 'links', label: FORMAT_LABELS.links, ...parsed, warnings }
  }

  // Возможно, это одна битая ссылка
  if (/^[a-z][a-z0-9+.-]*:\/\//im.test(text)) {
    const parsedFallback = parseLinks(text)
    if (parsedFallback.issues.length) {
      return { format: 'links', label: FORMAT_LABELS.links, ...parsedFallback, warnings: [] }
    }
  }

  return {
    format: 'unknown',
    label: FORMAT_LABELS.unknown,
    nodes: [],
    issues: [],
    encrypted: [],
    warnings: ['Не удалось распознать формат. Поддерживаются base64-подписки, списки ссылок, Clash YAML, Xray/Happ и sing-box JSON.'],
  }
}

/** Быстрая проверка: текст похож на подписку, а не на случайный ввод. */
export function isProbablySubscription(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  return (
    t.includes('://') ||
    /^[A-Za-z0-9+/_=-\s]{16,}$/.test(t) ||
    /(^|\n)\s*proxies\s*:/.test(t) ||
    t.startsWith('{') ||
    t.startsWith('[')
  )
}
