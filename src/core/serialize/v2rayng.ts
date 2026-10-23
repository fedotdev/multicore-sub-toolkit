/** v2rayNG / Xray JSON: один файл на узел + all-in-one с observatory + routing.balancers. */

import type { ProxyNode } from '../model'

export interface V2rayNGOptions {
  balancers: boolean
  pinSelector: boolean
  redact: boolean
}

function nodeOutbound(node: ProxyNode, tag: string): Record<string, unknown> {
  const user: Record<string, unknown> = { id: node.uuid || '', encryption: node.encryption || 'none' }
  if (node.flow) user['flow'] = node.flow

  const ss: Record<string, unknown> = { network: node.network, security: node.security }

  if (node.security === 'tls' || node.security === 'reality') {
    const tls: Record<string, unknown> = {}
    if (node.sni) tls['serverName'] = node.sni
    if (node.fp) tls['fingerprint'] = node.fp
    if (node.alpn?.length) tls['alpn'] = node.alpn
    ss['tlsSettings'] = tls
    if (node.security === 'reality') {
      ss['realitySettings'] = {
        serverName: node.sni || '',
        fingerprint: node.fp || 'chrome',
        publicKey: node.pbk || '',
        shortId: node.sid || '',
        spiderX: node.spx || '',
      }
    }
  }

  if (node.network === 'ws') {
    const w: Record<string, unknown> = { path: node.path || '/' }
    if (node.host) w['headers'] = { Host: node.host }
    ss['wsSettings'] = w
  } else if (node.network === 'grpc') {
    ss['grpcSettings'] = { grpcServiceName: node.serviceName || '' }
  } else if (node.network === 'xhttp') {
    const x: Record<string, unknown> = {}
    if (node.path) x['path'] = node.path
    if (node.host) x['host'] = node.host
    if (node.mode) x['mode'] = node.mode
    if (node.extra) x['extra'] = node.extra
    ss['xhttpSettings'] = x
  } else if (node.network === 'h2') {
    ss['httpSettings'] = { path: node.path || '/', host: node.host || '' }
  }

  return {
    tag,
    protocol: 'vless',
    settings: { vnext: [{ address: node.server, port: node.port, users: [user] }] },
    streamSettings: ss,
  }
}

export function buildV2rayngNodeConfig(node: ProxyNode, port = 10808): Record<string, unknown> {
  const n = node
  return {
    log: { loglevel: 'warning' },
    inbounds: [{ tag: 'socks-in', listen: '127.0.0.1', port, protocol: 'socks', settings: { udp: true } }],
    outbounds: [nodeOutbound(node, 'proxy'), { tag: 'direct', protocol: 'freedom' }, { tag: 'block', protocol: 'blackhole' }],
    routing: { domainStrategy: 'IPIfNonMatch', rules: [{ type: 'field', ip: ['geoip:private'], outboundTag: 'direct' }] },
  }
}

export function buildV2rayngAllInOne(nodes: ProxyNode[], opts: V2rayNGOptions): Record<string, unknown> {
  const names = nodes.map((n) => `proxy-${n.id}`)
  const outbounds = nodes.map((n, i) => ({ ...nodeOutbound(n, `proxy-${n.id}`), tag: `proxy-${n.id}` }))

  const config: Record<string, unknown> = {
    log: { loglevel: 'warning' },
    inbounds: [{ tag: 'socks-in', listen: '127.0.0.1', port: 10808, protocol: 'socks', settings: { udp: true } }],
    outbounds: [
      ...outbounds,
      { tag: 'direct', protocol: 'freedom' },
      { tag: 'block', protocol: 'blackhole' },
    ],
    routing: {
      domainStrategy: 'IPIfNonMatch',
      balancers: opts.balancers
        ? [
            { tag: 'leastPing', selector: names },
            { tag: 'fallbackTag', selector: ['🌍 VPN', ...names] },
          ]
        : [],
      rules: [
        { type: 'field', ip: ['geoip:private'], outboundTag: 'direct' },
        { type: 'field', outboundTag: '🎯 Final', network: 'tcp,udp' },
      ],
    },
  }
  if (opts.pinSelector) {
    ;(config.routing as any).rules.push({ type: 'field', outboundTag: '🌍 VPN', network: 'tcp,udp' })
  }
  return config
}

export function toJson(config: Record<string, unknown>): string {
  return JSON.stringify(config, null, 2)
}
