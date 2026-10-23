/** Шаг 5: Экспорт — цель, опции, валидация, копирование/скачивание. */

import { useCallback } from 'preact/hooks'
import { h } from 'preact'
import type { ExportOptions } from '../../core/model'

interface ExportStepProps {
  t: (key: string) => string
  selectedNodes: any[]
  exportTarget: 'happ' | 'mihomo' | 'v2rayng'
  setExportTarget: (v: 'happ' | 'mihomo' | 'v2rayng') => void
  exportOptions: ExportOptions
  setExportOptions: (v: ExportOptions) => void
  redact: boolean
  setRedact: (v: boolean) => void
  zapretState: { mode: 'on' | 'off'; lists: any[] }
  generateExport: () => void
  exportOutput: string
  exportValid: { ok: boolean; msg: string }
  setExportOutput: (v: string) => void
  setExportValid: (v: { ok: boolean; msg: string }) => void
}

export default function ExportStep(props: ExportStepProps) {
  const {
    t, selectedNodes, exportTarget, setExportTarget, exportOptions, setExportOptions,
    redact, setRedact, zapretState, generateExport, exportOutput, exportValid,
    setExportOutput, setExportValid,
  } = props

  const copy = useCallback(() => {
    navigator.clipboard.writeText(exportOutput).then(() => alert(t('copyOk')))
  }, [exportOutput, t])

  const download = useCallback(() => {
    const ext = exportTarget === 'mihomo' ? 'yaml' : 'json'
    const mime = exportTarget === 'mihomo' ? 'text/yaml' : 'application/json'
    const blob = new Blob([exportOutput], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'config.' + ext
    a.click()
    URL.revokeObjectURL(url)
  }, [exportOutput, exportTarget, t])

  const targetLabel = (v: 'happ' | 'mihomo' | 'v2rayng') =>
    v === 'happ' ? t('exportTargetHapp') : v === 'mihomo' ? t('exportTargetMihomo') : t('exportTargetV2rayng')

  return h('section', { className: 'section' },
    h('div', { className: 'section-title' }, t('exportTitle')),

    h('div', { className: 'row', style: { marginBottom: 12 } },
      h('label', { style: { width: '150px', flexShrink: 0 } }, t('exportTarget')),
      h('select',
        { value: exportTarget, onChange: (e: Event) => setExportTarget((e.target as HTMLSelectElement).value as 'happ' | 'mihomo' | 'v2rayng') },
        h('option', { value: 'happ' }, t('exportTargetHapp')),
        h('option', { value: 'mihomo' }, t('exportTargetMihomo')),
        h('option', { value: 'v2rayng' }, t('exportTargetV2rayng')),
      ),
    ),

    h('div', { className: 'row', style: { marginBottom: 10 } },
      h('label', { className: 'checkbox', style: { marginRight: 16 } },
        h('input', { type: 'checkbox', checked: redact, onChange: () => setRedact(!redact) }),
        t('exportRedact'),
      ),
      h('span', { className: 'small' }, t('exportRedactHint')),
    ),

    exportTarget === 'mihomo' && h('div', { className: 'row', style: { marginBottom: 8 } },
      h('label', { className: 'checkbox', style: { marginRight: 16 } },
        h('input', { type: 'checkbox', checked: exportOptions.supportMlkem, onChange: () => setExportOptions({ ...exportOptions, supportMlkem: !exportOptions.supportMlkem }) }),
        t('exportMlkem'),
      ),
      h('label', { className: 'checkbox', style: { marginRight: 16 } },
        h('input', { type: 'checkbox', checked: exportOptions.zapretGroup, onChange: () => setExportOptions({ ...exportOptions, zapretGroup: !exportOptions.zapretGroup }) }),
        t('exportZapretGroup'),
      ),
    ),

    exportTarget === 'v2rayng' && h('div', { className: 'row', style: { marginBottom: 8 } },
      h('label', { className: 'checkbox', style: { marginRight: 16 } },
        h('input', { type: 'checkbox', checked: exportOptions.balancers, onChange: () => setExportOptions({ ...exportOptions, balancers: !exportOptions.balancers }) }),
        t('exportBalancers'),
      ),
      h('label', { className: 'checkbox', style: { marginRight: 16 } },
        h('input', { type: 'checkbox', checked: exportOptions.pinSelector, onChange: () => setExportOptions({ ...exportOptions, pinSelector: !exportOptions.pinSelector }) }),
        t('exportPinSelector'),
      ),
    ),

    h('div', { className: 'row', style: { marginBottom: 10 } },
      h('label', { style: { width: '150px', flexShrink: 0 } }, t('exportSocksPort')),
      h('input', { type: 'number', value: String(exportOptions.socksPort), onInput: (e) => setExportOptions({ ...exportOptions, socksPort: Number((e.target as HTMLInputElement).value) || 10808 }), style: { width: '110px' } }),
      h('label', { style: { width: '150px', flexShrink: 0, marginLeft: 12 } }, t('exportHttpPort')),
      h('input', { type: 'number', value: String(exportOptions.httpPort), onInput: (e) => setExportOptions({ ...exportOptions, httpPort: Number((e.target as HTMLInputElement).value) || 10809 }), style: { width: '110px' } }),
    ),

    h('div', { className: 'btn-row', style: { marginBottom: 10 } },
      h('button', { className: 'primary', onClick: generateExport }, 'Сгенерировать / проверить'),
      h('button', { className: 'secondary', disabled: !exportOutput, onClick: copy }, t('exportBtnCopy')),
      h('button', { className: 'secondary', disabled: !exportOutput, onClick: download }, t('exportBtnDownload')),
    ),

    h('div', { className: 'small', style: { marginBottom: 10 } }, t('exportNodesCount') + ': ' + selectedNodes.length),

    h('div', { className: exportValid.ok ? 'alert ok' : 'alert bad', style: { marginBottom: 10 } },
      h('span', { className: 'dot' }, exportValid.ok ? '✓' : '⚠'),
      exportValid.msg,
    ),

    exportOutput && h('div', { className: 'code', style: { maxHeight: '420px', overflow: 'auto' } }, exportOutput),
  )
}
