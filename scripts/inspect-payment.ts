import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { settlementFailure } from '../server/provider-error.ts'
import type { Order } from '../shared/domain.ts'

// Read saved evidence only. Never import wallet operations or request a payment.
const id = process.argv[2]
if (!id || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) {
  console.error('Usage: node --import tsx scripts/inspect-payment.ts <receipt-id>')
  process.exit(1)
}
const root = resolve(process.env.COMMISSION_DATA_DIR || '.commission-data')
const directories = process.env.COMMISSION_PUBLIC === '1'
  ? (await readdir(resolve(root, 'users'), { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => resolve(root, 'users', entry.name))
  : [root]
let found = false
for (const directory of directories) {
  try {
    const orders: Order[] = JSON.parse(await readFile(resolve(directory, 'orders.json'), 'utf8'))
    const order = orders.find(item => item.id === id)
    if (!order) continue
    found = true
    let reason: string | undefined
    try { reason = settlementFailure(JSON.parse(await readFile(resolve(directory, id + '.response.json'), 'utf8'))) }
    catch { /* An interrupted request may not have a response file. */ }
    console.log(JSON.stringify({ id: order.id, status: order.status, amount: order.amount,
      settled: order.settled, transaction: order.settlement, reason,
      diagnostics: order.paymentDiagnostics || 'No detailed diagnostics saved for this older receipt.',
    }, null, 2))
    break
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('Could not read saved payment evidence.')
      process.exit(1)
    }
  }
}
if (!found) console.log('Receipt not found.')
