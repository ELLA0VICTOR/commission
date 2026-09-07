import { defaultBrief } from '../shared/domain.ts'
import { endpoints, requestBody, validateAccept, decimal } from '../server/policy.ts'
import { getRequirements, merchantRequest } from '../server/provider.ts'
const plan = { concept: 'An editorial rooftop campaign.', imagePrompt: 'Abstract blue architectural rooftop at dusk, no text.', narration: 'Join us for After Hours at The Terrace in Lagos.', caption: 'After Hours at The Terrace.' }
for (const service of ['plan', 'image', 'voice'] as const) {
  const requirements = await getRequirements(await merchantRequest(endpoints[service], requestBody(service, defaultBrief, plan)))
  const eligible = (requirements.accepts as Record<string, unknown>[]).filter(validateAccept)
  console.log(JSON.stringify({ service, status: 402, version: requirements.x402Version, supportedOptions: eligible.length, amountsU: eligible.map(option => decimal(BigInt(option.amount as string))) }))
}
console.log('Unsigned quote checks only. No wallet signature or payment was requested.')
