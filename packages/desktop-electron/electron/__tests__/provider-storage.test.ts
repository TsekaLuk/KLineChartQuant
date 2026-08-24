import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ElectronProviderSettingsStore,
  ElectronSafeStorageCredentialStore,
} from '../provider-storage'

const temporaryDirectories: string[] = []
const secret = 'temporary-main-only-credential'

async function directory(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), 'kq-provider-storage-'))
  temporaryDirectories.push(value)
  return value
}

function safeStorage(options: {
  available?: boolean
  backend?: 'basic_text' | 'gnome_libsecret' | 'kwallet' | 'unknown'
  shouldReEncrypt?: boolean
} = {}) {
  return {
    isAsyncEncryptionAvailable: vi.fn(async () => options.available ?? true),
    getSelectedStorageBackend: vi.fn(() => options.backend ?? 'gnome_libsecret'),
    encryptStringAsync: vi.fn(async (value: string) => Buffer.from(`encrypted:${value}`)),
    decryptStringAsync: vi.fn(async (value: Buffer) => ({
      result: value.toString().replace(/^encrypted:/, ''),
      shouldReEncrypt: options.shouldReEncrypt ?? false,
    })),
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  )
})

describe('Electron Provider storage', () => {
  it('persists only safeStorage ciphertext and decrypts it in Main', async () => {
    const root = await directory()
    const filePath = join(root, 'credential.json')
    const crypto = safeStorage()
    const store = new ElectronSafeStorageCredentialStore({
      filePath,
      safeStorage: crypto,
      platform: 'darwin',
    })

    expect(await store.metadata()).toEqual({ persistenceMode: 'encrypted' })
    await store.write(secret)
    const persisted = await readFile(filePath, 'utf8')
    expect(persisted).not.toContain(secret)
    expect(JSON.parse(persisted)).toEqual({
      version: 1,
      ciphertext: Buffer.from(`encrypted:${secret}`).toString('base64'),
    })
    expect(await store.read()).toBe(secret)
    expect(crypto.decryptStringAsync).toHaveBeenCalledOnce()
  })

  it.each([
    ['basic_text', true],
    ['unknown', true],
    ['gnome_libsecret', false],
  ] as const)(
    'uses memory-only mode on Linux backend %s with availability %s',
    async (backend, available) => {
      const root = await directory()
      const filePath = join(root, 'credential.json')
      const crypto = safeStorage({ backend, available })
      const store = new ElectronSafeStorageCredentialStore({
        filePath,
        safeStorage: crypto,
        platform: 'linux',
      })

      expect(await store.metadata()).toMatchObject({
        persistenceMode: 'memory-only',
        warning: expect.stringContaining('forgotten on exit'),
      })
      await store.write(secret)
      expect(await store.read()).toBe(secret)
      await expect(access(filePath)).rejects.toMatchObject({ code: 'ENOENT' })
      expect(crypto.encryptStringAsync).not.toHaveBeenCalled()
    },
  )

  it('removes encrypted and memory credentials without touching settings', async () => {
    const root = await directory()
    const credentialPath = join(root, 'credential.json')
    const settingsPath = join(root, 'settings.json')
    const store = new ElectronSafeStorageCredentialStore({
      filePath: credentialPath,
      safeStorage: safeStorage(),
      platform: 'win32',
    })
    const settings = new ElectronProviderSettingsStore(settingsPath)
    await store.write(secret)
    await settings.write({
      version: 1,
      baseUrl: 'https://api.302.ai/v1',
      modelId: 'frontier-fast',
      modelName: 'Frontier Fast',
      compatibility: 'compatible',
      lastTestedAt: 2,
      lastModelsRefreshAt: 1,
    })

    await store.delete()
    expect(await store.read()).toBeUndefined()
    expect(await settings.read()).toMatchObject({ modelId: 'frontier-fast' })
  })

  it('validates settings and never returns a partially shaped document', async () => {
    const root = await directory()
    const filePath = join(root, 'settings.json')
    const store = new ElectronProviderSettingsStore(filePath)
    expect(await store.read()).toBeUndefined()
    await store.write({
      version: 1,
      baseUrl: 'https://api.302.ai/v1',
      modelId: 'frontier-fast',
      modelName: 'Frontier Fast',
      compatibility: 'compatible',
      lastTestedAt: 2,
      lastModelsRefreshAt: 1,
    })
    expect(await store.read()).toMatchObject({ modelId: 'frontier-fast' })

    await writeFile(filePath, '{"version":1,"modelId":"partial"}', 'utf8')
    await expect(store.read()).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
      message: 'The saved Provider settings are invalid.',
    })
  })

  it('reads legacy 302.ai files and writes only the generic filenames', async () => {
    const root = await directory()
    const credentialPath = join(root, 'agent-provider-credential.json')
    const legacyCredentialPath = join(root, 'agent-provider-302ai-credential.json')
    const settingsPath = join(root, 'agent-provider-settings.json')
    const legacySettingsPath = join(root, 'agent-provider-302ai-settings.json')
    const crypto = safeStorage()
    await writeFile(
      legacyCredentialPath,
      `${JSON.stringify({
        version: 1,
        ciphertext: Buffer.from(`encrypted:${secret}`).toString('base64'),
      })}\n`,
    )
    await writeFile(
      legacySettingsPath,
      `${JSON.stringify({
        version: 1,
        baseUrl: 'https://api.302.ai/v1',
        modelId: 'frontier-fast',
        modelName: 'Frontier Fast',
        compatibility: 'compatible',
        lastTestedAt: 2,
        lastModelsRefreshAt: 1,
      })}\n`,
    )

    const credentials = new ElectronSafeStorageCredentialStore({
      filePath: credentialPath,
      fallbackFilePath: legacyCredentialPath,
      safeStorage: crypto,
      platform: 'darwin',
    })
    const settings = new ElectronProviderSettingsStore(settingsPath, legacySettingsPath)

    expect(await credentials.read()).toBe(secret)
    expect(await settings.read()).toMatchObject({ modelId: 'frontier-fast' })
    await credentials.write(secret)
    await settings.write({
      version: 1,
      baseUrl: 'https://api.deepseek.com',
      modelId: 'deepseek-chat',
      modelName: 'DeepSeek',
      compatibility: 'compatible',
      lastTestedAt: 3,
      lastModelsRefreshAt: 2,
    })
    expect(JSON.parse(await readFile(credentialPath, 'utf8'))).toMatchObject({ version: 1 })
    expect(JSON.parse(await readFile(settingsPath, 'utf8'))).toMatchObject({
      baseUrl: 'https://api.deepseek.com',
    })
  })

  it('re-encrypts a credential after safeStorage key rotation', async () => {
    const root = await directory()
    const filePath = join(root, 'credential.json')
    const crypto = safeStorage({ shouldReEncrypt: true })
    const store = new ElectronSafeStorageCredentialStore({
      filePath,
      safeStorage: crypto,
      platform: 'darwin',
    })
    await store.write(secret)
    crypto.encryptStringAsync.mockClear()
    expect(await store.read()).toBe(secret)
    expect(crypto.encryptStringAsync).toHaveBeenCalledWith(secret)
  })
})
