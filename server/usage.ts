import { readFile, writeFile, rename } from 'node:fs/promises'
import { resolve } from 'node:path'
// Persist request limits before model calls. This is a request cap, not a dollar guarantee.
export async function createUsageLimit(root: string) {
  const path = resolve(root, 'ai-usage.json')
  let usage: { day: string; total: number; users: Record<string, number> } = await readFile(path, 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return { day: '', total: 0, users: {} }; throw error })
  let pending = Promise.resolve()
  return (id: string) => {
    const task = pending.then(async () => {
      const day = new Date().toISOString().slice(0, 10)
      if (usage.day !== day) usage = { day, total: 0, users: {} }
      if (usage.total >= Number(process.env.COMMISSION_AI_DAILY_LIMIT || 100) || (usage.users[id] || 0) >= Number(process.env.COMMISSION_AI_USER_DAILY_LIMIT || 20)) throw new Error('Today’s AI conversation allowance is used up. Manual editing, exports and paid production remain available.')
      usage.total++; usage.users[id] = (usage.users[id] || 0) + 1
      await writeFile(path + '.tmp', JSON.stringify(usage), { mode: 0o600 }); await rename(path + '.tmp', path)
    })
    pending = task.catch(() => {})
    return task
  }
}
