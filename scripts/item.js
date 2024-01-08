/**
 * Extend the base Item class to support the Saga Machine system
 *
 * @extends {Item}
 */
export class SagaMachineItem extends Item {
    /** @inheritdoc */
    async prepareDerivedData() {
        super.prepareDerivedData();

        // Don't derive properties for items you don't own or which haven't been saved to the db
        if (!this.actor || !this.actor.isOwner || !this.id || !this.actor.items.get(this.id)) return;

        // Derive the full name from the base name and specialization
        this.full_name();

        // Parse the submitted property string into an array and set various derived values
        this.parse_properties();
    }

    /** @override */
    async _onCreate(data, options, userId) {
        await super._onCreate(data, options, userId);

        // Return if you're not the owner of this item or it hasn't been saved to the database
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

        this.system.armor = this.property_value('Armor');
        this.system.hands = this.property_value('Hands') || 1;
        this.system.unit_encumbrance = this.calc_unit_encumbrance();
        this.system.encumbrance = this.calc_encumbrance();
    }

    property_value(property) {
        for (const prop of this.system.properties) {
            if (prop.toLowerCase().startsWith(`${property.toLowerCase()} `)) {
                const [p, val] = prop.split(' ');
                return Number(val);
            }
        }
        return 0;
    }

    calc_unit_encumbrance() {
        if (this.system.properties.includes('Neg')) return 0;
        else if (this.system.properties.includes('Worn') && this.system.equipped) return 0;
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

    calc_encumbrance() {
        if (!this.system.carried) return 0;
        return this.calc_unit_encumbrance() * this.system.quantity;
    }
}
