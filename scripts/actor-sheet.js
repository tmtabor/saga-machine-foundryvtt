import { EntitySheetHelper } from "./helper.js";

/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
export class SagaMachineActorSheet extends ActorSheet {

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["saga-machine", "sheet", "actor"],
      template: "systems/saga-machine/templates/actor-sheet.html",
      width: 850,
      height: 600,
      tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "basics"}],
      scrollY: [".biography", ".items", ".attributes"],
      dragDrop: [{dragSelector: ".item-list .item", dropSelector: null}]
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getData() {
    const context = super.getData();
    // EntitySheetHelper.getAttributeData(context.data);
    // context.shorthand = true;
    context.system = context.data.data;
    // console.log(context);
    // context.dtypes = ["String", "Number", "Boolean", "Formula", "Resource"];
    return context;
  }

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
  //   // Item Controls
  //   html.find(".item-control").click(this._onItemControl.bind(this));
  //   html.find(".items .rollable").on("click", this._onItemRoll.bind(this));
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

  // /* -------------------------------------------- */
  //
  // /**
  //  * Handle click events for Item control buttons within the Actor Sheet
  //  * @param event
  //  * @private
  //  */
  // _onItemControl(event) {
  //   event.preventDefault();
  //
  //   // Obtain event data
  //   const button = event.currentTarget;
  //   const li = button.closest(".item");
  //   const item = this.actor.items.get(li?.dataset.itemId);
  //
  //   // Handle different actions
  //   switch ( button.dataset.action ) {
  //     case "create":
  //       const cls = getDocumentClass("Item");
  //       return cls.create({name: game.i18n.localize("SIMPLE.ItemNew"), type: "item"}, {parent: this.actor});
  //     case "edit":
  //       return item.sheet.render(true);
  //     case "delete":
  //       return item.delete();
  //   }
  // }
  //
  // /* -------------------------------------------- */
  //
  // /**
  //  * Listen for roll buttons on items.
  //  * @param {MouseEvent} event    The originating left click event
  //  */
  // _onItemRoll(event) {
  //   let button = $(event.currentTarget);
  //   const li = button.parents(".item");
  //   const item = this.actor.items.get(li.data("itemId"));
  //   let r = new Roll(button.data('roll'), this.actor.getRollData());
  //   return r.toMessage({
  //     user: game.user.id,
  //     speaker: ChatMessage.getSpeaker({ actor: this.actor }),
  //     flavor: `<h2>${item.name}</h2><h3>${button.text()}</h3>`
  //   });
  // }
  //
  // /* -------------------------------------------- */
  //
  // /** @inheritdoc */
  // _getSubmitData(updateData) {
  //   let formData = super._getSubmitData(updateData);
  //   formData = EntitySheetHelper.updateAttributes(formData, this.object);
  //   formData = EntitySheetHelper.updateGroups(formData, this.object);
  //   return formData;
  // }
}
