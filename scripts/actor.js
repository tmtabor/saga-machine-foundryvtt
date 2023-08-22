/**
 * Extends the base Actor class to support the Saga Machine system
 *
 * @extends {Actor}
 */
export class SagaMachineActor extends Actor {

    /** @inheritdoc */
    async prepareDerivedData() {
        super.prepareDerivedData();

        // Calculate the character's scores
        await this.calculate_scores();
    }

    /**
     * Calculates all derives scores for the character and updates their values
     */
    async calculate_scores() {
        if (!this.isOwner) return; // Don't calculate scores for actors you don't own

        // Defense
        if (!this.system.scores.defense.custom) {
            const defense = this.median([this.system.stats.dexterity.value,
                this.system.stats.speed.value, this.system.stats.perception.value]);
            await this.update({'system.scores.defense.value': defense});
        }

        // Willpower
        if (!this.system.scores.willpower.custom) {
            const willpower = this.median([this.system.stats.intelligence.value,
                this.system.stats.charisma.value, this.system.stats.determination.value]);
            await this.update({'system.scores.willpower.value': willpower});
        }

        // Health
        if (!this.system.scores.health.custom) {
            const health = this.system.stats.strength.value + this.system.stats.endurance.value;
            await this.update({'system.scores.health.max': health});
        }

        // Wound total
        const wound_total = this.wound_total();
        await this.update({'system.scores.health.value': wound_total});

        // Move
        if (!this.system.scores.move.custom) {
            const move = Math.floor((this.system.stats.speed.value + this.system.stats.endurance.value) / 2);
            await this.update({'system.scores.move.value': move});
        }

        // Encumbrance threshold
        if (!this.system.scores.encumbrance.custom) {
            const encumbrance = this.system.stats.strength.value;
            await this.update({'system.scores.encumbrance.max': encumbrance});
        }

        // Encumbrance total
        const encumbrance_total = this.encumbrance_total();
        await this.update({'system.scores.encumbrance.value': encumbrance_total});

        // Equipped armor
        if (!this.system.scores.armor.custom) {
            const armor = this.armor_value();
            await this.update({'system.scores.armor.value': armor});
        }

        // Unspent experiences
        const unspent_experiences = this.system.experiences.total - this.system.experiences.spent;
        await this.update({'system.experiences.unspent': unspent_experiences});
    }

    armor_value() {
        const equipped_armor = this.items.filter(item => item.type === 'item' &&
            item.system.group === 'Armor' && item.system.equipped);
        let highest = 0;
        for (const arm of equipped_armor) {
            const val = arm.armor();
            if (val > highest) highest = val;
        }
        return highest;
    }

    encumbrance_total() {
		return this.items.filter(item => item.type === 'item').reduce((total, item) => item.encumbrance() + total, 0);
	}

    /**
     * Calculates the character's current Wound total from all Wound, Grave Wound and Fatigue consequences
     *
     * @returns {*}
     */
    wound_total() {
        const wounds = this.items.filter( item => item.type === 'consequence' &&
            (item.name.toLowerCase() === 'wound' ||
                item.name.toLowerCase() === 'grave wound' ||
                item.name.toLowerCase() === 'fatigue'));
        return wounds.map(a => a.system.rank).reduce((a, b) => a + b, 0);
    }

    /**
     * Returns the median value from an array of numbers
     *
     * @param arr
     * @returns {*|number}
     */
    median(arr) {
        const mid = Math.floor(arr.length / 2), nums = [...arr].sort((a, b) => a - b);
        return arr.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
    }
}
