/**
 * Extend the base Item class to support the Saga Machine system
 */
export class SagaMachineItem extends Item {
    /**
     * @inheritdoc
     * @override
     */
    async prepareDerivedData() {
        super.prepareDerivedData();

        // Don't derive properties for items you don't own or which haven't been saved to the db
        if (!this.actor || !this.actor.isOwner || !this.id || !this.actor.items.get(this.id)) return;

        // Derive the full name from the base name and specialization
        this.full_name();

        // Parse the submitted property string into an array and set various derived values
        this.parse_properties();
    }

    /**
     * Code to run when a new SagaMachineItem is created - changes default icon
     *
     * @override
     */
    async _onCreate(data, options, userId) {
        await super._onCreate(data, options, userId);

        // Return if you're not the owner of this item, or it hasn't been saved to the database
        if (!this.isOwner || !this.id) return;

        // Set new default icons
        if (data.img === foundry.documents.BaseItem.DEFAULT_ICON) { // If default
            if (this.type === 'skill') this.update({'img': 'systems/saga-machine/images/defaults/skill.svg'});
            if (this.type === 'trait') this.update({'img': 'systems/saga-machine/images/defaults/trait.svg'});
            if (this.type === 'origin') this.update({'img': 'systems/saga-machine/images/defaults/origin.svg'});
            if (this.type === 'path') this.update({'img': 'systems/saga-machine/images/defaults/path.svg'});
            if (this.type === 'ambition') this.update({'img': 'systems/saga-machine/images/defaults/ambition.svg'});
            if (this.type === 'consequence') this.update({'img': 'systems/saga-machine/images/defaults/consequence.svg'});
        }
    }

    /**
     * Derive the full name from the base name and specialization
     */
    full_name() {
        let full_name = this.name + (this.system.specialized ? ` (${this.system.specialization})` : '');
        if (this.type === 'trait' && this.system.ranked) full_name += ` ${this.system.rank}`;
        this.system.full_name = full_name;
    }

    /**
     * Parse the submitted property string into an array
     */
    parse_properties() {
        // Only do this for equipment
        if (this.type !== 'item') return;

        // Parse string into an array
        if (typeof this.system.properties === 'string') {
            this.system.properties = this.system.properties.split(',').map(t => t.trim());
        }

        this.system.container = this.property_value('Container');
        this.system.armor = this.property_value('Armor');
        this.system.bulky = this.property_value('Bulky');
        this.system.powered = this.property_value('Powered');
        this.system.hands = this.property_value('Hands') || 1;
        this.system.unit_encumbrance = this.calc_unit_encumbrance();
        this.system.container_encumbrance = this.calc_container_encumbrance();
        this.system.encumbrance = this.calc_encumbrance();
        this.system.unit_loads = this.calc_unit_loads();
        this.system.loads = this.calc_loads();
    }

    /**
     * Obtains the value of the given property, defaulting to 0 is unspecified
     *
     * @param {string} property
     * @return {number}
     */
    property_value(property) {
        for (const prop of this.system.properties) {
            if (prop.toLowerCase().startsWith(`${property.toLowerCase()} `)) {
                const [p, val] = prop.split(' ');
                return Number(val);
            }
        }
        return 0;
    }

    /**************************************
     * METHODS THAT DEAL WITH ENCUMBRANCE *
     **************************************/

    /**
     * Calculate the encumbrance per item, taking all item properties into account
     *
     * @return {number}
     */
    calc_unit_encumbrance() {
        if (this.system.load) return 100;
        else if (this.system.properties.includes('Neg')) return 0;
        else {
            for (const prop of this.system.properties) {
                if (prop.startsWith('Implant ')) return 0;
                if (prop.startsWith('Software ')) return 0;

                if (prop.startsWith('Big ')) {
                    const [big, val] = prop.split(' ');
                    return Number(val);
                }
            }
            return 1;
        }
    }

    /**
     * Calculates the loads per unit.
     * Loads are Encumbrance 100 and are used in the trading and vehicles sub-systems.
     *
     * @return {number}
     */
    calc_unit_loads() {
        return this.system.unit_encumbrance / 100;
    }

    /**
     * Calculate the encumbrance value of the stack in regards to how much container space it takes.
     *
     * @return {number}
     */
    calc_container_encumbrance() {
        return this.system.unit_encumbrance * this.system.quantity;
    }

    /**
     * Calculate the encumbrance value of the stack, taking into account item properties,
     * quantity and whether the item is equipped.
     *
     * @return {number}
     */
    calc_encumbrance() {
        if (!this.system.carried) return 0;
        if (this.system.parent) return 0;
        if (this.system.equipped && this.system.properties.includes('Worn')) return 0;
        return this.system.unit_encumbrance * this.system.quantity;
    }

    /**
     * Calculate the number of loads in the stack.
     * Loads are Encumbrance 100 and are used in the trading and vehicles sub-systems.
     *
     * @return {number}
     */
    calc_loads() {
        return Math.floor(this.system.unit_loads * this.system.quantity);
    }
}
