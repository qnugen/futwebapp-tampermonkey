import { SettingsEntry } from '../core';

export class FutbinSettings extends SettingsEntry {
  static id = 'futbin';
  constructor() {
    super('futbin', 'FutBIN integration');

    this.addSetting('Show link to player page', 'show-link-to-player', 'false');
    this.addSetting('Mark bargains', 'show-bargains', 'false');
    this.addSetting('Filter profit', 'filter-profit', 'true');
  }
}
