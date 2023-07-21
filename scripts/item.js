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
