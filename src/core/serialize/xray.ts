/** Сериализация в полный конфиг Xray (один файл на узлу). */

import type { ProxyNode } from '../model'
import { redactNode } from '../redact'
import { xrayDns } from '../dns'

export interface XrayOptions {
  socksPort: number
  httpPort: number
  redact: boolean
}

export function buildXrayConfig(node: ProxyNode, opts: XrayOptions): Record<string, unknown> {
  const n = opts.redact ? redactNode(node, { uuid: true, pbk: true, sid: true, passwords: true }) : node
  const outbound = vlessOutbound(n)
  return {
    log: { loglevel: 'warning' },
    inbounds: [
      { tag: 'socks-in', listen: '127.0.0.1', port: opts.socksPort, protocol: 'socks', settings: { udp: true } },
      { tag: 'http-in', listen: '127.0.0.1', port: opts.httpPort, protocol: 'http' },
    ],
    outbounds: [outbound, { tag: 'direct', protocol: 'freedom' }, { tag: 'block', protocol: 'blackhole' }],
    dns: xrayDns({ presetId: 'doh-tunnel', servers: [], hosts: {}, unexpectedIPs: ['geoip:private'] }),
    routing: {
      domainStrategy: 'IPIfNonMatch',
      rules: [
        { type: 'field', ip: ['geoip:private'], outboundTag: 'direct' },
        { type: 'field', outboundTag: 'proxy', network: 'tcp,udp' },
      ],
    },
  }
}

function vlessOutbound(node: ProxyNode): Record<string, unknown> {
  const user: Record<string, unknown> = { id: node.uuid || '', encryption: node.encryption || 'none' }
  if (node.flow) user['flow'] = node.flow

  const ss: Record<string, unknown> = { network: node.network, security: node.security }

  if (node.security === 'tls') {
    const tls: Record<string, unknown> = {}
    if (node.sni) tls['serverName'] = node.sni
    if (node.fp) tls['fingerprint'] = node.fp
    if (node.alpn?.length) tls['alpn'] = node.alpn
    if (node.allowInsecure) tls['allowInsecure'] = true
    ss['tlsSettings'] = tls
  } else if (node.security === 'reality') {
    ss['realitySettings'] = {
      serverName: node.sni || '',
      fingerprint: node.fp || 'chrome',
      publicKey: node.pbk || '',
      shortId: node.sid || '',
      spiderX: node.spx || '',
    }
    if (node.pqv) {
      const rs = ss['realitySettings'] as Record<string, unknown>
      rs['mldsa65Verify'] = node.pqv
    }
  }

  if (node.network === 'xhttp') {
    const x: Record<string, unknown> = {}
    if (node.path) x['path'] = node.path
    if (node.host) x['host'] = node.host
    if (node.mode) x['mode'] = node.mode
    if (node.extra) x['extra'] = node.extra
    ss['xhttpSettings'] = x
  } else if (node.network === 'ws') {
    const w: Record<string, unknown> = { path: node.path || '/' }
    if (node.host) w['headers'] = { Host: node.host }
    ss['wsSettings'] = w
  } else if (node.network === 'grpc') {
    ss['grpcSettings'] = { serviceName: node.serviceName || '' }
  } else if (node.network === 'h2') {
    ss['httpSettings'] = { path: node.path || '/', host: node.host || '' }
  } else if (node.network === 'tcp') {
    if (node.headerType === 'http') {
      ss['tcpSettings'] = { header: { type: 'http' } }
    }
  }

  return {
    tag: 'proxy',
    protocol: 'vless',
    settings: { vnext: [{ address: node.server, port: node.port, users: [user] }] },
    streamSettings: ss,
  }
}

export function xrayConfigToJson(config: Record<string, unknown>): string {
  return JSON.stringify(config, null, 2)
}
