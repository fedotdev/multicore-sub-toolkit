/** Шаг 4: Маршрутизация и Zapret — режим, списки, preset-правила. */

import { useCallback, useMemo } from 'preact/hooks'
import { buildRoutingRules } from '../../core/routing'
import { defaultRouting, type RoutingConfig, type ZapretState } from '../../core/model'
import type { Step } from '../App'

interface RoutingStepProps {
  t: (key: string) => string
  routingConfig: RoutingConfig
  setRoutingConfig: (v: RoutingConfig) => void
  zapretState: ZapretState
  setZapretState: (v: ZapretState) => void
  setStep: (v: Step) => void
}

export default function RoutingStep(props: RoutingStepProps) {
  const { t, routingConfig, setRoutingConfig, zapretState, setZapretState, setStep } = props

  const setField = useCallback((patch: Partial<RoutingConfig>) => setRoutingConfig({ ...routingConfig, ...patch }), [
    routingConfig,
    setRoutingConfig,
  ])

  const toggleList = (id: string) => {
    setZapretState({
      ...zapretState,
      lists: zapretState.lists.map((l) => (l.id === id ? { ...l, enabled: !l.enabled } : l)),
    })
  }

  const rules = useMemo(() => buildRoutingRules(routingConfig, zapretState), [routingConfig, zapretState])

  return (
    <section className="section">
      <div className="section-title">{t('routingTitle')}</div>

      <div className="row" style={{ marginBottom: 12 }}>
        <label style={{ width: '150px', flexShrink: 0 }}>{t('routingZapretMode')}</label>
        <button
          className={zapretState.mode === 'on' ? 'primary' : 'secondary'}
          onClick={() => setZapretState({ ...zapretState, mode: 'on' })}
        >
          {t('routingZapretOn')}
        </button>
        <button
          className={zapretState.mode === 'off' ? 'primary' : 'secondary'}
          onClick={() => setZapretState({ ...zapretState, mode: 'off' })}
        >
          {t('routingZapretOff')}
        </button>
      </div>

      <section className="section" style={{ marginBottom: 14 }}>
        <div className="section-title">{t('routingLists')}</div>
        {zapretState.lists.map((l) => (
          <label key={l.id} className="checkbox" style={{ display: 'block', marginBottom: 6 }}>
            <input type="checkbox" checked={l.enabled} onChange={() => toggleList(l.id)} />
            {l.title}
            {l.lines.length ? <span className="small" style={{ marginLeft: 8 }}>({l.lines.length} строк)</span> : ''}
            {l.id === 'ipset-all' && <span className="tag warn" style={{ marginLeft: 8 }}>плейсхолдеры игнорируются</span>}
          </label>
        ))}
        <label className="checkbox" style={{ marginTop: 8 }}>
          <input
            type="checkbox"
            checked={zapretState.discordVoice}
            onChange={() => setZapretState({ ...zapretState, discordVoice: !zapretState.discordVoice })}
          />
          {t('routingDiscordVoice')}
        </label>
      </section>

      <section className="section" style={{ marginBottom: 14 }}>
        <div className="section-title">{t('routingPreset')}</div>
        <label className="checkbox" style={{ display: 'block', marginBottom: 6 }}>
          <input
            type="checkbox"
            checked={routingConfig.preset === 'vpn-first'}
            onChange={() => setField({ preset: 'vpn-first' })}
          />
          {t('routingPresetVpnFirst')}
        </label>
        <label className="checkbox" style={{ display: 'block', marginBottom: 6 }}>
          <input
            type="checkbox"
            checked={routingConfig.preset === 'direct-first'}
            onChange={() => setField({ preset: 'direct-first' })}
          />
          {t('routingPresetDirectFirst')}
        </label>
        {routingConfig.preset === 'vpn-first' && (
          <div style={{ marginTop: 8 }}>
            <label className="checkbox" style={{ display: 'block', marginBottom: 6 }}>
              <input
                type="checkbox"
                checked={routingConfig.ruDirect}
                onChange={() => setField({ ruDirect: !routingConfig.ruDirect })}
              />
              {t('routingRuDirect')}
            </label>
            <label className="checkbox" style={{ display: 'block', marginBottom: 6 }}>
              <input
                type="checkbox"
                checked={routingConfig.blockAds}
                onChange={() => setField({ blockAds: !routingConfig.blockAds })}
              />
              {t('routingBlockAds')}
            </label>
            <label className="checkbox" style={{ display: 'block', marginBottom: 6 }}>
              <input
                type="checkbox"
                checked={routingConfig.blockBitTorrent}
                onChange={() => setField({ blockBitTorrent: !routingConfig.blockBitTorrent })}
              />
              {t('routingBlockBittorrent')}
            </label>
            <label className="checkbox" style={{ display: 'block', marginBottom: 6 }}>
              <input
                type="checkbox"
                checked={routingConfig.telegramViaVpn}
                onChange={() => setField({ telegramViaVpn: !routingConfig.telegramViaVpn })}
              />
              {t('routingTelegramVpn')}
            </label>
          </div>
        )}
        {routingConfig.preset === 'direct-first' && (
          <div style={{ marginTop: 8 }}>
            <label>{t('routingAllowDomains')}</label>
            <textarea
              value={routingConfig.allowDomains.join('\n')}
              rows={4}
              onInput={(e) =>
                setField({
                  allowDomains: (e.target as HTMLTextAreaElement).value.split('\n').filter(Boolean),
                })
              }
              style={{ width: '100%', marginTop: 6 }}
            />
          </div>
        )}
      </section>

      <div className="alert warn" style={{ marginBottom: 12 }}>
        <span className="dot">⚠</span> {t('routingWarnCloudfront')}
      </div>
      <div className="alert warn" style={{ marginBottom: 12 }}>
        <span className="dot">ℹ</span> {t('routingWarnMihomoReality')}
      </div>

      <section className="section" style={{ marginBottom: 12 }}>
        <div className="section-title">{t('routingDiff')} ({rules.length} правил)</div>
        <div className="code" style={{ fontSize: '11px', maxHeight: '220px', overflow: 'auto' }}>
          {rules.map((r) => r.value + ' → ' + r.target + (r.comment ? '  # ' + r.comment : '')).join('\n')}
        </div>
      </section>

      <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
        <button className="secondary" onClick={() => setStep('dns')}>
          ← Назад к DNS
        </button>
        <button className="secondary" onClick={() => setStep('export')}>
          К Экспорту →
        </button>
      </div>
    </section>
  )
}
