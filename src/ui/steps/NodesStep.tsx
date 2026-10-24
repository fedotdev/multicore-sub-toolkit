/** Шаг 2: Узлы — таблица, поиск, выделение, копирование ссылок, скачивание .txt, QR (динамический импорт). */

import { useCallback, useMemo } from 'preact/hooks'
import { h } from 'preact'
import { nodeToLink } from '../../core/serialize/links'
import type { ProxyNode } from '../../core/model'
interface NodesStepProps {
  t: (key: string) => string
  nodes: ProxyNode[]
  nodeSearch: string
  setNodeSearch: (v: string) => void
  selectedIds: Set<string>
  setSelectedIds: (v: Set<string>) => void
}

export default function NodesStep(props: NodesStepProps) {
  const { t, nodes, nodeSearch, setNodeSearch, selectedIds, setSelectedIds } = props

  const toggleAll = useCallback(() => {
    const all = nodes.every((n) => selectedIds.has(n.id))
    setSelectedIds(all ? new Set() : new Set(nodes.map((n) => n.id)))
  }, [nodes, selectedIds, setSelectedIds])

  const toggle = useCallback((id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }, [selectedIds, setSelectedIds])

  const selected = nodes.filter((n) => selectedIds.has(n.id))

  const copySelectedLinks = useCallback(() => {
    const links = selected.map((n) => nodeToLink(n)).join('\n')
    navigator.clipboard.writeText(links).then(() => alert(t('copyOk')))
  }, [selected, t])

  const downloadTxt = useCallback(() => {
    const blob = new Blob([selected.map((n) => nodeToLink(n)).join('\n') + '\n'], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'nodes.txt'
    a.click()
    URL.revokeObjectURL(url)
  }, [selected])

  const filtered = useMemo(() => {
    const q = nodeSearch.toLowerCase()
    return nodes.filter((n) => n.name.toLowerCase().includes(q) || n.server.toLowerCase().includes(q))
  }, [nodes, nodeSearch])

  return h('section', { className: 'section' },
    h('div', { className: 'section-title' }, t('nodesTitle')),

    h('div', { className: 'row', style: { marginBottom: 10 } },
      h('input', { value: nodeSearch, onInput: (e) => setNodeSearch((e.target as HTMLInputElement).value), placeholder: t('nodesSearch') }),
      h('button', { className: 'secondary', onClick: toggleAll }, selectedIds.size === nodes.length && nodes.length > 0 ? 'Снять всё' : t('nodesSelectAll')),
      h('button', { className: 'primary', disabled: selected.length === 0, onClick: copySelectedLinks }, t('nodesCopySelected')),
      h('button', { className: 'secondary', disabled: selected.length === 0, onClick: downloadTxt }, t('nodesDownload')),
    ),

    h('div', { className: 'table-wrap' },
      h('table',
        h('thead',
          h('tr',
            h('th', { style: { width: '36px' } }, ''),
            h('th', 'Узел'),
            h('th', 'Протокол'),
            h('th', 'Сервер'),
            h('th', 'Порт'),
            h('th', 'Сетевой'),
            h('th', 'Безопасность'),
            h('th', 'Копировать'),
            h('th', 'Предупреждения'),
          )
        ),
        h('tbody',
          filtered.map((n) => h('tr', { key: n.id },
            h('td', h('input', { type: 'checkbox', checked: selectedIds.has(n.id), onChange: () => toggle(n.id) })),
            h('td', n.name),
            h('td', n.protocol),
            h('td', n.server),
            h('td', String(n.port)),
            h('td', n.network),
            h('td', n.security),
            h('td', h('button', { className: 'secondary', onClick: () => {
              navigator.clipboard.writeText(nodeToLink(n)).then(() => alert(t('copyOk')))
            } }, t('nodesCopyLink'))),
            h('td',
              n.warnings && n.warnings.length
                ? h('span', { className: 'tag warn', title: n.warnings.join('; ') }, '⚠ ' + n.warnings.length)
                : null
            ),
            n.unmapped && Object.keys(n.unmapped).length && h('td', { colSpan: 1 },
              h('details', { style: { fontSize: '12px' } },
                h('summary', t('nodesUnmapped')),
                h('pre', { style: { marginTop: 4, fontSize: '11px' } }, JSON.stringify(n.unmapped, null, 2)),
              ),
            ),
          )),
        ),
      ),
    ),
  )
}
