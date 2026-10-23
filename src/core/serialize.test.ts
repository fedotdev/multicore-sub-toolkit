import { describe, expect, it } from 'vitest'
import yaml from 'js-yaml'
import { parseLink } from './parse'
import { buildHappJson } from './serialize/happ'
import { buildMihomoConfig } from './serialize/mihomo'
import { buildV2rayngNodeConfig, buildV2rayngAllInOne } from './serialize/v2rayng'
import { buildXrayConfig } from './serialize/xray'

const VLESS =
  'vless://00000000-0000-4000-8000-000000000000@example.com:443?encryption=none&security=reality&sni=www.example.org&fp=chrome&pbk=PUBKEY&sid=ab12&spx=%2F&type=tcp&flow=xtls-rprx-vision#Reality'
const HY2 = 'hy2://AUTH@example.com:55431?obfs=salamander&obfs-password=OBFS&sni=example.com&alpn=h3#Hy2'

const nodes = [parseLink(VLESS), parseLink(HY2)]

describe('serialize targets', () => {
  it('builds per-node Xray config (valid JSON)', () => {
    const cfg = buildXrayConfig(nodes[0], { socksPort: 10808, httpPort: 10809, redact: false })
    const json = JSON.stringify(cfg)
    const parsed = JSON.parse(json)
    expect(parsed.outbounds[0].tag).toBe('proxy')
    expect(parsed.inbounds[0].port).toBe(10808)
    expect(parsed.inbounds[1].port).toBe(10809)
  })

  it('builds Happ JSON array (valid JSON)', () => {
    const arr = buildHappJson(nodes, { socksPort: 10808, httpPort: 10809, redact: false })
    expect(arr).toHaveLength(2)
    const json = JSON.stringify(arr)
    const parsed = JSON.parse(json)
    expect(parsed[0].remarks).toBe('Reality')
    expect(parsed[1].remarks).toBe('Hy2')
    expect(parsed[0].outbounds[0].settings.vnext[0].users[0].id).toBe('00000000-0000-4000-8000-000000000000')
    expect(parsed[0].outbounds[0].streamSettings.realitySettings.publicKey).toBe('PUBKEY')
  })

  it('builds Mihomo YAML (loadable, refs resolve)', () => {
    const cfg = buildMihomoConfig(nodes, { redact: false, supportMlkem: true, zapretGroup: true }, {
      mode: 'on',
      lists: [],
    })
    const yamlStr = yaml.dump(cfg)
    const loaded = yaml.load(yamlStr) as Record<string, unknown>
    expect(Array.isArray(loaded.proxies)).toBe(true)
    expect(loaded.proxies).toHaveLength(2)
    const groups = loaded['proxy-groups'] as Record<string, unknown>[]
    const groupNames = groups.map((g) => g.name)
    expect(groupNames).toContain('🌍 VPN')
    expect(groupNames).toContain('🧩 Zapret')
    // All group proxies reference real proxies or DIRECT/REJECT
    const proxyNames = new Set([...(loaded.proxies as unknown[]).map((p) => String((p as Record<string, unknown>).name)), ...groupNames])
    for (const g of groups) {
      for (const ref of (g.proxies as unknown[]) || []) {
        const r = String(ref)
        expect(proxyNames.has(r) || ['DIRECT', 'REJECT'].includes(r)).toBe(true)
      }
    }
    expect(loaded.dns).toBeDefined()
  })

  it('builds v2rayNG node config (valid JSON)', () => {
    const cfg = buildV2rayngNodeConfig(nodes[0])
    const json = JSON.stringify(cfg)
    const parsed = JSON.parse(json)
    expect(parsed.inbounds[0].port).toBe(10808)
    expect(parsed.outbounds[0].tag).toBe('proxy')
  })

  it('builds v2rayNG all-in-one (valid JSON, balancers resolve)', () => {
    const cfg = buildV2rayngAllInOne(nodes, { balancers: true, pinSelector: false, redact: false })
    const json = JSON.stringify(cfg)
    const parsed = JSON.parse(json)
    const outTags = new Set((parsed.outbounds as unknown[]).map((o) => (o as Record<string, unknown>).tag))
    const balancers = (parsed.routing as any).balancers || []
    for (const b of balancers) {
      for (const s of b.selector) {
        expect(outTags.has(s) || s === '🌍 VPN', `balancer selector ${s} missing`).toBe(true)
      }
    }
  })

  it('redact masks uuid/pbk/sid', () => {
    const cfg = buildXrayConfig(nodes[0], { socksPort: 10808, httpPort: 10809, redact: true })
    const json = JSON.stringify(cfg)
    expect(json).not.toContain('00000000-0000-4000-8000-000000000000')
    expect(json).not.toContain('PUBKEY')
    expect(json).not.toContain('ab12')
    // but non-redacted keeps them
    const cfg2 = buildXrayConfig(nodes[0], { socksPort: 10808, httpPort: 10809, redact: false })
    expect(JSON.stringify(cfg2)).toContain('00000000-0000-4000-8000-000000000000')
  })
})
