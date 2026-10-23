import {
  nextNodeId,
  type Network,
  type ParseIssue,
  type ParseResult,
  type Protocol,
  type ProxyNode,
  type Security,
  type XhttpExtra,
} from './model'

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/** Base64 → UTF-8. Принимает standard/url-safe, без padding, игнорирует whitespace. */
export function b64decode(input: string): string {
  let s = input.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  const pad = s.length % 4
  if (pad === 1) throw new Error('invalid base64 length')
  if (pad) s += '='.repeat(4 - pad)
  const bin = atob(s)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

/** Похоже ли на base64 (грубая проверка, чтобы не портить пароли). */
export function looksLikeBase64(s: string): boolean {
  const t = s.replace(/\s+/g, '')
  return t.length >= 8 && /^[A-Za-z0-9+/_=-]+$/.test(t)
}

export function b64encodeUtf8(input: string): string {
  const bytes = new TextEncoder().encode(input)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

/** URL-safe base64 без padding (для генерации ссылок). */
export function b64urlEncode(input: string): string {
  return b64encodeUtf8(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function decodeName(fragment: string | undefined | null): string {
  if (!fragment) return ''
  const raw = fragment.startsWith('#') ? fragment.slice(1) : fragment
  let decoded = raw
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    decoded = raw
  }
  return decoded.replace(/\+/g, ' ').trim()
}

interface RawShareLink {
  scheme: string
  userinfo: string
  host: string
  port: string
  query: string
  fragment: string
}

/** Толерантный разбор share-ссылки без URL() (URL часто падает на «грязных» ссылках). */
export function splitShareLink(link: string): RawShareLink | null {
  const src = link.trim()
  const schemeEnd = src.indexOf('://')
  if (schemeEnd <= 0) return null
  const scheme = src.slice(0, schemeEnd).toLowerCase()
  const hashIdx = src.indexOf('#')
  const fragment = hashIdx >= 0 ? src.slice(hashIdx + 1) : ''
  let body = src.slice(schemeEnd + 3, hashIdx >= 0 ? hashIdx : undefined)
  const qIdx = body.indexOf('?')
  const query = qIdx >= 0 ? body.slice(qIdx + 1) : ''
  if (qIdx >= 0) body = body.slice(0, qIdx)

  const atIdx = body.lastIndexOf('@')
  let userinfo = ''
  let hostport = body
  if (atIdx >= 0) {
    userinfo = body.slice(0, atIdx)
    hostport = body.slice(atIdx + 1)
  }

  let host = hostport
  let port = ''
  if (hostport.startsWith('[')) {
    const end = hostport.indexOf(']')
    if (end > 0) {
      host = hostport.slice(1, end)
      if (hostport[end + 1] === ':') port = hostport.slice(end + 2)
    }
  } else {
    const colon = hostport.lastIndexOf(':')
    if (colon >= 0) {
      host = hostport.slice(0, colon)
      port = hostport.slice(colon + 1)
    }
  }
  try {
    host = decodeURIComponent(host)
    userinfo = decodeURIComponent(userinfo)
  } catch {
    /* оставляем как есть */
  }
  return { scheme, userinfo, host, port, query, fragment }
}

export function parseQuery(query: string): Record<string, string> {
  const out: Record<string, string> = {}
  const params = new URLSearchParams(query)
  params.forEach((value, key) => {
    if (!(key in out)) out[key] = value
  })
  return out
}

function normalizeSecurity(value: string | undefined, fallback: Security = 'none'): Security {
  switch ((value || '').toLowerCase()) {
    case 'tls':
    case 'xtls':
      return 'tls'
    case 'reality':
      return 'reality'
    case 'none':
    case '':
      return 'none'
    default:
      return fallback
  }
}

function normalizeNetwork(value: string | undefined): Network {
  switch ((value || '').toLowerCase()) {
    case 'ws':
    case 'websocket':
      return 'ws'
    case 'grpc':
    case 'gun':
      return 'grpc'
    case 'xhttp':
    case 'splithttp':
      return 'xhttp'
    case 'httpupgrade':
      return 'httpupgrade'
    case 'h2':
    case 'http':
      return 'h2'
    case 'kcp':
    case 'mkcp':
      return 'kcp'
    case 'quic':
      return 'quic'
    default:
      return 'tcp'
  }
}

function parsePort(raw: string, fallback = 443): number {
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 && n <= 65535 ? n : fallback
}

function parseBool(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined
  return /^(1|true|yes|on)$/i.test(value) ? true : /^(0|false|no|off)$/i.test(value) ? false : undefined
}

function parseAlpn(value: string | undefined): string[] | undefined {
  if (!value) return undefined
  const list = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return list.length ? list : undefined
}

function takeKnown(
  q: Record<string, string>,
  known: string[],
): { values: Record<string, string>; unmapped: Record<string, string> } {
  const values: Record<string, string> = {}
  const unmapped: Record<string, string> = {}
  for (const [k, v] of Object.entries(q)) {
    if (known.includes(k)) values[k] = v
    else unmapped[k] = v
  }
  return { values, unmapped }
}

function parseExtra(raw: string | undefined, warnings: string[]): XhttpExtra | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as XhttpExtra
    warnings.push('Параметр extra не является объектом JSON — сохранён как предупреждение.')
    return undefined
  } catch {
    warnings.push('Не удалось разобрать JSON в параметре extra — параметр сохранён в «unmapped».')
    return undefined
  }
}

const VLESS_KNOWN = [
  'encryption', 'security', 'sni', 'fp', 'alpn', 'pbk', 'sid', 'spx', 'pqv', 'mldsa65Verify',
  'type', 'flow', 'headerType', 'path', 'host', 'mode', 'extra', 'serviceName',
  'allowInsecure', 'udp', 'ports', 'hop', 'remark',
]

function baseNode(protocol: Protocol, name: string, server: string, port: number): ProxyNode {
  return {
    id: nextNodeId(),
    protocol,
    name: name || `${protocol} ${server}:${port}`,
    server,
    port,
    security: 'none',
    network: 'tcp',
    udp: true,
    warnings: [],
  }
}

/* ------------------------------------------------------------------ */
/* vless                                                               */
/* ------------------------------------------------------------------ */

export function parseVless(link: string): ProxyNode {
  const raw = splitShareLink(link)
  if (!raw) throw new Error('не удалось разобрать ссылку')
  if (!raw.host) throw new Error('не указан сервер')
  const q = parseQuery(raw.query)
  const { values, unmapped } = takeKnown(q, VLESS_KNOWN)
  const warnings: string[] = []

  const node = baseNode('vless', decodeName(raw.fragment), raw.host, parsePort(raw.port, 443))
  node.uuid = raw.userinfo
  node.encryption = values.encryption || 'none'
  node.security = normalizeSecurity(values.security)
  node.network = normalizeNetwork(values.type)
  node.sni = values.sni
  node.fp = values.fp
  node.alpn = parseAlpn(values.alpn)
  node.pbk = values.pbk
  node.sid = values.sid
  node.spx = values.spx
  node.pqv = values.pqv || values.mldsa65Verify
  node.flow = values.flow
  node.headerType = values.headerType
  node.path = values.path
  node.host = values.host
  node.mode = values.mode
  node.serviceName = values.serviceName
  node.ports = values.ports
  node.hop = values.hop
  node.allowInsecure = parseBool(values.allowInsecure)
  node.udp = parseBool(values.udp) ?? true
  node.extra = parseExtra(values.extra, warnings)

  if (node.security === 'reality' && !node.pbk) {
    warnings.push('Reality без pbk (public key) — конфиг, скорее всего, не подключится.')
  }
  if (node.network === 'xhttp' && !node.mode) node.mode = 'auto'
  if (node.network === 'grpc' && !node.serviceName) {
    node.serviceName = values.path || ''
  }
  if (values.security === 'xtls') warnings.push('security=xtls нормализован в tls.')
  if (values.encryption && values.encryption !== 'none' && !values.encryption.startsWith('mlkem')) {
    warnings.push(`Неизвестное значение encryption: ${values.encryption}`)
  }
  if (Object.keys(unmapped).length) {
    node.unmapped = unmapped
    warnings.push(`Неподдержанные параметры: ${Object.keys(unmapped).join(', ')}`)
  }
  node.warnings = warnings
  node.raw = link.trim()
  return node
}

/* ------------------------------------------------------------------ */
/* vmess                                                               */
/* ------------------------------------------------------------------ */

interface VmessJson {
  v?: string
  ps?: string
  add?: string
  port?: string | number
  id?: string
  aid?: string | number
  scy?: string
  net?: string
  type?: string
  host?: string
  path?: string
  tls?: string
  sni?: string
  alpn?: string
  fp?: string
  [key: string]: unknown
}

const VMESS_KNOWN = ['v', 'ps', 'add', 'port', 'id', 'aid', 'scy', 'net', 'type', 'host', 'path', 'tls', 'sni', 'alpn', 'fp']

export function parseVmess(link: string, decoded?: VmessJson): ProxyNode {
  let data: VmessJson | null = decoded ?? null
  let warnings: string[] = []

  if (!data) {
    const body = link.trim().replace(/^vmess:\/\//i, '')
    const fragmentless = body.split('#')[0]
    // 1) vmess://<base64json>
    try {
      const json = b64decode(fragmentless)
      const parsed = JSON.parse(json)
      if (parsed && typeof parsed === 'object') data = parsed as VmessJson
    } catch {
      data = null
    }
    // 2) vmess://uuid@host:port?type=... (нестандартный, но встречается)
    if (!data) {
      const raw = splitShareLink(link)
      if (raw && raw.userinfo && raw.host) {
        const q = parseQuery(raw.query)
        data = {
          ps: decodeName(raw.fragment),
          add: raw.host,
          port: raw.port,
          id: raw.userinfo,
          net: q.type || 'tcp',
          tls: q.security === 'tls' ? 'tls' : undefined,
          sni: q.sni,
          host: q.host,
          path: q.path,
          alpn: q.alpn,
          fp: q.fp,
          scy: q.encryption,
        }
        warnings.push('VMess разобран из нестандартного SIP002-подобного формата.')
      }
    }
  }

  if (!data || !data.add) throw new Error('VMess: не удалось декодировать base64/JSON или нет поля add')

  const node = baseNode(
    'vmess',
    decodeName(data.ps) || decodeName(link.split('#')[1]),
    String(data.add),
    parsePort(String(data.port ?? '443'), 443),
  )
  node.uuid = String(data.id ?? '')
  node.alterId = Number.parseInt(String(data.aid ?? '0'), 10) || 0
  node.cipher = String(data.scy ?? 'auto')
  node.network = normalizeNetwork(data.net)
  node.security = normalizeSecurity(data.tls)
  node.sni = data.sni
  node.fp = data.fp
  node.alpn = parseAlpn(data.alpn)
  node.path = data.path
  node.host = data.host
  node.headerType = data.type && data.type !== 'none' ? data.type : undefined
  if (node.network === 'grpc') node.serviceName = data.path || ''
  if (node.network === 'h2') node.network = 'h2'

  if (!node.uuid) warnings.push('VMess без id (UUID).')
  const unmapped: Record<string, string> = {}
  for (const [k, v] of Object.entries(data)) {
    if (!VMESS_KNOWN.includes(k) && v !== undefined && v !== null && v !== '') {
      unmapped[k] = typeof v === 'string' ? v : JSON.stringify(v)
    }
  }
  if (Object.keys(unmapped).length) {
    node.unmapped = unmapped
    warnings.push(`Неподдержанные параметры: ${Object.keys(unmapped).join(', ')}`)
  }
  node.warnings = warnings
  node.raw = link.trim()
  return node
}

/* ------------------------------------------------------------------ */
/* trojan                                                              */
/* ------------------------------------------------------------------ */

const TROJAN_KNOWN = [
  'security', 'sni', 'fp', 'alpn', 'type', 'headerType', 'path', 'host', 'serviceName',
  'allowInsecure', 'udp', 'mode', 'port', 'remark',
]

export function parseTrojan(link: string): ProxyNode {
  const raw = splitShareLink(link)
  if (!raw) throw new Error('не удалось разобрать ссылку')
  const q = parseQuery(raw.query)
  const { values, unmapped } = takeKnown(q, TROJAN_KNOWN)
  const warnings: string[] = []
  const node = baseNode('trojan', decodeName(raw.fragment), raw.host, parsePort(raw.port, 443))
  node.password = raw.userinfo
  // Trojan по умолчанию TLS; security=none должен быть указан явно.
  node.security = values.security === undefined ? 'tls' : normalizeSecurity(values.security)
  node.network = normalizeNetwork(values.type)
  node.sni = values.sni
  node.fp = values.fp
  node.alpn = parseAlpn(values.alpn)
  node.path = values.path
  node.host = values.host
  node.headerType = values.headerType
  node.serviceName = values.serviceName || (node.network === 'grpc' ? values.path : undefined)
  node.allowInsecure = parseBool(values.allowInsecure)
  node.udp = parseBool(values.udp) ?? true

  if (!node.password) warnings.push('Trojan без пароля.')
  if (Object.keys(unmapped).length) {
    node.unmapped = unmapped
    warnings.push(`Неподдержанные параметры: ${Object.keys(unmapped).join(', ')}`)
  }
  node.warnings = warnings
  node.raw = link.trim()
  return node
}

/* ------------------------------------------------------------------ */
/* shadowsocks                                                         */
/* ------------------------------------------------------------------ */

const SS_KNOWN = ['plugin', 'udp', 'allowInsecure', 'remark']

function splitHostPort(value: string): { host: string; port: string } {
  const v = value.trim()
  if (v.startsWith('[')) {
    const end = v.indexOf(']')
    return { host: v.slice(1, end), port: v.slice(end + 2) }
  }
  const colon = v.lastIndexOf(':')
  if (colon < 0) return { host: v, port: '' }
  return { host: v.slice(0, colon), port: v.slice(colon + 1) }
}

export function parseShadowsocks(link: string): ProxyNode {
  const warnings: string[] = []
  const src = link.trim()
  const hashIdx = src.indexOf('#')
  const name = decodeName(hashIdx >= 0 ? src.slice(hashIdx + 1) : '')
  let withoutFragment = hashIdx >= 0 ? src.slice(0, hashIdx) : src
  withoutFragment = withoutFragment.replace(/^ss:\/\//i, '')

  const qIdx = withoutFragment.indexOf('?')
  const query = qIdx >= 0 ? withoutFragment.slice(qIdx + 1) : ''
  if (qIdx >= 0) withoutFragment = withoutFragment.slice(0, qIdx)
  const q = parseQuery(query)

  let method = ''
  let password = ''
  let host = ''
  let port = ''

  const at = withoutFragment.lastIndexOf('@')
  if (at >= 0) {
    // SIP002: ss://base64(method:password)@host:port
    let userinfo = withoutFragment.slice(0, at)
    const hp = splitHostPort(withoutFragment.slice(at + 1))
    host = hp.host
    port = hp.port
    if (looksLikeBase64(userinfo) && !userinfo.includes(':')) {
      try {
        userinfo = b64decode(userinfo)
      } catch {
        /* оставляем */
      }
    }
    const colon = userinfo.indexOf(':')
    if (colon < 0) throw new Error('Shadowsocks: нет method:password')
    try {
      userinfo = decodeURIComponent(userinfo)
    } catch {
      /* ignore */
    }
    method = userinfo.slice(0, colon)
    password = userinfo.slice(colon + 1)
  } else {
    // legacy: ss://base64(method:password@host:port)
    let decoded = ''
    try {
      decoded = b64decode(withoutFragment)
    } catch {
      throw new Error('Shadowsocks: не удалось декодировать base64')
    }
    const lastAt = decoded.lastIndexOf('@')
    if (lastAt < 0) throw new Error('Shadowsocks: неверный формат ссылки')
    const creds = decoded.slice(0, lastAt)
    const hp = splitHostPort(decoded.slice(lastAt + 1))
    host = hp.host
    port = hp.port
    const colon = creds.indexOf(':')
    if (colon < 0) throw new Error('Shadowsocks: нет method:password')
    method = creds.slice(0, colon)
    password = creds.slice(colon + 1)
    warnings.push('Shadowsocks разобран из legacy-формата без SIP002.')
  }

  const node = baseNode('ss', name, host, parsePort(port, 8388))
  node.method = method
  node.password = password
  node.security = 'none'
  node.network = 'tcp'
  node.udp = parseBool(q.udp) ?? true
  if (q.plugin) {
    node.plugin = q.plugin
    const opts: Record<string, string> = {}
    const parts = q.plugin.split(';')
    for (const part of parts.slice(1)) {
      const eq = part.indexOf('=')
      if (eq > 0) opts[part.slice(0, eq)] = part.slice(eq + 1)
      else if (part) opts[part] = ''
    }
    node.pluginOpts = opts
  }
  const { unmapped } = takeKnown(q, SS_KNOWN)
  if (Object.keys(unmapped).length) {
    node.unmapped = unmapped
    warnings.push(`Неподдержанные параметры: ${Object.keys(unmapped).join(', ')}`)
  }
  node.warnings = warnings
  node.raw = link.trim()
  return node
}

/* ------------------------------------------------------------------ */
/* hysteria2                                                           */
/* ------------------------------------------------------------------ */

const HY2_KNOWN = [
  'obfs', 'obfs-password', 'obfsPassword', 'sni', 'alpn', 'insecure', 'allowInsecure',
  'fp', 'ports', 'hop', 'mport', 'up', 'down', 'udp', 'remark', 'peer', 'ech',
]

export function parseHysteria2(link: string): ProxyNode {
  const raw = splitShareLink(link)
  if (!raw) throw new Error('не удалось разобрать ссылку')
  const q = parseQuery(raw.query)
  const { values, unmapped } = takeKnown(q, HY2_KNOWN)
  const warnings: string[] = []
  const node = baseNode('hysteria2', decodeName(raw.fragment), raw.host, parsePort(raw.port, 443))
  node.network = 'quic'
  node.password = raw.userinfo
  node.auth = raw.userinfo
  node.security = 'tls'
  node.sni = values.sni || values.peer
  node.fp = values.fp
  node.alpn = parseAlpn(values.alpn) || ['h3']
  node.obfs = values.obfs
  node.obfsPassword = values['obfs-password'] || values.obfsPassword
  node.ports = values.ports || values.mport
  node.hop = values.hop
  node.allowInsecure = parseBool(values.insecure ?? values.allowInsecure)

  if (node.obfs && node.obfs !== 'salamander') {
    warnings.push(`Неизвестный obfs: ${node.obfs} (поддерживается salamander).`)
  }
  if (node.obfs === 'salamander' && !node.obfsPassword) {
    warnings.push('obfs=salamander без obfs-password.')
  }
  if (!node.password) warnings.push('Hysteria2 без пароля/auth.')
  if (Object.keys(unmapped).length) {
    node.unmapped = unmapped
    warnings.push(`Неподдержанные параметры: ${Object.keys(unmapped).join(', ')}`)
  }
  node.warnings = warnings
  node.raw = link.trim()
  return node
}

/* ------------------------------------------------------------------ */
/* tuic                                                                */
/* ------------------------------------------------------------------ */

const TUIC_KNOWN = [
  'congestion_control', 'congestion-control', 'udp_relay_mode', 'udp-relay-mode',
  'alpn', 'sni', 'insecure', 'allowInsecure', 'disable_sni', 'disable-sni',
  'reduce_rtt', 'reduce-rtt', 'heartbeat', 'udp', 'remark',
]

export function parseTuic(link: string): ProxyNode {
  const raw = splitShareLink(link)
  if (!raw) throw new Error('не удалось разобрать ссылку')
  const q = parseQuery(raw.query)
  const { values, unmapped } = takeKnown(q, TUIC_KNOWN)
  const warnings: string[] = []
  const node = baseNode('tuic', decodeName(raw.fragment), raw.host, parsePort(raw.port, 443))
  node.network = 'quic'
  node.security = 'tls'
  const colon = raw.userinfo.indexOf(':')
  if (colon >= 0) {
    node.uuid = raw.userinfo.slice(0, colon)
    node.password = raw.userinfo.slice(colon + 1)
  } else {
    node.uuid = raw.userinfo
  }
  node.sni = values.sni
  node.alpn = parseAlpn(values.alpn) || ['h3']
  node.allowInsecure = parseBool(values.insecure ?? values.allowInsecure)
  node.udp = parseBool(values.udp) ?? true

  const extras: Record<string, string> = {}
  for (const key of ['congestion_control', 'congestion-control', 'udp_relay_mode', 'udp-relay-mode']) {
    if (values[key]) extras[key] = values[key]
  }
  if (Object.keys(extras).length) node.extra = extras
  if (!node.uuid) warnings.push('TUIC без UUID.')
  if (Object.keys(unmapped).length) {
    node.unmapped = unmapped
    warnings.push(`Неподдержанные параметры: ${Object.keys(unmapped).join(', ')}`)
  }
  node.warnings = warnings
  node.raw = link.trim()
  return node
}

/* ------------------------------------------------------------------ */
/* dispatcher                                                          */
/* ------------------------------------------------------------------ */

export function parseLink(link: string): ProxyNode {
  const trimmed = link.trim()
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) throw new Error('не является share-ссылкой')
  if (/^happ:\/\//i.test(trimmed)) {
    const err = new Error('ENCRYPTED_HAPP')
    ;(err as Error & { code?: string }).code = 'ENCRYPTED_HAPP'
    throw err
  }
  const scheme = trimmed.slice(0, trimmed.indexOf('://')).toLowerCase()
  switch (scheme) {
    case 'vless':
      return parseVless(trimmed)
    case 'vmess':
      return parseVmess(trimmed)
    case 'trojan':
      return parseTrojan(trimmed)
    case 'ss':
      return parseShadowsocks(trimmed)
    case 'hysteria2':
    case 'hy2':
      return parseHysteria2(trimmed)
    case 'tuic':
      return parseTuic(trimmed)
    default:
      throw new Error(`неподдерживаемая схема: ${scheme}`)
  }
}

export function parseLinks(text: string): ParseResult {
  const nodes: ProxyNode[] = []
  const issues: ParseIssue[] = []
  const encrypted: { line: number; link: string }[] = []
  const lines = text.split(/\r?\n/)
  lines.forEach((line, index) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return
    if (/^happ:\/\//i.test(trimmed)) {
      encrypted.push({ line: index + 1, link: trimmed })
      return
    }
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return
    try {
      nodes.push(parseLink(trimmed))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message === 'ENCRYPTED_HAPP') {
        encrypted.push({ line: index + 1, link: trimmed })
        return
      }
      issues.push({ line: index + 1, link: trimmed, message })
    }
  })
  return { nodes, issues, encrypted }
}
