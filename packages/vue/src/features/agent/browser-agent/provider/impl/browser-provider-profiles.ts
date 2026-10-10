// 浏览器端唯一 Provider 配置数组的内存真相源；内存优先，写入时同步持久化。

import type { BrowserProviderProfile } from '../types.js'
import type { BrowserAgentModelSettingsStore } from './browser-agent-model-settings.js'
import { type ManagedProvider, managedProviderReadOnlyError } from './managed-provider.js'

/**
 * 管理浏览器端唯一的 Provider 配置数组；内存优先，写入时同步持久化。
 * 宿主托管配置排在首位且从不持久化；没有任何用户配置处于激活状态时它即为生效配置。
 */
export class BrowserProviderProfiles {
  private cache: BrowserProviderProfile[] | undefined

  constructor(
    private readonly modelSettings: BrowserAgentModelSettingsStore,
    private readonly managed?: ManagedProvider,
  ) {}

  read(): BrowserProviderProfile[] {
    return this.models().map((profile) => ({ ...profile }))
  }

  /** 持久化用户配置；托管配置只存在于内存，写入时被剔除。 */
  write(profiles: BrowserProviderProfile[]): void {
    this.cache = profiles.filter((profile) => !profile.managed).map((profile) => ({ ...profile }))
    this.modelSettings.setProfiles(this.cache)
  }

  active(): BrowserProviderProfile | undefined {
    return this.models().find((profile) => profile.active)
  }

  select(name: string): void {
    this.write(this.models().map((profile) => ({ ...profile, active: profile.name === name })))
  }

  /** 重命名配置，保持其激活状态与其余配置不变。 */
  rename(previousName: string, nextName: string): void {
    this.write(
      this.models().map((profile) =>
        profile.name === previousName ? { ...profile, name: nextName } : profile,
      ),
    )
  }

  /**
   * 移除配置；若移除的是激活配置，则将剩余配置中的第一个设为激活。
   * 存在托管配置时，它排在首位，因此自然成为下一个生效配置。
   */
  remove(name: string): void {
    const remaining = this.models().filter((profile) => profile.name !== name)
    const keepsActive = remaining.some((profile) => profile.active)
    this.write(
      keepsActive
        ? remaining
        : remaining.map((profile, index) => ({ ...profile, active: index === 0 })),
    )
  }

  /** 更新激活的用户配置；托管配置由宿主控制，拒绝修改。 */
  updateActive(patch: Partial<Omit<BrowserProviderProfile, 'name' | 'active'>>): void {
    if (this.active()?.managed) throw managedProviderReadOnlyError()
    this.write(
      this.models().map((profile) => (profile.active ? { ...profile, ...patch } : profile)),
    )
  }

  /** 用户配置加上排在首位的托管配置，激活状态由用户配置推导。 */
  private models(): readonly BrowserProviderProfile[] {
    this.cache ??= this.load()
    if (!this.managed) return this.cache
    const managedActive = !this.cache.some((profile) => profile.active)
    return [this.managed.profile(managedActive), ...this.cache]
  }

  /** 从模型设置文档载入配置数组。 */
  private load(): BrowserProviderProfile[] {
    return this.modelSettings.profiles()
  }
}
