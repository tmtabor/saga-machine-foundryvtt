/**
 * Extend the base Item class to support the Saga Machine system
 *
 * @extends {Item}
 */
export class SagaMachineItem extends Item {
    /** @inheritdoc */
    async prepareDerivedData() {
        super.prepareDerivedData();

        // Don't derive properties for items you don't own
        if (this.actor && !this.actor.isOwner) return;

        // Derive the full name from the base name and specialization
        this.full_name();

        // Parse the submitted property string into an array
        this.parse_properties();

        // Derive an attack structure from the Damage property
        this.weapon_attacks();
    }

    /**
     * Derive the full name from the base name and specialization
     */
    async full_name() {
        let full_name = this.name + (this.system.specialized ? ` (${this.system.specialization})` : '');
        if (this.type === 'trait' && this.system.ranked) full_name += ` ${this.system.rank}`;
        await this.update({'system.full_name': full_name});
    }

    /**
     * Parse the submitted property string into an array
     */
    async parse_properties() {
        if (this.type === 'item' && typeof this.system.properties === 'string') {
            const properties_array = this.system.properties.split(',').map(t => t.trim());
            await this.update({'system.properties': properties_array});
        }
    }

    armor() {
        for (const prop of this.system.properties) {
            if (prop.startsWith('Armor ')) {
                const [arm, val] = prop.split(' ');
                return Number(val);
            }
        }
        return 0;
    }

    encumbrance() {
        if (!this.system.carried) return 0;
        else if (this.system.properties.includes('Neg')) return 0;
        else if (this.system.properties.includes('Worn') && this.system.equipped) return 0;
        else {
            for (const prop of this.system.properties) {
                if (prop.startsWith('Big ')) {
                    const [big, val] = prop.split(' ');
                    return Number(val) * this.system.quantity;
                }
            }
            return this.system.quantity;
        }
    }

    /**
     * Derive an attack structure from the Damage property
     */
    async weapon_attacks() {
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
    }
}
