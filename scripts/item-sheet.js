/**
 * Extend the basic ItemSheet with some very simple modifications
 * @extends {ItemSheet}
 */
export class SagaMachineItemSheet extends ItemSheet {

    /** @inheritdoc */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["saga-machine", "sheet", "item"],
            width: 520,
            height: 280,
            // tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "description"}],
            // scrollY: [".attributes"],
        });
    }

    /**
     * Dynamically set the HTML template for the item type
     * @returns {string}
     */
    get template() {
        return `systems/saga-machine/templates/${this.item.type}-sheet.html`;
    }
}
