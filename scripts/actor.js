import {INITIATIVE} from "./combat.js";
import {Test} from "./tests.js";

/**
 * Extends the base Actor class to support the Saga Machine system
 *
 * @extends {Actor}
 */
export class SagaMachineActor extends Actor {

    /** @inheritdoc */
    async prepareDerivedData() {
        super.prepareDerivedData();

        // Calculate the actor's scores
        if (this.type === 'pc') await this.calculate_pc_scores();
        if (this.type === 'stash') await this.calculate_stash_scores();
    }

    /** @inheritdoc */
    getRollData() {
        const data = super.getRollData();

        // Copy stats and scores to the top level
        for (let stat of Object.keys(data.stats)) data[stat] = data.stats[stat].value;
        for (let score of Object.keys(data.scores)) data[score] = data.scores[score].value;

        return data;
    }

    async calculate_stash_scores() {
        // Wealth total
        this.system.wealth.total = this.wealth_total();

        // Encumbrance total
        this.system.encumbrance = this.encumbrance_total();
    }

    /**
     * Calculates all derives scores for the character and updates their values
     */
    async calculate_pc_scores() {
        // Defense
        if (!this.system.scores.defense.custom)
            this.system.scores.defense.value = this.median([this.system.stats.dexterity.value,
                this.system.stats.speed.value, this.system.stats.perception.value]);

        // Willpower
        if (!this.system.scores.willpower.custom)
            this.system.scores.willpower.value = this.median([this.system.stats.intelligence.value,
                this.system.stats.charisma.value, this.system.stats.determination.value]);

        // Health
        if (!this.system.scores.health.custom)
            this.system.scores.health.max = this.system.stats.strength.value + this.system.stats.endurance.value;

        // Wound total
        this.system.scores.health.value = this.wound_total();

        // Move
        if (!this.system.scores.move.custom)
            this.system.scores.move.value = Math.floor((this.system.stats.speed.value + this.system.stats.endurance.value) / 2);

        // Encumbrance threshold
        if (!this.system.scores.encumbrance.custom)
            this.system.scores.encumbrance.max = this.system.stats.strength.value;

        // Encumbrance total
        this.system.scores.encumbrance.value = this.encumbrance_total();

        // Equipped armor
        if (!this.system.scores.armor.custom)
            this.system.scores.armor.value = this.armor_value();

        // Experiences
        this.system.experiences.spent = this.experiences_spent();
        this.system.experiences.unspent = this.system.experiences.total - this.system.experiences.spent;
        this.system.experiences.level = this.power_level();
    }

    power_level() {
        const total_spent = this.system.experiences.spent + game.settings.get('saga-machine', 'level', 120);

        if (total_spent < 150)        return "Mundane";
        else if (total_spent < 200)   return "Novice";
        else if (total_spent < 250)   return "Exceptional";
        else if (total_spent < 300)   return "Distinguished";
        else if (total_spent < 350)   return "Renowned";
        else                          return "Legendary";
    }

    stat_cost(val) {
        return [...Array(val + 1).keys()].reduce((a, b) => a + b, 0);
    }

    experiences_spent() {
        let total = 0;

        // Add total of all stats
        for (let stat of ['strength', 'dexterity', 'speed', 'endurance', 'intelligence', 'perception', 'charisma', 'determination'])
            total += this.stat_cost(this.system.stats[stat].value);

        // Add total of all skills and traits
        for (let item of this.items) {
            if (item.type === 'skill') total += this.stat_cost(item.system.rank);
            if (item.type === 'trait') total += item.system.ranked ? item.system.cost * item.system.rank : item.system.cost;
        }

        // Subtract the cost of the character's starting stats, based on power level
        total -= game.settings.get('saga-machine', 'level', 120);

        return total;
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

    wealth_total() {
		return this.items.filter(item => item.type === 'item').reduce((total, item) =>
            item.system.cost * item.system.quantity + total, 0) + this.system.wealth.money;
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

    has_trait(trait_name, specialization=null) {
        const matches = this.items.filter(i => i.type === "trait" && i.name.toLowerCase() === trait_name.toLowerCase());
        if (!specialization) return !!matches.length

        let specialization_match = false;
        for (const i of matches) {
            const listings = i.system.specialization && i.system.specialization.split(',');
            for (const l of listings) if (l.trim().toLowerCase() === specialization) specialization_match = true;
        }
        return specialization_match;
    }

    has_immunity(type) { return this.has_trait('Immunity', type); }

    has_vulnerability(type) { return this.has_trait('Vulnerability', type); }

    has_resistance(type) { return this.has_trait('Resistance', type); }

    async apply_damage(damage, type, critical) {
        // Calculate the damage to apply
        let applied_damage = Number(damage) - this.system.scores.armor.value;

        // Cast critical to boolean
        critical = (critical === 'true')

        if (this.has_immunity(type)) {      // Apply immunities
            ChatMessage.create({content: "The character has immunity. Ignoring damage.", whisper: [game.user.id]});
            applied_damage = 0;
        }
        if (this.has_vulnerability(type)) { // Apply vulnerabilities
            ChatMessage.create({content: "The character has vulnerability. Doubling damage.", whisper: [game.user.id]});
            applied_damage *= 2;
        }
        if (this.has_resistance(type)) {    // Apply resistance
            ChatMessage.create({content: "The character has resistance. Halving damage.", whisper: [game.user.id]});
            applied_damage = Math.floor(applied_damage / 2);
        }

        if (applied_damage > 0) {
            // Determine which consequence
            let consequence_name = null;
            if (type === 'fat')     consequence_name = 'Fatigue';
            else if (critical)      consequence_name = 'Grave Wound';
            else                    consequence_name = 'Wound';

            // Get the consequence
            let consequence = game.items.filter(c => c.name === consequence_name && c.type === "consequence")
                .values().next()?.value;

            // Or lazily create it, if necessary
            if (!consequence)
                consequence = await Item.create({
                    name: consequence_name,
                    type: 'consequence',
                    system: { specialized: true, specialization: 'describe injury', rank: 1 }
                });

            // Generate a default subject based on damage type
            let [generated_descriptor, description] = await this.generate_wound(type, critical);

            // Prompt the user for the descriptor
            new Dialog({
                title: `Describe ${consequence_name}`,
                content: `
                    <form>
                        <div class="form-group">
                            <label for="descriptor">Descriptor</label>
                            <input type="text" name="descriptor" value="${generated_descriptor}" autofocus>
                        </div>
                    </form>`,
                buttons:{
                    Confirm: {
                        icon: "<i class='fas fa-check'></i>",
                        label: 'OK',
                        callback: async (html) => {
                            const final_descriptor = html.find("[name=descriptor]").val();  // Get the user set descriptor

                            // Add the consequence to the actor, apply the rank and descriptor
                            const [actor_copy] = await this.createEmbeddedDocuments('Item', [consequence]);
                            await actor_copy.update({'system.rank': applied_damage});
                            await actor_copy.update({'system.specialization': final_descriptor});

                            // If there was a description generated and the user accepted the generated descriptor
                            if (description && generated_descriptor === final_descriptor)
                                await actor_copy.update({'system.description': description});
                        }
                    }
                },
                default: 'Confirm'
            }).render(true);
        }
    }

    async generate_wound(type, critical) {
        let descriptor = '';
        let description = null;

        // Handle grave wounds
        if (critical) {
            const grave_wounds_table = game.tables.getName('Grave Wounds');
            if (grave_wounds_table) {
                description = (await grave_wounds_table.draw()).results[0].text;
                descriptor = description.split(':')[0];
                return [descriptor, description];
            }
            else {
                descriptor = this.random_member(['grave ', 'deep ', 'severe ',
                    'critical ', 'serious ', 'major ']);
            }
        }

        if (type !== 'fat') descriptor += this.random_member(['arm ', 'leg ', 'abdomen ', 'chest ', 'head ',
            'neck ', 'hand ', 'foot ', 'knee ', 'elbow ', 'forearm ', 'shin ', 'side ', 'back ', 'cheek ', 'brow ',
            'shoulder ', 'hip ', 'thigh ', 'groin ', 'rib ', 'skull ', 'face ']);

        switch (type) {
            case 'burn':
            case 'cor':
            case 'fr':
            case 'tox':
                descriptor += this.random_member(['burn', 'sore', 'lesion']);
                break;
            case 'cut':
                descriptor += this.random_member(['slash', 'cut', 'slice']);
                break;
            case 'fat':
                descriptor += this.random_member(['tired', 'weakened', 'winded']);
                break;
            case 'pi':
                descriptor += this.random_member(['stab', 'puncture', 'gash']);
                break;
            case 'sm':
                descriptor += this.random_member(['bruise', 'trauma', 'rent']);
                break;
            default:
                descriptor += this.random_member(['wound', 'gash', 'laceration']);
        }

        return [descriptor, description];
    }

    random_member(member_list) {
        return member_list[Math.floor(Math.random() * member_list.length)];
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

    getInitiativeRoll(formula=null) {
        // If a formula is supplied for initiative, return a Roll using it
        if (formula) return new Roll(formula);

        // If this is an NPC, return a Roll with that turn type
        else if (this.type === 'npc') return new Roll(INITIATIVE.NPC_TURN);

        // Otherwise, evaluate fast or slow turn and return a Roll
        else return new Roll(this.system.fast_turn ? INITIATIVE.FAST_TURN : INITIATIVE.SLOW_TURN);
    }

    async test(dataset) {
        // Merge the actor into the dataset
        const spec = { actor: this, ...dataset };

        // Create the test and evaluate unless evaluate=false
        const test = new Test(spec);
        if (dataset.evaluate !== false) await test.evaluate();

        // Apply consequences, unless apply_consequences=false
        if (dataset.apply_consequences !== false) await test.apply_consequences();

        // Send to chat, if chat=true, whisper if whisper=true
        if (dataset.chat) await test.to_chat({ whisper: !!dataset.whisper });

        return test;
    }
}
