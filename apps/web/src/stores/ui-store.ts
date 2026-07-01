import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

type UiState = {
  selectedHostIp: string | null;
  panelOpen: boolean;
  setSelectedHostIp: (ip: string | null) => void;
  setPanelOpen: (open: boolean) => void;
};

export const useUiStore = create<UiState>()(
  devtools(
    (set) => ({
      selectedHostIp: null,
      panelOpen: false,
      setSelectedHostIp: (ip) => {
        set({ selectedHostIp: ip });
      },
      setPanelOpen: (open) => {
        set({ panelOpen: open });
      },
    }),
    { name: 'sniffoutpro-ui' },
  ),
);
