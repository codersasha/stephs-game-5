/* ========================================
   Warrior Cats 3D RP — pure game logic (testable)
   ======================================== */

const GameLogic = {
  STORAGE_KEY: 'wc3drp_profile_v1',

  /** Five Clans + SkyClan, or outside (loners / kittypets / rogues use this + role) */
  CLANS: ['ThunderClan', 'RiverClan', 'WindClan', 'ShadowClan', 'SkyClan', 'Outside the clans'],

  /**
   * Role (rank) — what you are in the world.
   * Stored in profile.rank for save compatibility.
   */
  RANKS: [
    'kit',
    'apprentice',
    'warrior',
    'deputy',
    'medicine cat',
    'queen',
    'leader',
    'elder',
    'daylight warrior',
    'rogue',
    'loner',
    'kittypet'
  ],

  getRoleDisplayName (rank) {
    const labels = {
      kit: 'Kit',
      apprentice: 'Apprentice',
      warrior: 'Warrior',
      deputy: 'Deputy',
      'medicine cat': 'Medicine cat',
      queen: 'Queen',
      leader: 'Leader',
      elder: 'Elder',
      'daylight warrior': 'Daylight warrior',
      rogue: 'Rogue',
      loner: 'Loner',
      kittypet: 'Kittypet'
    };
    return labels[rank] || rank;
  },

  /**
   * Suffix options for warrior-style names (warrior, deputy, medicine cat, queen, elder, etc.).
   * Full name = prefix + suffix (e.g. Sand + storm = Sandstorm, Leaf + shine = Leafshine).
   */
  WARRIOR_SUFFIXES: [
    'stream',
    'flower',
    'foot',
    'step',
    'fur',
    'heart',
    'claw',
    'pelt',
    'leaf',
    'shine',
    'blaze',
    'storm',
    'stripe',
    'tail',
    'pine',
    'song',
    'nip'
  ],

  /** Roles that pick a suffix from WARRIOR_SUFFIXES (same as warriors in the books). */
  usesWarriorSuffixRank (rank) {
    return (
      rank === 'warrior' ||
      rank === 'deputy' ||
      rank === 'medicine cat' ||
      rank === 'queen' ||
      rank === 'elder' ||
      rank === 'daylight warrior' ||
      rank === 'rogue' ||
      rank === 'loner'
    );
  },

  validateNameSuffix (suffix) {
    return typeof suffix === 'string' && this.WARRIOR_SUFFIXES.indexOf(suffix) !== -1;
  },

  /**
   * Ensures nameSuffix is valid when the role uses the warrior suffix list.
   */
  normalizeProfile (profile) {
    const rank = profile.rank || 'warrior';
    if (this.usesWarriorSuffixRank(rank)) {
      const s = profile.nameSuffix;
      profile.nameSuffix = this.validateNameSuffix(s) ? s : 'heart';
    }
    return profile;
  },

  /** Default fur presets (hex) — kids pick quickly */
  FUR_PRESETS: ['#c9753d', '#2a2a2a', '#f0e6d2', '#6b5344', '#d4a574', '#8b4513', '#4a6fa5', '#e8e8e8'],

  /**
   * @returns {{ namePrefix: string, furColor: string, clan: string, rank: string, nameSuffix?: string, position: {x:number,z:number,yaw:number} }}
   */
  createDefaultProfile () {
    return {
      namePrefix: 'Swift',
      furColor: '#c9753d',
      clan: 'ThunderClan',
      rank: 'warrior',
      nameSuffix: 'heart',
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
   * Full name: prefix + rules by role.
   * — Kit: …kit (Sandkit). Apprentice: …paw. Leader: …star.
   * — Warrior, deputy, medicine cat, queen, elder (etc.): prefix + chosen suffix from WARRIOR_SUFFIXES.
   * — Kittypet: prefix only (house-cat style).
   */
  getWarriorName (profile) {
    const p = this.formatNamePrefix(profile.namePrefix || '');
    if (!p) return 'Unnamed';
    const rank = profile.rank || 'warrior';
    if (rank === 'kittypet') return p;
    if (rank === 'kit') return p + 'kit';
    if (rank === 'apprentice') return p + 'paw';
    if (rank === 'leader') return p + 'star';
    if (this.usesWarriorSuffixRank(rank)) {
      const suf = this.validateNameSuffix(profile.nameSuffix) ? profile.nameSuffix : 'heart';
      return p + suf;
    }
    return p + 'heart';
  },

  /**
   * Short label for HUD (clan + role, or role alone for loner / rogue / kittypet).
   */
  getRoleLabel (profile) {
    const clan = profile.clan || 'Outside the clans';
    const rank = profile.rank || 'warrior';
    const roleNice = this.getRoleDisplayName(rank);
    if (rank === 'loner' || rank === 'rogue' || rank === 'kittypet') {
      return roleNice;
    }
    if (clan === 'Outside the clans') {
      return roleNice + ' · outside the clans';
    }
    return clan + ' — ' + roleNice;
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
      const legacyClan = { Loner: 'Outside the clans', Kittypet: 'Outside the clans' };
      if (legacyClan[merged.clan]) merged.clan = legacyClan[merged.clan];
      if (!this.CLANS.includes(merged.clan)) merged.clan = base.clan;
      if (!this.RANKS.includes(merged.rank)) merged.rank = base.rank;
      if (!merged.nameSuffix || !this.validateNameSuffix(merged.nameSuffix)) {
        merged.nameSuffix = base.nameSuffix;
      }
      this.normalizeProfile(merged);
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
