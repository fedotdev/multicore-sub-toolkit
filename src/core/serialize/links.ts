import type { ProxyNode } from '../model'
import { b64encodeUtf8, b64urlEncode } from '../parse'

function appendParams(params: URLSearchParams, entries: Array<[string, unknown]>) {
  for (const [key, value] of entries) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(','))
    } else if (typeof value === 'boolean') {
      params.set(key, value ? '1' : '0')
    } else {
      params.set(key, String(value))
    }
  }
}

function appendUnmapped(params: URLSearchParams, node: ProxyNode) {
  if (!node.unmapped) return
  for (const [key, value] of Object.entries(node.unmapped)) {
    if (!params.has(key)) params.set(key, value)
  }
}

function fragment(name: string): string {
  return `#${encodeURIComponent(name)}`
}

function hostPort(node: ProxyNode): string {
  const host = node.server.includes(':') && !node.server.startsWith('[') ? `[${node.server}]` : node.server
  return `${host}:${node.port}`
}

function userinfo(value: string): string {
  return encodeURIComponent(value)
}

export function nodeToLink(node: ProxyNode): string {
  switch (node.protocol) {
    case 'vless': {
      const params = new URLSearchParams()
      appendParams(params, [
        ['encryption', node.encryption || 'none'],
        ['security', node.security],
        ['type', node.network === 'quic' ? 'tcp' : node.network],
        ['sni', node.sni],
        ['fp', node.fp],
        ['alpn', node.alpn],
        ['pbk', node.pbk],
        ['sid', node.sid],
        ['spx', node.spx],
        ['pqv', node.pqv],
        ['flow', node.flow],
        ['headerType', node.headerType],
        ['path', node.path],
        ['host', node.host],
        ['mode', node.network === 'xhttp' ? node.mode : undefined],
        ['extra', node.extra && node.network === 'xhttp' ? JSON.stringify(node.extra) : undefined],
        ['serviceName', node.serviceName],
        ['allowInsecure', node.allowInsecure],
      ])
      appendUnmapped(params, node)
      return `vless://${userinfo(node.uuid || '')}@${hostPort(node)}?${params.toString()}${fragment(node.name)}`
    }
    case 'vmess': {
      const json: Record<string, unknown> = {
        v: '2',
        ps: node.name,
        add: node.server,
        port: String(node.port),
        id: node.uuid || '',
        aid: String(node.alterId ?? 0),
        scy: node.cipher || 'auto',
        net: node.network === 'quic' ? 'tcp' : node.network,
        type: node.headerType || 'none',
        host: node.host || '',
        path: node.path || '',
        tls: node.security === 'tls' ? 'tls' : '',
        sni: node.sni || '',
        alpn: node.alpn ? node.alpn.join(',') : '',
        fp: node.fp || '',
      }
      if (node.unmapped) {
        for (const [k, v] of Object.entries(node.unmapped)) {
          if (!(k in json)) json[k] = v
        }
      }
      return `vmess://${b64encodeUtf8(JSON.stringify(json))}`
    }
    case 'trojan': {
      const params = new URLSearchParams()
      appendParams(params, [
        ['security', node.security],
        ['type', node.network === 'quic' ? 'tcp' : node.network],
        ['sni', node.sni],
        ['fp', node.fp],
        ['alpn', node.alpn],
        ['path', node.path],
        ['host', node.host],
        ['headerType', node.headerType],
        ['serviceName', node.serviceName],
        ['allowInsecure', node.allowInsecure],
      ])
      appendUnmapped(params, node)
      return `trojan://${userinfo(node.password || '')}@${hostPort(node)}?${params.toString()}${fragment(node.name)}`
    }
    case 'ss': {
      const params = new URLSearchParams()
      if (node.plugin) {
        let plugin = node.plugin
        if (node.pluginOpts) {
          for (const [k, v] of Object.entries(node.pluginOpts)) plugin += v ? `;${k}=${v}` : `;${k}`
        }
        params.set('plugin', plugin)
      }
      appendUnmapped(params, node)
      const credentials = b64urlEncode(`${node.method || 'aes-128-gcm'}:${node.password || ''}`)
      const query = params.toString()
      return `ss://${credentials}@${hostPort(node)}${query ? `?${query}` : ''}${fragment(node.name)}`
    }
    case 'hysteria2': {
      const params = new URLSearchParams()
      appendParams(params, [
        ['obfs', node.obfs],
        ['obfs-password', node.obfsPassword],
        ['sni', node.sni],
        ['alpn', node.alpn],
        ['fp', node.fp],
        ['insecure', node.allowInsecure],
        ['ports', node.ports],
        ['hop', node.hop],
      ])
      appendUnmapped(params, node)
      const query = params.toString()
      return `hysteria2://${userinfo(node.auth || node.password || '')}@${hostPort(node)}${query ? `?${query}` : ''}${fragment(node.name)}`
    }
    case 'tuic': {
      const params = new URLSearchParams()
      appendParams(params, [
        ['sni', node.sni],
        ['alpn', node.alpn],
        ['insecure', node.allowInsecure],
      ])
      if (node.extra) {
        for (const key of ['congestion_control', 'udp_relay_mode']) {
          const value = node.extra[key]
          if (value !== undefined) params.set(key, String(value))
        }
      }
      appendUnmapped(params, node)
      const query = params.toString()
      const creds = `${userinfo(node.uuid || '')}:${userinfo(node.password || '')}`
      return `tuic://${creds}@${hostPort(node)}${query ? `?${query}` : ''}${fragment(node.name)}`
    }
    default:
      throw new Error(`unsupported protocol: ${(node as ProxyNode).protocol}`)
  }
}

export function nodesToLinks(nodes: ProxyNode[]): string {
  return nodes.map(nodeToLink).join('\n') + (nodes.length ? '\n' : '')
}
