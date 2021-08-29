/**
 * Extend the base Actor document to support attributes and groups with a custom template creation dialog.
 * @extends {Actor}
 */
export class SagaMachineActor extends Actor {

  // /** @inheritdoc */
  // prepareDerivedData() {
  //   super.prepareDerivedData();
  //   this.data.data.groups = this.data.data.groups || {};
  //   this.data.data.attributes = this.data.data.attributes || {};
  // }

  /* -------------------------------------------- */

  // /** @override */
  // static async createDialog(data={}, options={}) {
  //   return EntitySheetHelper.createDialog.call(this, data, options);
  // }

  /* -------------------------------------------- */
  /*  Roll Data Preparation                       */
  /* -------------------------------------------- */

  // /** @inheritdoc */
  // getRollData() {
  //
  //   // Copy the actor's system data
  //   const data = this.toObject(false).data;
  //   return data;
  // }
}
