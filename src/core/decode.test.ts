import { describe, expect, it } from 'vitest'
import { decodeSubscription } from './decode'
import { b64encodeUtf8 } from './parse'

const VLESS =
  'vless://00000000-0000-4000-8000-000000000000@example.com:443?encryption=none&security=reality&sni=www.example.org&fp=chrome&pbk=PUBKEY&sid=ab12&spx=%2F&type=tcp&flow=xtls-rprx-vision#Reality'
const HY2 = 'hy2://AUTH@example.com:55431?obfs=salamander&obfs-password=OBFS&sni=example.com&alpn=h3#Hy2'

describe('decodeSubscription', () => {
  it('decodes standard base64 subscription', () => {
    const plain = `${VLESS}\n${HY2}\n`
    const result = decodeSubscription(b64encodeUtf8(plain))
    expect(result.format).toBe('base64')
    expect(result.nodes).toHaveLength(2)
    expect(result.nodes[0].protocol).toBe('vless')
    expect(result.nodes[1].protocol).toBe('hysteria2')
  })

  it('decodes url-safe base64 without padding and with whitespace', () => {
    const plain = `${VLESS}\n${HY2}`
    const b64 = b64encodeUtf8(plain).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
    const spaced = `${b64.slice(0, 20)}\n${b64.slice(20)}`
    const result = decodeSubscription(spaced)
    expect(result.format).toBe('base64')
    expect(result.nodes).toHaveLength(2)
  })

  it('parses plain newline list', () => {
    const result = decodeSubscription(`${VLESS}\n${HY2}`)
    expect(result.format).toBe('links')
    expect(result.nodes).toHaveLength(2)
  })

  it('parses Clash YAML with reality', () => {
    const yaml = `
proxies:
  - name: "YAML Reality"
    type: vless
    server: example.com
    port: 443
    uuid: 00000000-0000-4000-8000-000000000000
    network: tcp
    tls: true
    servername: www.example.org
    client-fingerprint: chrome
    flow: xtls-rprx-vision
    reality-opts:
      public-key: PUBKEY
      short-id: ab12
    udp: true
`
    const result = decodeSubscription(yaml)
    expect(result.format).toBe('clash')
    expect(result.nodes).toHaveLength(1)
    const n = result.nodes[0]
    expect(n.name).toBe('YAML Reality')
    expect(n.security).toBe('reality')
    expect(n.pbk).toBe('PUBKEY')
    expect(n.sid).toBe('ab12')
    expect(n.flow).toBe('xtls-rprx-vision')
  })

  it('parses Xray/Happ JSON array with remarks', () => {
    const cfg = [
      {
        remarks: 'Xray Reality',
        outbounds: [
          {
            tag: 'proxy',
            protocol: 'vless',
            settings: {
              vnext: [
                {
                  address: 'example.com',
                  port: 443,
                  users: [{ id: '00000000-0000-4000-8000-000000000000', encryption: 'none', flow: 'xtls-rprx-vision' }],
                },
              ],
            },
            streamSettings: {
              network: 'tcp',
              security: 'reality',
              realitySettings: {
                serverName: 'www.example.org',
                fingerprint: 'chrome',
                publicKey: 'PUBKEY',
                shortId: 'ab12',
                spiderX: '/',
              },
            },
          },
          { tag: 'direct', protocol: 'freedom' },
          { tag: 'block', protocol: 'blackhole' },
        ],
      },
    ]
    const result = decodeSubscription(JSON.stringify(cfg))
    expect(result.format).toBe('xray')
    expect(result.nodes).toHaveLength(1)
    const n = result.nodes[0]
    expect(n.name).toBe('Xray Reality')
    expect(n.protocol).toBe('vless')
    expect(n.security).toBe('reality')
    expect(n.pbk).toBe('PUBKEY')
    expect(n.sid).toBe('ab12')
    expect(n.spx).toBe('/')
    expect(n.flow).toBe('xtls-rprx-vision')
  })

  it('parses Xray xhttp config', () => {
    const cfg = {
      remarks: 'Xhttp',
      outbounds: [
        {
          protocol: 'vless',
          settings: {
            vnext: [
              {
                address: 'example.com',
                port: 443,
                users: [{ id: '00000000-0000-4000-8000-000000000000', encryption: 'none' }],
              },
            ],
          },
          streamSettings: {
            network: 'xhttp',
            security: 'tls',
            tlsSettings: { serverName: 'cdn.example.org', fingerprint: 'firefox', alpn: ['h2'] },
            xhttpSettings: {
              path: '/xh',
              host: 'cdn.example.org',
              mode: 'stream-one',
              extra: { xmux: { maxConnections: 3, hMaxReusableSecs: '1140-1260' } },
            },
          },
        },
      ],
    }
    const result = decodeSubscription(JSON.stringify(cfg))
    const n = result.nodes[0]
    expect(n.network).toBe('xhttp')
    expect(n.mode).toBe('stream-one')
    expect(n.extra).toEqual({ xmux: { maxConnections: 3, hMaxReusableSecs: '1140-1260' } })
  })

  it('parses sing-box JSON outbounds', () => {
    const cfg = {
      outbounds: [
        {
          type: 'vless',
          tag: 'SB',
          server: 'example.com',
          server_port: 443,
          uuid: '00000000-0000-4000-8000-000000000000',
          flow: 'xtls-rprx-vision',
          tls: {
            enabled: true,
            server_name: 'www.example.org',
            utls: { enabled: true, fingerprint: 'chrome' },
            reality: { enabled: true, public_key: 'PUBKEY', short_id: 'ab12' },
          },
          transport: { type: 'ws', path: '/ws', headers: { Host: 'cdn.example.org' } },
        },
        { type: 'direct', tag: 'direct' },
      ],
    }
    const result = decodeSubscription(JSON.stringify(cfg))
    expect(result.format).toBe('singbox')
    expect(result.nodes).toHaveLength(1)
    const n = result.nodes[0]
    expect(n.name).toBe('SB')
    expect(n.security).toBe('reality')
    expect(n.pbk).toBe('PUBKEY')
    expect(n.network).toBe('ws')
    expect(n.path).toBe('/ws')
    expect(n.host).toBe('cdn.example.org')
  })

  it('detects encrypted Happ link', () => {
    const result = decodeSubscription('happ://crypto/W0ludGVyZmFjZV0K')
    expect(result.format).toBe('happ-encrypted')
    expect(result.nodes).toHaveLength(0)
    expect(result.encrypted).toHaveLength(1)
    expect(result.warnings.join(' ')).toMatch(/зашифрован/i)
  })

  it('reports unknown format', () => {
    const result = decodeSubscription('просто текст без ссылок')
    expect(result.format).toBe('unknown')
  })
})
