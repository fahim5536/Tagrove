import { create } from 'zustand'
import type { PageId } from '../constants'

interface NavigationState {
  activePage: PageId
  navigate: (page: PageId) => void
}

export const useNavigationStore = create<NavigationState>()((set) => ({
  activePage: 'generate',
  navigate: (page) => set({ activePage: page }),
}))
