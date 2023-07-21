import { EntitySheetHelper } from "./helper.js";

/**
 * Extend the basic ItemSheet with some very simple modifications
 * @extends {ItemSheet}
 */
export class SimpleItemSheet extends ItemSheet {

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["saga-machine", "sheet", "item"],
      template: 'systems/saga-machine/templates/consequence-sheet.html',
      width: 520,
      height: 280,
      // tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "description"}],
      // scrollY: [".attributes"],
    });
  }
  
  get template() {
	  const path = "systems/saga-machine/templates";
	  return `${path}/${this.item.type}-sheet.html`;
  }

  /* -------------------------------------------- */

  // /** @inheritdoc */
  // getData() {
  //   const context = super.getData();
  //   // EntitySheetHelper.getAttributeData(context.data);
  //   // context.system = context.data.data;
  //   // context.dtypes = ["String", "Number", "Boolean", "Formula", "Resource"];
  //   return context;
  // }

  /* -------------------------------------------- */

  // /** @inheritdoc */
	// activateListeners(html) {
  //   super.activateListeners(html);
  //
  //   // Everything below here is only needed if the sheet is editable
  //   if ( !this.isEditable ) return;
  //
  //   // Attribute Management
  //   html.find(".attributes").on("click", ".attribute-control", EntitySheetHelper.onClickAttributeControl.bind(this));
  //   html.find(".groups").on("click", ".group-control", EntitySheetHelper.onClickAttributeGroupControl.bind(this));
  //   html.find(".attributes").on("click", "a.attribute-roll", EntitySheetHelper.onAttributeRoll.bind(this));
  //
  //   // Add draggable for Macro creation
  //   html.find(".attributes a.attribute-roll").each((i, a) => {
  //     a.setAttribute("draggable", true);
  //     a.addEventListener("dragstart", ev => {
  //       let dragData = ev.currentTarget.dataset;
  //       ev.dataTransfer.setData('text/plain', JSON.stringify(dragData));
  //     }, false);
  //   });
  // }
  //
  // /* -------------------------------------------- */
  //
  // /** @override */
  // _getSubmitData(updateData) {
  //   let formData = super._getSubmitData(updateData);
  //   formData = EntitySheetHelper.updateAttributes(formData, this.object);
  //   formData = EntitySheetHelper.updateGroups(formData, this.object);
  //   return formData;
  // }
}
