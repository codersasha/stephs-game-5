/* ========================================
   Warrior Cats 3D RP — pure game logic (testable)
   ======================================== */

const GameLogic = {
  STORAGE_KEY: 'wc3drp_profile_v1',

  CLANS: ['ThunderClan', 'RiverClan', 'WindClan', 'ShadowClan', 'SkyClan', 'Loner', 'Kittypet'],

  RANKS: ['kit', 'apprentice', 'warrior', 'medicine cat', 'deputy', 'leader'],

  /** Default fur presets (hex) — kids pick quickly */
  FUR_PRESETS: ['#c9753d', '#2a2a2a', '#f0e6d2', '#6b5344', '#d4a574', '#8b4513', '#4a6fa5', '#e8e8e8'],

  /**
   * @returns {{ namePrefix: string, furColor: string, clan: string, rank: string, position: {x:number,z:number,yaw:number} }}
   */
  createDefaultProfile () {
    return {
      namePrefix: 'Swift',
      furColor: '#c9753d',
      clan: 'ThunderClan',
      rank: 'warrior',
      position: { x: 0, z: 8, yaw: 0 }
    };
  },

  validateNamePrefix (prefix) {
    if (!prefix || typeof prefix !== 'string') return false;
    const t = prefix.trim();
    if (t.length < 2 || t.length > 12) return false;
    return /^[A-Za-z]+$/.test(t);
  },

  formatNamePrefix (prefix) {
    if (!prefix || typeof prefix !== 'string') return '';
    const t = prefix.trim();
    if (!t.length) return '';
    return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
  },

  /**
   * Warrior-style display name from prefix + rank (simplified suffix rules).
   */
  getWarriorName (profile) {
    const p = this.formatNamePrefix(profile.namePrefix || '');
    if (!p) return 'Unnamed';
    const rank = profile.rank || 'warrior';
    const suffix = {
      kit: 'kit',
      apprentice: 'paw',
      warrior: 'heart',
      'medicine cat': 'pool',
      deputy: 'heart',
      leader: 'star'
    }[rank] || 'heart';
    return p + suffix;
  },

  /**
   * Short label for HUD, e.g. "ThunderClan warrior"
   */
  getRoleLabel (profile) {
    const clan = profile.clan || 'Loner';
    const rank = profile.rank || 'warrior';
    if (rank === 'deputy') return clan + ' — Deputy';
    if (rank === 'leader') return clan + ' — Leader';
    if (rank === 'medicine cat') return clan + ' — Medicine Cat';
    return clan + ' — ' + rank;
  },

  clampHexColor (hex) {
    if (typeof hex !== 'string') return '#c9753d';
    const m = /^#([0-9A-Fa-f]{6})$/.exec(hex.trim());
    return m ? '#' + m[1].toLowerCase() : '#c9753d';
  },

  loadProfile () {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o || typeof o !== 'object') return null;
      const base = this.createDefaultProfile();
      const merged = {
        ...base,
        ...o,
        position: {
          ...base.position,
          ...(o.position && typeof o.position === 'object' ? o.position : {})
        }
      };
      merged.namePrefix = this.formatNamePrefix(merged.namePrefix || base.namePrefix);
      merged.furColor = this.clampHexColor(merged.furColor);
      if (!this.CLANS.includes(merged.clan)) merged.clan = base.clan;
      if (!this.RANKS.includes(merged.rank)) merged.rank = base.rank;
      return merged;
    } catch (e) {
      return null;
    }
  },

  saveProfile (profile) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(profile));
      return true;
    } catch (e) {
      return false;
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GameLogic;
}
