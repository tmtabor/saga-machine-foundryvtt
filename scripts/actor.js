/**
 * Extend the base Actor document to support attributes and groups with a custom template creation dialog.
 * @extends {Actor}
 */
export class SagaMachineActor extends Actor {

  /** @inheritdoc */
  async prepareDerivedData() {
      super.prepareDerivedData();
      
      const defense = this.median([this.system.stats.dexterity.value, 
      		this.system.stats.speed.value, this.system.stats.perception.value]);
      await this.update({'system.scores.defense.value': defense});
      
      const health = this.system.stats.strength.value + this.system.stats.endurance.value;
      await this.update({'system.scores.health.value': health});
      
      const move = Math.floor((this.system.stats.speed.value + this.system.stats.endurance.value)/2);
      await this.update({'system.scores.move.value': move});
      
      const willpower = this.median([this.system.stats.intelligence.value, 
      		this.system.stats.charisma.value, this.system.stats.determination.value]);
      await this.update({'system.scores.willpower.value': willpower});
      
      const encumbrance = this.system.stats.strength.value;
      await this.update({'system.scores.encumbrance.value': encumbrance});

  //   // this.data.data.groups = this.data.data.groups || {};
  //   // this.data.data.attributes = this.data.data.attributes || {};
  }
  
  median(arr) {
      const mid = Math.floor(arr.length / 2), nums = [...arr].sort((a, b) => a - b);
  	  return arr.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
  }

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
