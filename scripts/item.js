import {EntitySheetHelper} from "./helper.js";

/**
 * Extend the base Item document to support attributes and groups with a custom template creation dialog.
 * @extends {Item}
 */
export class SimpleItem extends Item {

  /** @inheritdoc */
  async prepareDerivedData() {
      super.prepareDerivedData();
      
      const full_name = this.name + (this.system.specialized ? ` (${this.system.specialization})` : '');
      await this.update({'system.full_name': full_name});

      if (this.type === 'item' && typeof this.system.properties === 'string') {
          const properties_array = this.system.properties.split(',').map(t => t.trim());
          await this.update({'system.properties': properties_array});
      }

      if (this.type === 'item' && this.system.group === 'weapon') {
          for (const item of this.system.properties) {
              let [prop, val] = item.toLowerCase().split(' ');
              if (prop === 'damage') {
                  let [stat, add] = val.split('str');
                  await this.update({'system.attack.has_attack': true});
                  await this.update({'system.attack.damage_str': stat === ''});
                  await this.update({'system.attack.damage': Number(stat) || Number(add) || 0});
                  break;
              }
          }
      }
      
      //this.data.data.groups = this.data.data.groups || {};
      //this.data.data.attributes = this.data.data.attributes || {};
  }
  //
  // /* -------------------------------------------- */
  //
  // /** @override */
  // static async createDialog(data={}, options={}) {
  //   return EntitySheetHelper.createDialog.call(this, data, options);
  // }
}
