import { describe, expect, it } from 'vitest'
import { b64encodeUtf8, parseLink, parseLinks } from './parse'
import { nodeToLink } from './serialize/links'
import type { ProxyNode } from './model'

const FIXTURES = {
  reality:
    'vless://00000000-0000-4000-8000-000000000000@example.com:443?encryption=none&security=reality&sni=www.example.org&fp=chrome&pbk=PUBKEY&sid=ab12&spx=%2F&type=tcp&flow=xtls-rprx-vision#Reality',
  xhttp:
    'vless://00000000-0000-4000-8000-000000000000@example.com:443?encryption=none&security=tls&sni=cdn.example.org&fp=firefox&alpn=h2&type=xhttp&path=%2Fxh&mode=stream-one&extra=%7B%22xmux%22%3A%7B%22maxConnections%22%3A3%2C%22hMaxReusableSecs%22%3A%221140-1260%22%7D%7D#Xhttp',
  enc:
    'vless://00000000-0000-4000-8000-000000000000@example.com:443?encryption=mlkem768x25519plus.native.0rtt.KEY&security=reality&sni=www.example.org&fp=chrome&pbk=PUBKEY&sid=ab12&type=tcp#Enc',
  hy2: 'hy2://AUTH@example.com:55431?obfs=salamander&obfs-password=OBFS&sni=example.com&alpn=h3#Hy2',
}

function expectRoundTrip(node: ProxyNode) {
  const link = nodeToLink(node)
  const again = parseLink(link)
  // ключевые поля не должны теряться
  expect(again.protocol).toBe(node.protocol)
  expect(again.server).toBe(node.server)
  expect(again.port).toBe(node.port)
  expect(again.name).toBe(node.name)
  expect(again.security).toBe(node.security)
  expect(again.network).toBe(node.network)
  expect(again.uuid).toBe(node.uuid)
  expect(again.password).toBe(node.password)
  expect(again.sni).toBe(node.sni)
  expect(again.fp).toBe(node.fp)
  expect(again.alpn).toEqual(node.alpn)
  expect(again.pbk).toBe(node.pbk)
  expect(again.sid).toBe(node.sid)
  expect(again.spx).toBe(node.spx)
  expect(again.pqv).toBe(node.pqv)
  expect(again.flow).toBe(node.flow)
  expect(again.encryption).toBe(node.encryption)
  expect(again.path).toBe(node.path)
  expect(again.host).toBe(node.host)
  expect(again.mode).toBe(node.mode)
  expect(again.extra).toEqual(node.extra)
  expect(again.obfs).toBe(node.obfs)
  expect(again.obfsPassword).toBe(node.obfsPassword)
  expect(again.unmapped).toEqual(node.unmapped)
  // стабильность повторной сериализации
  expect(nodeToLink(again)).toBe(link)
}

describe('vless reality fixture', () => {
  it('parses all parameters', () => {
    const n = parseLink(FIXTURES.reality)
    expect(n.protocol).toBe('vless')
    expect(n.name).toBe('Reality')
    expect(n.server).toBe('example.com')
    expect(n.port).toBe(443)
    expect(n.uuid).toBe('00000000-0000-4000-8000-000000000000')
    expect(n.security).toBe('reality')
    expect(n.network).toBe('tcp')
    expect(n.sni).toBe('www.example.org')
    expect(n.fp).toBe('chrome')
    expect(n.pbk).toBe('PUBKEY')
    expect(n.sid).toBe('ab12')
    expect(n.spx).toBe('/')
    expect(n.flow).toBe('xtls-rprx-vision')
    expect(n.encryption).toBe('none')
    expect(n.unmapped).toBeUndefined()
  })

  it('round-trips link → model → link', () => {
    expectRoundTrip(parseLink(FIXTURES.reality))
  })
})

describe('vless xhttp fixture', () => {
  it('parses xhttp + extra.xmux', () => {
    const n = parseLink(FIXTURES.xhttp)
    expect(n.network).toBe('xhttp')
    expect(n.mode).toBe('stream-one')
    expect(n.path).toBe('/xh')
    expect(n.alpn).toEqual(['h2'])
    expect(n.extra).toEqual({ xmux: { maxConnections: 3, hMaxReusableSecs: '1140-1260' } })
  })

  it('round-trips link → model → link', () => {
    expectRoundTrip(parseLink(FIXTURES.xhttp))
  })
})

describe('vless mlkem encryption fixture', () => {
  it('keeps encryption value intact', () => {
    const n = parseLink(FIXTURES.enc)
    expect(n.encryption).toBe('mlkem768x25519plus.native.0rtt.KEY')
    expect(n.security).toBe('reality')
  })

  it('round-trips link → model → link', () => {
    expectRoundTrip(parseLink(FIXTURES.enc))
  })
})

describe('hysteria2 fixture', () => {
  it('parses auth, obfs, alpn', () => {
    const n = parseLink(FIXTURES.hy2)
    expect(n.protocol).toBe('hysteria2')
    expect(n.name).toBe('Hy2')
    expect(n.server).toBe('example.com')
    expect(n.port).toBe(55431)
    expect(n.auth).toBe('AUTH')
    expect(n.password).toBe('AUTH')
    expect(n.obfs).toBe('salamander')
    expect(n.obfsPassword).toBe('OBFS')
    expect(n.alpn).toEqual(['h3'])
  })

  it('round-trips link → model → link', () => {
    expectRoundTrip(parseLink(FIXTURES.hy2))
  })
})

describe('parameter preservation', () => {
  it('keeps unknown vless params in unmapped and outputs them back', () => {
    const link =
      'vless://00000000-0000-4000-8000-000000000000@example.com:443?encryption=none&security=tls&type=ws&path=%2Fws&foo=bar#Ws'
    const n = parseLink(link)
    expect(n.unmapped).toEqual({ foo: 'bar' })
    expect(n.warnings?.join(' ')).toContain('foo')
    expect(nodeToLink(n)).toContain('foo=bar')
  })

  it('parses vmess base64 JSON', () => {
    const json = {
      v: '2',
      ps: 'VM',
      add: 'example.com',
      port: '8443',
      id: '00000000-0000-4000-8000-000000000000',
      aid: '0',
      scy: 'auto',
      net: 'ws',
      type: 'none',
      host: 'cdn.example.org',
      path: '/ws',
      tls: 'tls',
      sni: 'cdn.example.org',
      alpn: 'h2,http/1.1',
      fp: 'chrome',
      unknownField: 'keep-me',
    }
    const link = `vmess://${b64encodeUtf8(JSON.stringify(json))}`
    const n = parseLink(link)
    expect(n.protocol).toBe('vmess')
    expect(n.name).toBe('VM')
    expect(n.network).toBe('ws')
    expect(n.security).toBe('tls')
    expect(n.alpn).toEqual(['h2', 'http/1.1'])
    expect(n.unmapped).toEqual({ unknownField: 'keep-me' })
    expectRoundTrip(n)
  })

  it('parses trojan with ws', () => {
    const link =
      'trojan://PASSWORD@example.com:443?security=tls&type=ws&path=%2Ft&host=t.example.org&sni=t.example.org#T'
    const n = parseLink(link)
    expect(n.protocol).toBe('trojan')
    expect(n.password).toBe('PASSWORD')
    expect(n.network).toBe('ws')
    expect(n.path).toBe('/t')
    expect(n.host).toBe('t.example.org')
    expectRoundTrip(n)
  })

  it('parses ss SIP002', () => {
    const link = 'ss://YWVzLTI1Ni1nY206cGFzcw==@example.com:8388#SS'
    const n = parseLink(link)
    expect(n.protocol).toBe('ss')
    expect(n.method).toBe('aes-256-gcm')
    expect(n.password).toBe('pass')
    expect(n.port).toBe(8388)
    expect(nodeToLink(n)).toContain('ss://')
    expectRoundTrip(n)
  })

  it('parses ss legacy', () => {
    const b64 = b64encodeUtf8('chacha20-ietf-poly1305:pw@example.com:8388')
    const n = parseLink(`ss://${b64}#Legacy`)
    expect(n.method).toBe('chacha20-ietf-poly1305')
    expect(n.password).toBe('pw')
    expect(n.server).toBe('example.com')
  })

  it('parses tuic', () => {
    const link =
      'tuic://00000000-0000-4000-8000-000000000000:PW@example.com:443?congestion_control=bbr&udp_relay_mode=native&alpn=h3&sni=example.com#TUIC'
    const n = parseLink(link)
    expect(n.protocol).toBe('tuic')
    expect(n.uuid).toBe('00000000-0000-4000-8000-000000000000')
    expect(n.password).toBe('PW')
    expect(n.extra).toEqual({ congestion_control: 'bbr', udp_relay_mode: 'native' })
    expectRoundTrip(n)
  })

  it('detects encrypted happ links', () => {
    const result = parseLinks('happ://crypto/W0ludGVyZmFjZV0K\nvless://x@example.com:443#x')
    expect(result.encrypted).toHaveLength(1)
    expect(result.encrypted[0].line).toBe(1)
    // вторая ссылка без uuid всё равно распарсится (uuid = 'x')
    expect(result.nodes).toHaveLength(1)
  })

  it('reports broken links without crashing', () => {
    const result = parseLinks('vless://@:0\nnot a link\nvless://00000000-0000-4000-8000-000000000000@example.com:443#ok')
    expect(result.issues.length).toBeGreaterThanOrEqual(1)
    expect(result.nodes).toHaveLength(1)
  })
})
