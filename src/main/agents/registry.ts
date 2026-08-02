import type { AgentAvailability, AgentDescriptor } from '@shared/agent'
import type { CodingAgentAdapter } from './adapter'

export class AgentRegistry {
  private readonly adapters = new Map<string, CodingAgentAdapter>()

  constructor(adapters: readonly CodingAgentAdapter[] = []) {
    for (const adapter of adapters) this.register(adapter)
  }

  register(adapter: CodingAgentAdapter): void {
    const id = adapter.descriptor.id
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(id)) {
      throw new Error(`Invalid Coding Agent id: ${id}`)
    }
    if (this.adapters.has(id)) throw new Error(`Coding Agent already registered: ${id}`)
    this.adapters.set(id, adapter)
  }

  get(id: string): CodingAgentAdapter | null {
    return this.adapters.get(id) ?? null
  }

  require(id: string): CodingAgentAdapter {
    const adapter = this.get(id)
    if (adapter === null) throw new Error(`Coding Agent is not installed: ${id}`)
    return adapter
  }

  descriptors(): AgentDescriptor[] {
    return [...this.adapters.values()].map((adapter) => adapter.descriptor)
  }

  async probe(id: string): Promise<AgentAvailability> {
    return this.require(id).probe()
  }
}
