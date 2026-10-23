import { describe, expect, it } from 'vitest'
import { buildRoutingRules, normalizeListLine } from './routing'
import type { DomainList, ZapretState, RoutingConfig } from './model'

const zapretOn: ZapretState = {
  mode: 'on',
  lists: [
    { id: 'general', title: 'list-general', lines: ['example.com', '^example.com', 'cloudflare.net'], enabled: true },
    { id: 'google', title: 'list-google', lines: ['google.ru'], enabled: true },
    { id: 'exclude', title: 'list-exclude', lines: ['exclude.ru'], enabled: true },
    { id: 'ipset-exclude', title: 'ipset-exclude', lines: ['10.0.0.0/8', '192.168.0.0/16'], enabled: true },
    { id: 'ipset-all', title: 'ipset-all', lines: ['203.0.113.113/32'], enabled: false },
    { id: 'user', title: 'user', lines: ['user.ru'], enabled: true },
  ],
  discordVoice: true,
  discordVoiceRanges: ['19294-19344', '50000-50100'],
  warnCloudfront: true,
}

const zapretOff: ZapretState = { ...zapretOn, mode: 'off' }

const presetVpnFirst: RoutingConfig = {
  preset: 'vpn-first',
  blockAds: true,
  blockBitTorrent: true,
  telegramViaVpn: true,
  ruDirect: true,
  allowDomains: [],
  blockMalware: true,
  blockQuic: false,
}

describe('routing rules', () => {
  it('zapret ON: lists → direct', () => {
    const rules = buildRoutingRules(presetVpnFirst, zapretOn)
    const direct = rules.filter((r) => r.target === 'direct').map((r) => r.value)
    expect(direct).toContain('+.example.com')
    expect(direct).toContain('example.com')
    expect(direct).toContain('10.0.0.0/8')
    expect(direct).toContain('geoip:private')
  })

  it('zapret ON: telegram ports → vpn (Discord voice via policy)', () => {
    const rules = buildRoutingRules(presetVpnFirst, zapretOn)
    const vpn = rules.filter((r) => r.target === 'vpn').map((r) => r.value)
    expect(vpn).toContain('5228-5230')
    // Discord voice follows Zapret policy: ON → DIRECT
    const direct = rules.filter((r) => r.target === 'direct').map((r) => r.value)
    expect(direct).toContain('19294-19344')
    expect(direct).toContain('50000-50100')
  })

  it('zapret OFF: exclude lists → vpn fallback, not direct', () => {
    const rules = buildRoutingRules(presetVpnFirst, zapretOff)
    const direct = rules.filter((r) => r.target === 'direct').map((r) => r.value)
    // exclude.ru should not appear in direct
    expect(direct).not.toContain('+.exclude.ru')
  })

  it('normalizeListLine exact and subdomain', () => {
    expect(normalizeListLine('^example.com')).toEqual({
      type: 'domain', value: 'example.com', target: 'direct', comment: 'exact',
    })
    expect(normalizeListLine('example.com')).toEqual({
      type: 'domain', value: '+.example.com', target: 'direct', comment: 'domain + subdomains',
    })
    expect(normalizeListLine('# comment')).toBeNull()
  })

  it('vpn-first: ru direct + category banks/gov', () => {
    const rules = buildRoutingRules(presetVpnFirst, zapretOff)
    const direct = rules.filter((r) => r.target === 'direct').map((r) => r.value)
    expect(direct).toContain('geosite:category-ru')
    expect(direct).toContain('geosite:category-bank-ru')
    expect(direct).toContain('geosite:category-gov-ru')
    expect(direct).toContain('geoip:ru')
  })
})
