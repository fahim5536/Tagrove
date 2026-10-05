import { beforeEach, describe, expect, it } from 'vitest'
import { MAX_TOASTS } from '../constants'
import { useUiStore } from './ui.store'

describe('useUiStore', () => {
  beforeEach(() => {
    useUiStore.setState({ toasts: [] })
  })

  it('pushes a toast with a generated id', () => {
    useUiStore.getState().pushToast({ variant: 'info', title: 'Hello' })
    const toasts = useUiStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0]?.title).toBe('Hello')
    expect(toasts[0]?.id).toBeTruthy()
  })

  it('keeps only the most recent toasts', () => {
    const store = useUiStore.getState()
    for (let i = 0; i < MAX_TOASTS + 2; i += 1) {
      store.pushToast({ variant: 'info', title: `Toast ${i}` })
    }
    const toasts = useUiStore.getState().toasts
    expect(toasts).toHaveLength(MAX_TOASTS)
    expect(toasts[MAX_TOASTS - 1]?.title).toBe(`Toast ${MAX_TOASTS + 1}`)
  })

  it('dismisses a toast by id', () => {
    const store = useUiStore.getState()
    store.pushToast({ variant: 'success', title: 'Saved' })
    const id = useUiStore.getState().toasts[0]?.id
    expect(id).toBeTruthy()
    if (id) store.dismissToast(id)
    expect(useUiStore.getState().toasts).toHaveLength(0)
  })
})
