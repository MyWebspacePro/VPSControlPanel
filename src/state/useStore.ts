import { create } from "zustand";
import { api, type Profiles } from "../lib/api";

interface AppState {
  ready: boolean;
  profiles: Profiles;
  load: () => Promise<void>;
  refreshProfiles: () => Promise<void>;
}

const emptyProfiles: Profiles = {
  ssh: {},
  coolify: {},
  hestia: {},
  github: null,
};

export const useStore = create<AppState>((set) => ({
  ready: false,
  profiles: emptyProfiles,
  load: async () => {
    try {
      await api.unlockSecrets();
    } catch (e) {
      console.error("Failed to unlock secrets", e);
    }
    let profiles = emptyProfiles;
    try {
      profiles = await api.getProfiles();
    } catch (e) {
      console.error("Failed to load profiles", e);
    }
    set({ ready: true, profiles });
  },
  refreshProfiles: async () => {
    try {
      const profiles = await api.getProfiles();
      set({ profiles });
    } catch (e) {
      console.error("Failed to refresh profiles", e);
    }
  },
}));
