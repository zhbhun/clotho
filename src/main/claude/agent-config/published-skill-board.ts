import path from 'node:path'

import { parse } from 'csv-parse/sync'

import {
  PUBLISHED_SKILL_CHARTS,
  type PublishedSkillBoard,
  type PublishedSkillChart,
  type PublishedSkillRow,
  type SkillChartMetric,
} from '@/shared/rpc'

import { getLogger } from '../../logging/runtime'
import { writeStorage } from '../../storage'
import { readJsonFile } from './fs-safe'

type CsvRow = Record<string, string>
const pending = new Map<string, Promise<PublishedSkillBoard>>()
const logger = getLogger('agent-config')

const metricColumn: Record<PublishedSkillChart, string> = {
  'best-100': 'wis',
  'top-repos': 'stars',
  'most-active': 'last_update',
  'rising-stars': 'first_seen_days',
  'trending-7d': 'growth_pct',
  'social-buzz': 'buzz_score',
  'official-100': 'installs_skillssh',
  'top-installs': 'installs_skillssh',
}

function metricFor(chart: PublishedSkillChart, row: CsvRow): [SkillChartMetric, string] {
  switch (chart) {
    case 'best-100':
      return ['score', row.wis]
    case 'top-repos':
      return ['stars', row.stars]
    case 'most-active':
      return ['updated', row.last_update]
    case 'rising-stars':
      return ['age', row.first_seen_days]
    case 'trending-7d':
      return row.growth_pct ? ['growth', row.growth_pct] : ['trendRank', row.trending_rank_skillssh]
    case 'social-buzz':
      return ['buzz', row.buzz_score]
    case 'official-100':
    case 'top-installs':
      return row.installs_skillssh
        ? ['installs', row.installs_skillssh]
        : ['downloads', row.downloads_clawhub || row.downloads_skillhub_cn]
  }
}

export function parsePublishedBoard(chart: PublishedSkillChart, csv: string): PublishedSkillRow[] {
  const isRepo = chart === 'top-repos'
  const nameColumn = isRepo ? 'repo' : 'skill'
  const records: CsvRow[] = parse(csv, {
    bom: true,
    trim: true,
    skip_empty_lines: true,
    columns: (headers: string[]) => {
      if (
        !headers.includes('rank') ||
        !headers.includes(nameColumn) ||
        !headers.includes(metricColumn[chart])
      )
        throw new Error('Invalid ranking headers')
      return headers
    },
  })
  if (!records.length) throw new Error('Empty ranking CSV')
  return records
    .map((row) => {
      const rank = Number(row.rank)
      const name = row[nameColumn]
      if (!Number.isSafeInteger(rank) || rank < 1 || !name) throw new Error('Invalid ranking row')
      const [metric, value] = metricFor(chart, row)
      const source = row.source_skillssh || (isRepo ? 'GitHub' : row.platform)
      const url = isRepo ? 'https://github.com/' + name : row.url || row.repo_url || ''
      return {
        rank,
        name,
        source: source || '',
        ...(row.description && { description: row.description }),
        installs: '',
        installable: !!row.source_skillssh && !isRepo,
        metric,
        value: value || '',
        ...(/^https:\/\//i.test(url) && { url }),
      }
    })
    .sort((a, b) => a.rank - b.rank)
}

export async function getPublishedSkillBoard(
  cacheDir: string,
  chart: PublishedSkillChart,
  cachedOnly: boolean,
): Promise<PublishedSkillBoard | null> {
  if (!PUBLISHED_SKILL_CHARTS.includes(chart)) throw new Error('Unknown skills chart')
  const file = path.join(cacheDir, 'skill-rankings', chart + '.json')
  // Cache the upstream CSV so disk and network use the same schema validation.
  const read = await readJsonFile<{ csv: string; syncedAt: number }>(file)
  let cached: PublishedSkillBoard | null = null
  if (read.ok && typeof read.value.csv === 'string' && Number.isSafeInteger(read.value.syncedAt)) {
    try {
      cached = { syncedAt: read.value.syncedAt, rows: parsePublishedBoard(chart, read.value.csv) }
    } catch {
      /* Refresh malformed cached data. */
    }
  }
  if (cachedOnly || (cached && Date.now() - cached.syncedAt < 6 * 60 * 60 * 1000)) return cached
  let request = pending.get(file)
  if (!request) {
    request = fetchLatest().finally(() => pending.delete(file))
    pending.set(file, request)
  }
  try {
    return await request
  } catch (error) {
    if (cached) return cached
    throw error
  }

  async function fetchLatest() {
    const response = await fetch(
      `https://raw.githubusercontent.com/LinklyAI/best-skills/main/data/latest/rankings/${chart}.csv`,
      { signal: AbortSignal.timeout(15000) },
    )
    if (!response.ok) throw new Error('Skill ranking request failed: ' + response.status)
    const csv = await response.text()
    const rows = parsePublishedBoard(chart, csv)
    const syncedAt = Date.now()
    try {
      await writeStorage({ syncedAt, csv }, file)
    } catch (error) {
      logger.warning('agent_config.skill_chart_cache_failed', 'Could not cache published ranking', {
        error,
      })
    }
    return { rows, syncedAt }
  }
}
