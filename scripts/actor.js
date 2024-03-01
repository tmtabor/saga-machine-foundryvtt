import { INITIATIVE } from "./combat.js";
import {ModifierSet, Attack, Test, Consequence} from "./tests.js";
import { standard_consequence } from "./conditions.js";

/**
 * Extends the base Actor class to support the Saga Machine system
 * Extends the base Actor class to support the Saga Machine system
 *
 * @extends {Actor}
 */
export class SagaMachineActor extends Actor {

    /** @inheritdoc */
    async prepareDerivedData() {
        super.prepareDerivedData();

        // Calculate the actor's scores
        if (this.type === 'character') await this.calculate_character_scores();
        if (this.type === 'stash') await this.calculate_stash_scores();
    }

    /** @inheritdoc */
    getRollData() {
        const data = super.getRollData();

        // Copy stats and scores to the top level
        if (data.stats) {
            for (let stat of Object.keys(data.stats)) data[stat] = data.stats[stat].value;
            for (let score of Object.keys(data.scores)) data[score] = data.scores[score].value;
        }

        return data;
    }

    async calculate_stash_scores() {
        // Wealth total
        this.system.wealth.total = this.wealth_total();

        // Encumbrance total
        this.system.encumbrance.value = this.encumbrance_total();
    }

    /**
     * Calculates all derives scores for the character and updates their values
     */
    async calculate_character_scores() {
        // Armor properties
        this.system.scores.armor.properties = this.armor_properties();

        // Equipped armor
        if (!this.system.scores.armor.custom)
            this.system.scores.armor.value = this.calculate_score('armor', this.armor_value());

        // Defense
        if (!this.system.scores.defense.custom)
            this.system.scores.defense.value = this.calculate_score('defense',
                [this.system.stats.dexterity.value, this.system.stats.speed.value, this.system.stats.perception.value]);

        // Willpower
        if (!this.system.scores.willpower.custom)
            this.system.scores.willpower.value = this.calculate_score('willpower',
                [this.system.stats.intelligence.value, this.system.stats.charisma.value, this.system.stats.determination.value]);

        // Health
        if (!this.system.scores.health.custom)
            this.system.scores.health.max = this.calculate_score('health',
                this.system.stats.strength.value + this.system.stats.endurance.value);

        // Wound total
        this.system.scores.health.value = this.wound_total();

        // Fatigue
        this.system.scores.health.fatigue = this.fatigue();

        // Move
        if (!this.system.scores.move.custom)
            this.system.scores.move.value = this.calculate_score('move',
                [this.system.stats.speed.value, this.system.stats.endurance.value, this.system.stats.determination.value],
                {
                    modifier: this.system.scores.armor.properties['Bulky'] * -1 || 0,
                    divide: this.system.scores.health.fatigue && this.system.scores.health.value >= this.system.scores.health.max ? 2 : 1 // Handle Fatigue consequence's effect on Move
                });

        // Encumbrance threshold
        if (!this.system.scores.encumbrance.custom)
            this.system.scores.encumbrance.max = this.calculate_score('encumbrance',
                [this.system.stats.strength.value, this.system.stats.dexterity.value, this.system.stats.endurance.value],
                {modifier: this.system.scores.armor.properties['Powered'] || 0});

        // Encumbrance total
        this.system.scores.encumbrance.value = this.encumbrance_total();

        // Experiences
        [this.system.experiences.spent, this.system.experiences.spent_stats,
            this.system.experiences.spent_skills, this.system.experiences.spent_traits] = this.experiences_spent();
        this.system.experiences.unspent = this.system.experiences.total - this.system.experiences.spent;
        this.system.experiences.level = this.power_level();
    }

    calculate_score(name, stats, other_modifiers={}) {
        const base = Array.isArray(stats) ? this.median(stats) : stats;
        const mods = this.total_modifiers({base_score: name, ...other_modifiers});
        const percent = 1 + (mods.percent / 100);
        return Math.floor(((base + mods.modifier) * percent) / (mods.divide || 1));
    }

    fatigue() {
        const fatigue = this.items.filter(item => item.type === 'consequence' && item.name.toLowerCase() === 'fatigue');
        return fatigue.map(a => a.system.rank).reduce((a, b) => a + b, 0);
    }

    async encumbrance_consequences() {
        if (!this.isOwner) return;

        const encumbered = this.system.scores.encumbrance.value > this.system.scores.encumbrance.max;
        if (encumbered) {
            // If already encumbered, skip
            let consequences = this.items.filter(c => c.name === 'Hindered' &&
                                                      c.system.specialization === 'Encumbered' &&
                                                      c.type === 'consequence');
            if (consequences.length) return;

            // If not encumbered, add the consequence
            let hindered = await standard_consequence({
                name: 'Hindered',
                actor: this,
                skip_actor: true
            });
            [hindered] = await this.createEmbeddedDocuments('Item', [hindered]);
            await hindered.update({ 'system.specialization': 'Encumbered', 'system.specialized': true });
        }
        else {
            // Remove any encumbered consequences
            let consequences = this.items.filter(c => c.name === 'Hindered' &&
                                                      c.system.specialization === 'Encumbered' &&
                                                      c.type === 'consequence');
            if (consequences.length)
                await this.deleteEmbeddedDocuments("Item", consequences.map(c => c.id));
        }
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

    stat_cost(value, free) {
        const free_total = free ? [...Array(free + 1).keys()].reduce((a, b) => a + b, 0) : 0;
        return [...Array(value + 1).keys()].reduce((a, b) => a + b, free_total * -1);
    }

    experiences_spent() {
        // Add total of all stats
        let stats = 0;
        for (let stat of ['strength', 'dexterity', 'speed', 'endurance', 'intelligence', 'perception', 'charisma', 'determination'])
            stats += this.stat_cost(this.system.stats[stat].value);

        // Subtract the cost of the character's starting stats, based on power level
        stats -= game.settings.get('saga-machine', 'level', 120);


        // Add total of all skills and traits
        let skills = 0;
        let traits = 0;
        for (let item of this.items) {
            if (item.type === 'skill') skills += this.stat_cost(item.system.rank, item.system.free_ranks);
            if (item.type === 'trait') traits += item.system.ranked ? item.system.cost * item.system.rank : item.system.cost;
        }

        const total = stats + skills + traits;

        return [total, stats, skills, traits];
    }

    armor_properties() {
        const equipped_armor = this.items.filter(item => item.type === 'item' &&
            item.system.group === 'Armor' && item.system.equipped);
        let highest = {
            'Armor': 0,
            'Bulky': 0,
            'Powered': 0
        };
        for (const arm of equipped_armor) {
            if (arm.system.armor > highest.Armor) highest.Armor = arm.system.armor;
            if (arm.system.bulky > highest.Bulky) highest.Bulky = arm.system.bulky;
            if (arm.system.powered > highest.Powered) highest.Powered = arm.system.powered;
            if (arm.system.properties.includes('Sealed')) highest.Sealed = true;
        }
        return highest;
    }

    armor_value() {
        if (this.system.scores.armor.properties['Armor'])
            return this.system.scores.armor.properties['Armor'];

        const equipped_armor = this.items.filter(item => item.type === 'item' &&
            item.system.group === 'Armors' && item.system.equipped);
        let highest = 0;
        for (const arm of equipped_armor) {
            const val = arm.system.armor;
            if (val > highest) highest = val;
        }
        return highest;
    }

    encumbrance_total() {
		return this.items.filter(item => item.type === 'item').reduce((total, item) => item.system.encumbrance + total, 0);
	}

    wealth_total() {
		return this.items.filter(item => item.type === 'item').reduce((total, item) =>
            item.system.cost * item.system.quantity + total, 0) + this.system.wealth.money;
	}

    dying_tn() {
        return Math.abs(Math.min(this.system.scores.health.max - this.system.scores.health.value, 0));
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

    async apply_damage(damage, type, critical, pierce) {
        critical = (critical === 'true' || critical === true);   // Cast critical to boolean
        pierce = Number(pierce);                                 // Cast pierce to number

        // Calculate the damage to apply
        let applied_damage = pierce === Consequence.IGNORES_ALL_ARMOR ?
            Number(damage) :
            Number(damage) - Math.max(this.system.scores.armor.value - Math.max(pierce, 0), 0);

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

        // If no damage is applied, there is nothing more to do
        if (applied_damage <= 0) return;

        // If this reduces the character to <=0 HP, upgrade to a grave wound
        if (this.system.scores.health.value + applied_damage >= this.system.scores.health.max) {
            critical = true;
            if (type === 'fat') ChatMessage.create({ content: `Wound Total exceeds Health . ${this.name} falls unconscious for [[1d10]] hours.` });
            else                ChatMessage.create({ content: `Wound Total exceeds Health. ${this.name} takes a Grave Wound.` });
        }

        // Determine whether and how many Dying consequences to apply
        const current_increment = Math.floor(this.system.scores.health.value / this.system.scores.health.max);
        const new_increment = Math.floor((this.system.scores.health.value + applied_damage) / this.system.scores.health.max);
        const dying_to_apply = Math.max(new_increment - current_increment,
            (this.system.scores.health.value > this.system.scores.health.max ? 1 : 0));  // If Wound Total > Health, always add a dying when taking damage

        // If there is a Dying to apply
        if (dying_to_apply > 0) {
            // Is the character already dying?
            let already_dying = false;
            let dying_consequnce = this?.items.filter(c => c.name === 'Dying' && c.type === "consequence")
                .values().next()?.value;
            if (dying_consequnce) already_dying = true;

            // If not, get a copy of the consequence and apply it to the actor
            else {
                dying_consequnce = await standard_consequence({
                    name: 'Dying',
                    actor: this,
                    skip_actor: true
                });
                [dying_consequnce] = await this.createEmbeddedDocuments('Item', [dying_consequnce]);
            }

            // Set the correct Dying value
            const new_dying_value = already_dying ? dying_consequnce.system.rank + dying_to_apply : dying_to_apply;
            await dying_consequnce.update({'system.rank': new_dying_value });

            // Check to see if the character is dead
            if (new_dying_value >= 3) {
                // Don't do anything if already dead
                if (!this.statuses.has('defeated')) {
                    // Get the defeated status effect
                    let effect = null;
                    CONFIG.statusEffects.forEach(e => {
                        if (e.id === 'defeated') effect = e
                    });
                    if (effect) {
                        // Add the status effect
                        const clone = foundry.utils.deepClone(effect)
                        ActiveEffect.create(clone, {parent: this});
                        ChatMessage.create({ content: `Dying consequences exceed 3 or more. ${this.name} is dead.` });
                    }
                }
            }
        }

        // Determine which consequence to apply
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

        // Apply the wound to the actor
        const [actor_copy] = await this.createEmbeddedDocuments('Item', [consequence]);
        await actor_copy.update({'system.rank': applied_damage});

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
                        if (generated_descriptor !== final_descriptor) description = '';

                        // Add the descriptor to the wound
                        await actor_copy.update({'system.specialization': final_descriptor, 'system.description': description});
                    }
                }
            },
            default: 'Confirm'
        }).render(true);
    }

    async generate_wound(type, critical) {
        let descriptor = '';
        let description = '';

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

    is_pc() { return this.type === 'character' && !this.system.npc; }

    is_npc() { return this.type === 'character' && this.system.npc; }

    getInitiativeRoll(formula=null) {
        // If a formula is supplied for initiative, return a Roll using it
        if (formula) return new Roll(formula);

        // If this is an NPC, return a Roll with that turn type
        else if (this.is_npc()) return new Roll(INITIATIVE.NPC_TURN);

        // Otherwise, evaluate fast or slow turn and return a Roll
        else return new Roll(this.system.fast_turn ? INITIATIVE.FAST_TURN : INITIATIVE.SLOW_TURN);
    }

    total_modifiers(dataset) {
        return ModifierSet.total_modifiers(this.modifiers(dataset));
    }

    modifiers(dataset) {
        let mods_object = null;

        // Look up the modifiers for this test
        if (dataset.base_score)                                     mods_object = deepClone(this.system.modifiers.scores[dataset.base_score]);
        if (dataset.tn === 'Defense' || dataset.tn === 'Willpower') mods_object = deepClone(this.system.modifiers.other.attack);
        if (!mods_object?.length && (dataset.score === 'defense' ||
            dataset.score === 'willpower'))                         mods_object = deepClone(this.system.modifiers.other.defense);
        if (!mods_object?.length && dataset.stat)                   mods_object = deepClone(this.system.modifiers.stats[dataset.stat]);
        if (!mods_object) mods_object = [];

        // Verify that the mods object is a list
        if (!Array.isArray(mods_object)) { console.error('Mods object is not array'); return []; }

        // EACH MOD IN THE LIST SHOULD BE IN THE FORMAT
        // name=short name&description=for tooltip&boons=0&banes=0&modifier=0

        // Add manual boons, banes or modifier passed in as part of the dataset
        if (dataset.boons) mods_object.push(`boons=${dataset.boons}`);
        if (dataset.banes) mods_object.push(`banes=${dataset.banes}`);
        if (dataset.modifier) mods_object.push(`modifier=${dataset.modifier}`);
        if (dataset.divide) mods_object.push(`divide=${dataset.divide}`);

        // Add possible bane from the strength requirement
        if (Attack.is_attack(dataset) && !Attack.strength_met(dataset, this)) mods_object.push(`name=Low Str&banes=1`);

        // Add possible bane from Fatigue
        if ((dataset.stat === 'strength' || dataset.stat === 'dexterity' || dataset.stat === 'speed' || dataset.stat === 'endurance') &&
            this.system.scores.health.fatigue && this.system.scores.health.value >= this.system.scores.health.max)
            mods_object.push(`name=Fatigue&banes=1`);

        // Add possible bane from Bulky
        if ((dataset.stat === 'speed' || dataset.skill === 'Athletics') && this.system.scores.armor.properties['Bulky'])
            mods_object.push(`name=Bulky&banes=1`);

        // Add boons from Powered property
        if (dataset.stat === 'strength' && this.system.scores.armor.properties['Powered'])
            mods_object.push(`name=Powered&boons=2`);

        // Add boon from the Auto property
        if (Attack.is_attack(dataset) && Attack.has_property(dataset.properties, 'Auto')) mods_object.push(`name=Auto&boons=1`);

        // Parse the mods object into a list of mods
        return ModifierSet.parse(mods_object);
    }

    async test(dataset) {
        // Merge the actor into the dataset
        const spec = { actor: this, ...dataset };

        // Create the test and evaluate unless evaluate=false
        const test = new Test(spec);
        if (dataset.evaluate !== false) await test.evaluate();

        // Apply consequences, unless apply_consequences=false
        if (dataset.apply_consequences !== false) await test.apply_consequences(dataset);

        // Send to chat, if chat=true, whisper if whisper=true
        if (dataset.chat) await test.to_chat({ whisper: !!dataset.whisper });

        return test;
    }
}

Hooks.on('updateActor', async (actor, change, options, id) => {
    if (game.user.id !== id) return;                    // Only run if it is you updating the item
    if (actor.type !== 'character') return;             // Only run if updating a PC or NPC

    await actor.encumbrance_consequences();       // Add or remove Hindered consequences for encumbrance
});

Hooks.on('createItem', async (item, options, id) => {
    if (game.user.id !== id) return;                    // Only run if it is you updating the item
    if (item.type !== 'item' || !item.parent) return;   // Only run if you are changing the inventory of an actor
    if (item.parent.type !== 'character') return;             // Only run if updating a PC or NPC

    await item.parent.encumbrance_consequences();       // Add or remove Hindered consequences for encumbrance
});

Hooks.on('updateItem', async (item, change, options, id) => {
    if (game.user.id !== id) return;                    // Only run if it is you updating the item
    if (item.type !== 'item' || !item.parent) return;   // Only run if you are change the inventory of an actor
    if (item.parent.type !== 'character') return;             // Only run if updating a PC or NPC

    await item.parent.encumbrance_consequences();       // Add or remove Hindered consequences for encumbrance
});

Hooks.on('deleteItem', async (item, options, id) => {
    if (game.user.id !== id) return;                    // Only run if it is you updating the item
    if (item.type !== 'item' || !item.parent) return;   // Only run if you are change the inventory of an actor
    if (item.parent.type !== 'character') return;             // Only run if updating a PC or NPC

    await item.parent.encumbrance_consequences();       // Add or remove Hindered consequences for encumbrance
});