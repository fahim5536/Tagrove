import { describe, expect, it } from 'vitest'
import type { UpdaterEvent } from '@shared/ipc'
import { createUpdaterService } from './index'
import type { UpdaterLike } from './index'

interface FakeUpdater extends UpdaterLike {
  emit(event: string, payload?: unknown): void
  handlers: Map<string, Array<(...args: unknown[]) => void>>
}

function fakeUpdater(): FakeUpdater {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>()
  return {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    channel: null,
    allowPrerelease: false,
    logger: null,
    handlers,
    emit(event, payload) {
      for (const listener of handlers.get(event) ?? []) listener(payload)
    },
    on(event, listener) {
      const list = handlers.get(event) ?? []
      list.push(listener)
      handlers.set(event, list)
      return this
    },
    async checkForUpdates() {
      return null
    },
    quitAndInstall() {},
  }
}

interface Harness {
  fake: FakeUpdater
  events: Array<UpdaterEvent>
  service: ReturnType<typeof createUpdaterService>
  times: Array<number>
  setClock(value: number): void
}

function makeHarness(isPackaged = true): Harness {
  const fake = fakeUpdater()
  const events: Array<UpdaterEvent> = []
  let clock = 1_000_000
  const times: Array<number> = []
  const service = createUpdaterService(fake, {
    emit: (event) => {
      events.push(event)
      times.push(clock)
    },
    isPackaged,
    now: () => clock,
  })
  return {
    fake,
    events,
    service,
    times,
    setClock(value: number) {
      clock = value
    },
  }
}

describe('createUpdaterService', () => {
  it('configures auto-download and maps lifecycle events', async () => {
    const h = makeHarness()
    h.service.wire()

    expect(h.fake.autoDownload).toBe(true)
    expect(h.fake.autoInstallOnAppQuit).toBe(true)

    h.fake.emit('checking-for-update')
    h.fake.emit('update-available', { version: '2.0.0' })
    h.fake.emit('update-downloaded', { version: '2.0.0' })

    expect(h.events.map((event) => event.type)).toEqual(['checking', 'available', 'downloaded'])
    const downloaded = h.events[2]
    expect(downloaded).toMatchObject({ type: 'downloaded', version: '2.0.0' })
  })

  it('throttles download-progress events', () => {
    const h = makeHarness()
    h.service.wire()

    h.setClock(1_000_000)
    h.fake.emit('download-progress', { percent: 10, bytesPerSecond: 100 })
    h.setClock(1_000_100) // 100ms later — throttled
    h.fake.emit('download-progress', { percent: 20, bytesPerSecond: 100 })
    h.setClock(1_000_500) // 500ms after first — emitted
    h.fake.emit('download-progress', { percent: 40, bytesPerSecond: 100 })

    const progress = h.events.filter((event) => event.type === 'downloading')
    expect(progress).toHaveLength(2)
    expect(progress[0]).toMatchObject({ type: 'downloading', percent: 10 })
    expect(progress[1]).toMatchObject({ type: 'downloading', percent: 40 })
  })

  it('maps updater errors to typed error events', () => {
    const h = makeHarness()
    h.service.wire()
    h.fake.emit('error', new Error('network down'))
    expect(h.events[0]).toMatchObject({ type: 'error', message: 'network down' })
  })

  it('applies the beta channel as pre-release access', () => {
    const h = makeHarness()
    h.service.applyChannel('beta')
    expect(h.fake.channel).toBe('beta')
    expect(h.fake.allowPrerelease).toBe(true)
    h.service.applyChannel('stable')
    expect(h.fake.channel).toBe('stable')
    expect(h.fake.allowPrerelease).toBe(false)
  })

  it('refuses checks in unpackaged (dev) builds', async () => {
    const h = makeHarness(false)
    h.service.wire()
    const outcome = await h.service.checkForUpdates()
    expect(outcome.started).toBe(false)
    expect(outcome.reason).toContain('installed builds')
  })

  it('allows quit-and-install only after an update was downloaded', async () => {
    const h = makeHarness()
    h.service.wire()
    expect(h.service.quitAndInstall()).toBe(false)
    h.fake.emit('update-downloaded', { version: '2.0.0' })
    expect(h.service.quitAndInstall()).toBe(true)
  })
})
