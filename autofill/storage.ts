import { Storage } from "@plasmohq/storage"

import type { Account } from "../utils"
import { ACCOUNTS_KEY, SITES_KEY } from "./types"
import type { AccountSummary, SiteConfig, SiteDraft, SiteMap } from "./types"

/** Accounts live in the same store the popup uses (Plasmo default area) */
export const accountStorage = new Storage()

/**
 * Site configs are not secret, but they can grow (selectors, run history), so
 * they go to the local area to stay clear of the sync quota.
 */
export const siteStorage = new Storage({ area: "local" })

export async function getAccounts(): Promise<Account[]> {
  return (await accountStorage.get<Account[]>(ACCOUNTS_KEY)) || []
}

export async function getSites(): Promise<SiteMap> {
  return (await siteStorage.get<SiteMap>(SITES_KEY)) || {}
}

export async function setSites(sites: SiteMap): Promise<void> {
  await siteStorage.set(SITES_KEY, sites)
}

export async function updateSite(
  host: string,
  update: (site: SiteConfig) => SiteConfig
): Promise<SiteConfig | undefined> {
  const sites = await getSites()
  const site = sites[host]
  if (!site) return undefined
  sites[host] = update(site)
  await setSites(sites)
  return sites[host]
}

export async function saveDraft(draft: SiteDraft): Promise<SiteConfig> {
  const sites = await getSites()
  const prev = sites[draft.host]
  const now = Date.now()
  const site: SiteConfig = {
    stats: { runs: 0, successes: 0 },
    createdAt: now,
    ...prev,
    host: draft.host,
    accountId: draft.accountId,
    field: draft.field,
    submit: draft.submit,
    enabled: true,
    needsSetup: false,
    updatedAt: now
  }
  sites[draft.host] = site
  await setSites(sites)
  return site
}

export function summarizeAccounts(accounts: Account[]): AccountSummary[] {
  return accounts.map((a) => ({ id: a.id, name: a.name }))
}

const IGNORED_HOST_PARTS = new Set([
  "www",
  "com",
  "org",
  "net",
  "io",
  "co",
  "app",
  "dev",
  "login",
  "auth",
  "accounts",
  "account",
  "id",
  "sso",
  "secure",
  "signin"
])

/** Best-effort guess of which account belongs to a host, by name similarity */
export function suggestAccount(
  host: string,
  accounts: AccountSummary[]
): number | undefined {
  const parts = host
    .toLowerCase()
    .split(/[.-]/)
    .filter((p) => p.length >= 3 && !IGNORED_HOST_PARTS.has(p))
  let best: { id: number; score: number } | undefined
  for (const account of accounts) {
    const name = account.name.toLowerCase().replace(/\s+/g, "")
    let score = 0
    for (const part of parts) {
      if (name.includes(part)) score += part.length
      else if (part.includes(name) && name.length >= 3) score += name.length
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { id: account.id, score }
    }
  }
  return best?.id
}

/** Which of the incremental adoption levels a site is at */
export function siteLevel(site: SiteConfig): {
  level: 1 | 2 | 3
  label: string
} {
  if (!site.field) return { level: 1, label: "Linked · auto-detect" }
  if (site.submit.mode === "click" || site.submit.mode === "enter")
    return { level: 3, label: "Fill + submit" }
  if (site.submit.mode === "auto")
    return { level: 2, label: "Fill (site auto-submits)" }
  return { level: 2, label: "Fill only" }
}
