import { beforeEach, describe, expect, it } from 'vitest'
import { useUpdaterStore } from './updater.store'

function reset(): void {
  useUpdaterStore.setState({
    status: 'idle',
    version: null,
    percent: 0,
    error: null,
    dismissed: false,
  })
}

describe('useUpdaterStore', () => {
  beforeEach(reset)

  it('tracks a full update cycle', () => {
    const apply = useUpdaterStore.getState().applyUpdaterEvent
    apply({ type: 'checking' })
    expect(useUpdaterStore.getState().status).toBe('checking')

    apply({ type: 'available', version: '2.0.0' })
    expect(useUpdaterStore.getState().status).toBe('available')
    expect(useUpdaterStore.getState().version).toBe('2.0.0')

    apply({ type: 'downloading', percent: 55, bytesPerSecond: 1000 })
    expect(useUpdaterStore.getState()).toMatchObject({ status: 'downloading', percent: 55 })

    apply({ type: 'downloaded', version: '2.0.0' })
    expect(useUpdaterStore.getState()).toMatchObject({
      status: 'downloaded',
      version: '2.0.0',
      percent: 100,
    })
  })

  it('records errors and honors dismissal', () => {
    const apply = useUpdaterStore.getState().applyUpdaterEvent
    apply({ type: 'error', message: 'network down' })
    expect(useUpdaterStore.getState()).toMatchObject({ status: 'error', error: 'network down' })

    useUpdaterStore.getState().dismiss()
    expect(useUpdaterStore.getState().dismissed).toBe(true)

    apply({ type: 'downloaded', version: '2.0.0' })
    expect(useUpdaterStore.getState().dismissed).toBe(false)
  })

  it('stores not-available without error', () => {
    useUpdaterStore.getState().applyUpdaterEvent({ type: 'not-available' })
    expect(useUpdaterStore.getState()).toMatchObject({
      status: 'not-available',
      error: null,
    })
  })
})
