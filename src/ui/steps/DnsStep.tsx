/** Шаг 3: DNS — пресеты, редактор серверов, hosts, предупреждения. */

import { useCallback, useMemo } from 'preact/hooks'
import { defaultDnsConfig, type DnsConfig, type DnsServer } from '../../core/model'
import { detectDnsWarnings } from '../../core/dns'
import type { Step } from '../App'

interface DnsStepProps {
  t: (key: string) => string
  dnsConfig: DnsConfig
  setDnsConfig: (v: DnsConfig) => void
  setStep: (v: Step) => void
}

export default function DnsStep(props: DnsStepProps) {
  const { t, dnsConfig, setDnsConfig, setStep } = props

  const warnings = detectDnsWarnings(dnsConfig)

  const addServer = () => {
    const s: DnsServer = {
      id: 's' + Date.now(),
      address: '',
      domains: [],
      skipFallback: false,
      queryStrategy: undefined,
      via: 'tunnel',
      enabled: true,
    }
    setDnsConfig({ ...dnsConfig, servers: [...dnsConfig.servers, s] })
  }

  const removeServer = (id: string) => {
    setDnsConfig({ ...dnsConfig, servers: dnsConfig.servers.filter((s) => s.id !== id) })
  }

  const updateServer = (id: string, patch: Partial<DnsServer>) => {
    setDnsConfig({
      ...dnsConfig,
      servers: dnsConfig.servers.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    })
  }

  const toggleDomains = (id: string, value: string) => {
    const s = dnsConfig.servers.find((x) => x.id === id)
    if (!s) return
    const next = s.domains.includes(value) ? s.domains.filter((d) => d !== value) : [...s.domains, value]
    updateServer(id, { domains: next })
  }

  const presetTitle = (id: string) => (id === 'doh-tunnel' ? t('dnsPresetDohTunnel') : t('dnsPresetUdpDirect'))

  return (
    <section className="section">
      <div className="section-title">{t('dnsTitle')}</div>

      <div className="row" style={{ marginBottom: 14 }}>
        <label style={{ width: '150px', flexShrink: 0 }}>{t('dnsPreset')}</label>
        <select
          value={dnsConfig.presetId}
          onChange={(e) => setDnsConfig({ ...dnsConfig, presetId: (e.target as HTMLSelectElement).value })}
        >
          <option value="doh-tunnel">{t('dnsPresetDohTunnel')}</option>
          <option value="udp-direct">{t('dnsPresetUdpDirect')}</option>
        </select>
        <span className="small"> — {presetTitle(dnsConfig.presetId)}</span>
      </div>

      <div className="row" style={{ marginBottom: 10 }}>
        <button className="secondary" onClick={addServer}>{t('dnsAddServer')}</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: '44px' }}></th>
              <th>{t('dnsServer')}</th>
              <th>{t('dnsDomains')}</th>
              <th>{t('dnsVia')}</th>
              <th style={{ width: '90px' }}>{t('dnsSkipFallback')}</th>
              <th style={{ width: '70px' }}>{t('dnsEnabled')}</th>
              <th style={{ width: '70px' }}></th>
            </tr>
          </thead>
          <tbody>
            {dnsConfig.servers.map((s) => (
              <tr key={s.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    onChange={() => updateServer(s.id, { enabled: !s.enabled })}
                  />
                </td>
                <td>
                  <input
                    value={s.address}
                    onInput={(e) => updateServer(s.id, { address: (e.target as HTMLInputElement).value })}
                    placeholder="9.9.9.9 или https://..."
                  />
                </td>
                <td>
                  {s.domains.map((d) => (
                    <span key={d} className="chip">
                      {d}
                      <button onClick={() => toggleDomains(s.id, d)}>×</button>
                    </span>
                  ))}
                  <input
                    value=""
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const v = (e.target as HTMLInputElement).value
                        if (v) { toggleDomains(s.id, v); (e.target as HTMLInputElement).value = '' }
                      }
                    }}
                    placeholder="домен + Enter"
                    style={{ width: '140px' }}
                  />
                </td>
                <td>
                  <select
                    value={s.via}
                    onChange={(e) => updateServer(s.id, { via: (e.target as HTMLSelectElement).value === 'tunnel' ? 'tunnel' : 'direct' })}
                  >
                    <option value="tunnel">{t('dnsViaTunnel')}</option>
                    <option value="direct">{t('dnsViaDirect')}</option>
                  </select>
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={s.skipFallback}
                    onChange={() => updateServer(s.id, { skipFallback: !s.skipFallback })}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    onChange={() => updateServer(s.id, { enabled: !s.enabled })}
                  />
                </td>
                <td>
                  <button className="secondary" onClick={() => removeServer(s.id)}>
                    {t('dnsRemoveServer')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="section" style={{ marginTop: 16 }}>
        <div className="section-title">{t('dnsHosts')}</div>
        {Object.entries(dnsConfig.hosts).map(([name, ips]) => (
          <div key={name} className="row" style={{ marginBottom: 6 }}>
            <span style={{ width: '150px', flexShrink: 0, fontSize: '12px', color: 'var(--ink-2)' }}>{name}</span>
            <span>{ips.join(' ')}</span>
          </div>
        ))}
        <div className="section-title" style={{ marginTop: 10 }}>{t('dnsUnexpectedIPs')}</div>
        {dnsConfig.unexpectedIPs.map((ip) => (
          <span key={ip} className="chip">{ip}</span>
        ))}
      </section>

      {(warnings.plainUdp.length || warnings.throttled.length) && (
        <div className="alert warn" style={{ marginTop: 14 }}>
          {warnings.plainUdp.length && <div>{t('dnsWarnPlain')} {warnings.plainUdp.join(', ')}</div>}
          {warnings.throttled.length && <div>{t('dnsWarnThrottled')} {warnings.throttled.join(', ')}</div>}
        </div>
      )}

      <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
        <button className="secondary" onClick={() => setStep('routing')}>
          Далее: Маршрутизация →
        </button>
        <button className="secondary" onClick={() => setStep('export')}>
          К Экспорту →
        </button>
      </div>
    </section>
  )
}
