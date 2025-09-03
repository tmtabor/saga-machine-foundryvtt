import { INITIATIVE } from "../game/combat.js";
import { Test } from "../game/tests.js";
import { standard_consequence } from "../game/consequences.js";
import { median, system_setting } from "../system/utils.js";
import { Effect, WoundFactory } from "../game/damage.js";
import { ModifierSet } from "../game/modifiers.js";
import { ActionHelper } from "../item/item";

/**
 * Extends the base Actor class to support the Saga Machine system
 *
 * @see   SagaMachineActorSheet - Base sheet class
 * @see   SagaMachineCharacterSheet - Character sheet class
 * @see   SagaMachineStashSheet - Stash sheet class
 * @see   SagaMachineVehicleSheet - Vehicle sheet class
 *
 * @extends {Actor}
 */
export class SagaMachineActor extends Actor {

    /*****************************************
     * METHODS THAT OVERRIDE THE ACTOR CLASS *
     *****************************************/

    /**
     * @inheritdoc
     *  @override
     */
    async prepareDerivedData() {
        super.prepareDerivedData();

        // Calculate the actor's scores
        if (this.type === 'character')  await CharacterHelper.calculate_scores(this);
        if (this.type === 'stash')      await StashHelper.calculate_scores(this);
        if (this.type === 'vehicle')    await VehicleHelper.calculate_scores(this);
    }

    /**
     * @inheritdoc
     * @override
     */
    getRollData() {
        const data = super.getRollData();

        // Copy stats and scores to the top level
        if (data.stats) {
            for (let stat of Object.keys(data.stats)) data[stat] = data.stats[stat].value;
            for (let score of Object.keys(data.scores)) data[score] = data.scores[score].value;
        }

        return data;
    }

    /**
     * Return the actor's initiative value (used in the combat tracker).
     * Should always be set to INITIATIVE.NPC_TURN for NPCs or either INITIATIVE.FAST_TURN or
     * INITIATIVE.SLOW_TURN for PCs.
     *
     * @param {string|null} [formula=null] - Optional formula to use for initiative
     * @returns {Roll}
     */
    getInitiativeRoll(formula=null) {
        // If a formula is supplied for initiative, return a Roll using it
        if (formula) return new Roll(formula);

        // If this is an NPC, return a Roll with that turn type
        else if (this.is_npc()) return new Roll(INITIATIVE.NPC_TURN);

        // Otherwise, evaluate fast or slow turn and return a Roll
        else return new Roll(this.system.fast_turn ? INITIATIVE.FAST_TURN : INITIATIVE.SLOW_TURN);
    }

    /*******************************************
     * METHODS FOR DERIVING THE ACTOR'S SCORES *
     *******************************************/

    /**
     * Calculate the actor's score based on either the median of a set or a fixed number and apply
     * any modifiers from effects currently on the actor.
     *
     * @param {string} name - The name of the score (used to look up modifiers)
     * @param {number|number[]} stats - The basis from which to derive the score
     * @param {{stat: string|undefined, score: string|undefined, tn: string|number|undefined, boons: number|undefined,
     *     banes: number|undefined, modifier: number|undefined, divide: number|undefined, percent: number|undefined}} other_modifiers - Any additional modifiers to include alongside those on the actor
     * @returns {number}
     */
    calculate_score(name, stats, other_modifiers={}) {
        const base = Array.isArray(stats) ? median(stats) : stats;
        const mods = this.total_modifiers({base_score: name, ...other_modifiers});
        const percent = 1 + (mods.percent / 100);
        return Math.floor(((base + mods.modifier) * percent) / (mods.divide || 1));
    }

    /**
     * Iterate over actor's equipped armor and determine its Armor, Powered and Bulky property values.
     * Return an object containing the values of each.
     *
     * @returns {{Armor: number, Powered: number, Bulky: number}}
     */
    armor_properties() {
        const equipped_armor = this.items.filter(item => item.type === 'item' &&
            item.system.group === 'Armors' && item.system.equipped);
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

    /**
     * Return the actor's Armor value (if already set by armor_properties()).
     * Otherwise, iterate over all equipped armor and return the highest value.
     *
     * @returns {number}
     */
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

    /**
     * Calculate the total encumbrance of the actor's inventory
     *
     * @returns {number}
     */
    encumbrance_total() {
		return this.items.filter(item => item.type === 'item').reduce((total, item) => item.system.encumbrance + total, 0);
	}

    /**
     * Calculates the character's current Wound total from all Wound, Grave Wound and Fatigue consequences
     *
     * @returns {number}
     */
    wound_total() {
        const wounds = this.items.filter( item => item.type === 'consequence' &&
            (item.name.toLowerCase() === 'wound' ||
                item.name.toLowerCase() === 'grave wound' ||
                item.name.toLowerCase() === 'fatigue'));
        return wounds.map(a => a.system.rank).reduce((a, b) => a + b, 0);
    }

    /*******************************
     * METHODS FOR HANDLING DAMAGE *
     *******************************/

    /**
     * Check whether the actor has a specified trait.
     *
     * @param {string} trait_name - The name of the trait
     * @param {string|null} [specialization=null] - An optional specialization to match
     * @returns {boolean}
     */
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

    /**
     * Check whether the action has immunity to a particular damage type
     *
     * @param {string} type - The damage type in abbreviated format (e.g. cut, pi, sm)
     * @returns {boolean}
     */
    has_immunity(type) { return this.has_trait('Immunity', type); }

    /**
     * Check whether the action has a vulnerability to a particular damage type
     *
     * @param {string} type - The damage type in abbreviated format (e.g. cut, pi, sm)
     * @returns {boolean}
     */
    has_vulnerability(type) { return this.has_trait('Vulnerability', type); }

    /**
     * Check whether the action has resistance to a particular damage type
     *
     * @param {string} type - The damage type in abbreviated format (e.g. cut, pi, sm)
     * @returns {boolean}
     */
    has_resistance(type) { return this.has_trait('Resistance', type); }

    /**
     * Return the TN of test prompted by the actor's Dying consequence
     *
     * @returns {number}
     */
    dying_tn() {
        return Math.abs(Math.min(this.system.scores.health.max - this.system.scores.health.value, 0));
    }

    /**
     * Apply the specified damage to the actor, taking into account armor and common traits and setting consequences
     * and other effects as appropriate.
     *
     * @param {number} damage - The amount of damage being dealt
     * @param {string} type - The type of damage being dealt in abbreviated format (e.g. cut, pi, sm)
     * @param {boolean|string} critical - Whether the damage is being dealt by a critical hit
     * @param {number} pierce - The Pierce property of the attack; for Ignores set to Effect.IGNORES_ALL_ARMOR.
     * @returns {Promise<void>}
     */
    async apply_damage(damage, type, critical, pierce) {
        critical = (critical === 'true' || critical === true);   // Cast critical to boolean
        pierce = Number(pierce);                                 // Cast pierce to number

        // Calculate the damage to apply
        let applied_damage = pierce === Effect.IGNORES_ALL_ARMOR ?
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

        // If this increases the character's wounds to >= Health, upgrade to a grave wound
        if (this.system.scores.health.value + applied_damage >= this.system.scores.health.max) {
            critical = true;
            if (type === 'fat') ChatMessage.create({ content: `Wound Total exceeds Health. ${this.name} must succeed at an <strong>End-${this.system.scores.health.fatigue + applied_damage}</strong> test or fall unconscious for [[1d10]] hours.` });
            else                ChatMessage.create({ content: `Wound Total exceeds Health. ${this.name} takes a Grave Wound.` });
        }

        // Determine whether and how many Dying consequences to apply
        const current_increment = Math.floor(this.system.scores.health.value / this.system.scores.health.max);
        const new_increment = Math.floor((this.system.scores.health.value + applied_damage) / this.system.scores.health.max);
        let dying_to_apply = Math.max(new_increment - current_increment,
            (this.system.scores.health.value > this.system.scores.health.max && type !== 'fat' ? 1 : 0));  // If Wound Total > Health, always add a dying when taking damage
        if (type === 'fat' && current_increment === 0) dying_to_apply--;

        // If there is a Dying to apply
        if (dying_to_apply > 0) {
            // Is the character already dying?
            let already_dying = false;
            let dying_consequence = this?.items.filter(c => c.name === 'Dying' && c.type === "consequence")
                .values().next()?.value;
            if (dying_consequence) already_dying = true;

            // If not, get a copy of the consequence and apply it to the actor
            else {
                dying_consequence = await standard_consequence({
                    name: 'Dying',
                    actor: this,
                    skip_actor: true
                });
                [dying_consequence] = await this.createEmbeddedDocuments('Item', [dying_consequence]);
            }

            // Set the correct Dying value
            const new_dying_value = already_dying ? dying_consequence.system.rank + dying_to_apply : dying_to_apply;
            await dying_consequence.update({'system.rank': new_dying_value });

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
        const wound = await WoundFactory.generate_wound(type, critical);

        // Prompt the user for the descriptor
        new Dialog({
            title: `Describe ${consequence_name}`,
            content: `
                <form>
                    <div class="form-group">
                        <label for="descriptor">Descriptor</label>
                        <input type="text" name="descriptor" value="${wound.descriptor}" autofocus>
                    </div>
                </form>`,
            buttons:{
                Confirm: {
                    icon: "<i class='fas fa-check'></i>",
                    label: 'OK',
                    callback: async (html) => {
                        const final_descriptor = html.find("[name=descriptor]").val();  // Get the user set descriptor
                        if (wound.descriptor !== final_descriptor) wound.description = '';

                        // Add the descriptor to the wound
                        await actor_copy.update({'system.specialization': final_descriptor, 'system.description': wound.description});
                    }
                }
            },
            default: 'Confirm'
        }).render({ force: true });
    }

    /*****************
     * OTHER METHODS *
     *****************/

    /**
     * Adjust the number of Hindered consequences on the actor based on their encumbrance
     *
     * @returns {Promise<void>}
     */
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

    /**
     * Is this character a PC? (Used by handlebars template - do not remove!)
     *
     * @returns {boolean}
     */
    is_pc() { return this.type === 'character' && !this.system.npc; }

    /**
     * Is this character an NPC?
     *
     * @returns {boolean}
     */
    is_npc() { return this.type === 'character' && !!this.system.npc; }

    /********************************************
     * METHODS FOR HANDLING TESTS AND MODIFIERS *
     ********************************************/

    /**
     * Adds together all boons, banes and other modifiers relevant to the action or score and returns
     * an object containing their sums.
     *
     * @param {{base_score: string, stat: string|null, score: string|null, tn: string|number, boons: number,
     *     banes: number, modifier: number, divide: number, percent: number}} dataset
     * @returns {{modifier: number, divide: number, percent: number, boons: number, banes: number, tags: string[]}}
     */
    total_modifiers(dataset) {
        return ModifierSet.total_modifiers(this.modifiers(dataset));
    }

    /**
     * Adds up any modifiers from the actor's active effects, as well as from the dataset object passed into the method.
     * Returns a list of parsed ModifierSet objects representing all relevant modifiers.
     *
     * @param {{base_score: string, stat: string|null, score: string|null, tn: string|number, boons: number,
     *     banes: number, modifier: number, divide: number, percent: number}} dataset
     * @returns {ModifierSet[]}
     * @see ModifierSet
     */
    modifiers(dataset) {
        let mods_object = null;

        // Look up the modifiers for this test
        if (dataset.base_score)                                     mods_object = foundry.utils.deepClone(this.system.modifiers.scores[dataset.base_score]);
        if (dataset.tn === 'Defense' || dataset.tn === 'Willpower') mods_object = foundry.utils.deepClone(this.system.modifiers.other.attack);
        if (!mods_object?.length && (dataset.score === 'defense' ||
            dataset.score === 'willpower'))                         mods_object = foundry.utils.deepClone(this.system.modifiers.other.defense);
        if (!mods_object?.length && dataset.stat)                   mods_object = foundry.utils.deepClone(this.system.modifiers.stats[dataset.stat]);
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
        if (ActionHelper.is_attack(dataset) && !ActionHelper.is_power(dataset) && !ActionHelper.strength_met(dataset, this))
            mods_object.push(`name=Low Str&banes=1`);

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
        if (ActionHelper.is_attack(dataset) && ActionHelper.has_property(dataset.properties, 'Auto')) mods_object.push(`name=Auto&boons=1`);

        // Parse the mods object into a list of mods
        return ModifierSet.parse(mods_object);
    }

    /**
     * The actor performs a test defined by the dataset.
     *
     * @param {{stat: string|null, score: string|null, tn: string|number, boons: number, banes: number,
     *     modifier: number, divide: number, percent: number, evaluate: boolean, apply_consequences: boolean,
     *     chat: boolean, whisper: boolean}} dataset
     * @returns {Promise<Test>}
     * @see Test
     */
    async test(dataset) {
        // Merge the actor into the dataset
        const spec = { actor: this, ...dataset };

        // Create the test and evaluate unless evaluate=false
        const test = new Test(spec);
        if (dataset.evaluate !== false) await test.evaluate();

        // Apply effects, unless apply_consequences=false
        if (dataset.apply_effects !== false) await test.apply_effects(dataset);

        // Send to chat, if chat=true, whisper if whisper=true
        if (dataset.chat) await test.to_chat({ whisper: !!dataset.whisper });

        return test;
    }
}

/**
 * Helper class consolidating methods specific to characters
 *
 * @see SagaMachineActor - Document class representing the character
 */
export class CharacterHelper {
    /**
     * Calculates all derived scores for the character and updates their values
     *
     * @param {SagaMachineActor} actor
     */
    static async calculate_scores(actor) {
        // Armor properties
        actor.system.scores.armor.properties = actor.armor_properties();

        // Equipped armor
        if (!actor.system.scores.armor.custom)
            actor.system.scores.armor.value = actor.calculate_score('armor', actor.armor_value());

        // Defense
        if (!actor.system.scores.defense.custom)
            actor.system.scores.defense.value = actor.calculate_score('defense',
                [actor.system.stats.dexterity.value, actor.system.stats.speed.value, actor.system.stats.perception.value]);

        // Willpower
        if (!actor.system.scores.willpower.custom)
            actor.system.scores.willpower.value = actor.calculate_score('willpower',
                [actor.system.stats.intelligence.value, actor.system.stats.charisma.value, actor.system.stats.determination.value]);

        // Health
        if (!actor.system.scores.health.custom)
            actor.system.scores.health.max = actor.calculate_score('health',
                actor.system.stats.strength.value + actor.system.stats.endurance.value);

        // Wound total
        actor.system.scores.health.value = actor.wound_total();

        // Fatigue
        actor.system.scores.health.fatigue = CharacterHelper.fatigue(actor);

        // Move
        if (!actor.system.scores.move.custom)
            actor.system.scores.move.value = actor.calculate_score('move',
                [actor.system.stats.speed.value, actor.system.stats.endurance.value, actor.system.stats.determination.value],
                {
                    modifier: actor.system.scores.armor.properties['Bulky'] * -1 || 0,
                    divide: actor.system.scores.health.fatigue && actor.system.scores.health.value >= actor.system.scores.health.max ? 2 : 1 // Handle Fatigue consequence's effect on Move
                });

        // Encumbrance threshold
        if (!actor.system.scores.encumbrance.custom)
            actor.system.scores.encumbrance.max = actor.calculate_score('encumbrance',
                [actor.system.stats.strength.value, actor.system.stats.dexterity.value, actor.system.stats.endurance.value],
                {modifier: actor.system.scores.armor.properties['Powered'] || 0});

        // Encumbrance total
        actor.system.scores.encumbrance.value = actor.encumbrance_total();

        // Experiences
        const experiences_spent = CharacterHelper.experiences_spent(actor);
        actor.system.experiences.spent = experiences_spent.total;
        actor.system.experiences.spent_stats = experiences_spent.stats;
        actor.system.experiences.spent_skills = experiences_spent.skills;
        actor.system.experiences.spent_traits = experiences_spent.traits;
        actor.system.experiences.unspent = actor.system.experiences.total - actor.system.experiences.spent;
        actor.system.experiences.level = CharacterHelper.power_level(actor);
    }

    /**
     * Counts the actor's total points of fatigue
     *
     * @param {SagaMachineActor} actor
     * @returns {number}
     */
    static fatigue(actor) {
        const fatigue = actor.items.filter(item => item.type === 'consequence' && item.name.toLowerCase() === 'fatigue');
        return fatigue.map(a => a.system.rank).reduce((a, b) => a + b, 0);
    }

    /**
     * Counts the total points of stress
     *
     * @param {SagaMachineActor} actor
     * @return {number}
     */
    static stress(actor) {
        const fatigue = actor.items.filter(item => item.type === 'consequence' && item.name.toLowerCase() === 'stressed');
        return fatigue.map(a => a.system.rank).reduce((a, b) => a + b, 0);
    }

    /**
     * Return the experience offset of the character's starting Luck score - use in Shadows Over Sol genelines
     *
     * @param {number} luck
     * @return {number}
     */
    static luck_cost(luck) {
        return (luck * 6) - 30;
    }

    /**
     * Determine the experience value of a stat or skill.
     *
     * @param {number} value - The current value of the stat or skill
     * @param {number} [free=0] - How many ranks were free (usually characters get a free rank of Language). If undefined, assume no ranks were free.
     * @returns {number}
     */
    static stat_cost(value, free=0) {
        const free_total = free ? [...Array(free + 1).keys()].reduce((a, b) => a + b, 0) : 0;
        return [...Array(value + 1).keys()].reduce((a, b) => a + b, free_total * -1);
    }

    /**
     * Returns the number of experiences this character has spent, broken down into categories: stats, skills, traits and total overall.
     *
     * @param {SagaMachineActor} actor
     * @returns {{skills: number, total: number, traits: number, stats: number}}
     */
    static experiences_spent(actor) {
        // Add total of all stats
        let stats = 0;
        for (let stat of ['strength', 'dexterity', 'speed', 'endurance', 'intelligence', 'perception', 'charisma', 'determination'])
            stats += CharacterHelper.stat_cost(actor.system.stats[stat].value);

        // Subtract the cost of the character's starting stats, based on power level
        stats -= system_setting('level', 120);


        // Add total of all skills and traits
        let skills = 0;
        let traits = 0;
        for (let item of actor.items) {
            if (item.type === 'skill') skills += CharacterHelper.stat_cost(item.system.rank, item.system.free_ranks);
            if (item.type === 'trait') traits += item.system.ranked ? item.system.cost * item.system.rank : item.system.cost;
        }
        let luck = system_setting('luck_exp', false) ? CharacterHelper.luck_cost(actor.system.scores.luck.max) : 0;

        const total = stats + skills + traits + luck;

        return {total: total, stats: stats, skills: skills, traits: traits};
    }

    /**
     * Given the character's spent experience, returns their calculated power level
     *
     * @param {SagaMachineActor} actor
     * @returns {string}
     */
    static power_level(actor) {
        const total_spent = actor.system.experiences.spent + system_setting('level', 120);

        if (total_spent < 150)        return "Mundane";
        else if (total_spent < 200)   return "Novice";
        else if (total_spent < 250)   return "Exceptional";
        else if (total_spent < 300)   return "Distinguished";
        else if (total_spent < 350)   return "Renowned";
        else                          return "Legendary";
    }

    /**
     * Get the actor's current Parry bonus
     *
     * @param {SagaMachineActor} actor
     * @returns {number}
     */
    static parry_bonus(actor) {
        const equipped_weapons = actor.items.filter(item => item.type === 'item' &&
            item.system.group === 'Weapons' && item.system.equipped);

        let highest = 0;
        for (const weapon of equipped_weapons) {
            const val = weapon.system.parry;
            if (val > highest) highest = val;
        }
        return highest;
    }

    /**
     * Get the actor's equipped weapon with the highest damage
     *
     * @param {SagaMachineActor} actor
     * @return {SagaMachineItem|null}
     */
    static primary_weapon(actor) {
        const equipped_weapons = actor.items.filter(item => item.type === 'item' &&
            item.system.group === 'Weapons' && item.system.equipped);

        let highest_weapon = null;
        let highest_value = 0;
        for (const weapon of equipped_weapons) {
            const val = Number(weapon?.system?.actions?.[0]?.system?.action_effects.filter(e => e.type === 'damage')?.[0]?.value) || 0;
            if (val > highest_value) {
                highest_value = val;
                highest_weapon = weapon;
            }
        }
        return highest_weapon;
    }

    /**
	 * Merge attack option dataset with the dataset of the base attack of the actor's primary weapon, if necessary
	 *
	 * @param dataset
	 * @return {*}
	 */
	static async merge_attack_option(dataset) {
		// Is this an attack option?
		if (dataset.option === "true") {
			// Get the actor
			const actor = await fromUuid(dataset.uuid);
			if (!actor) return dataset;

			// Get the actor's primary weapon
			const weapon = CharacterHelper.primary_weapon(actor);
			if (!weapon) return dataset;

			// Get the basic attack of the primary weapon (assuming it's the first one)
			const base_action = weapon?.system?.actions?.[0];
			if (!base_action) return dataset;

			return {
				uuid: dataset.uuid,
				type: dataset.type,
				stat: dataset.stat || base_action.system.stat,
				skill: dataset.skill || base_action.system.stat,
				tn: dataset.tn,
				modifiers: ActionHelper.merge_modifiers(base_action?.system?.modifiers, dataset.modifiers),
				properties: ActionHelper.merge_properties(base_action?.system?.properties, dataset.properties, true),
				effects: JSON.stringify(base_action.system.action_effects.concat(JSON.parse(dataset.effects)))
			};
		}
		else return dataset;
	}
}

/**
 * Helper class consolidating methods specific to stashes and merchants
 *
 * @see SagaMachineActor - Document class representing the stash
 */
export class StashHelper {
    /**
     * Calculate the stash's wealth and encumbrance
     *
     * @param {SagaMachineActor} actor
     * @returns {Promise<void>}
     */
    static async calculate_scores(actor) {
        // Wealth total
        actor.system.wealth.total = StashHelper.wealth_total(actor);

        // Encumbrance total
        actor.system.encumbrance.value = actor.encumbrance_total();
    }

    /**
     * Calculate the total value of the stash
     *
     * @param {SagaMachineActor} actor
     * @returns {number}
     */
    static wealth_total(actor) {
		return actor.items.filter(item => item.type === 'item').reduce((total, item) =>
            item.system.cost * item.system.quantity + total, 0) + actor.system.wealth.money;
	}
}

/**
 * Helper class consolidating methods specific to vehicles
 *
 * @see SagaMachineActor - Document class representing the vehicle
 */
export class VehicleHelper {
    /**
     * Calculate the vehicle's scores
     *
     * @param {SagaMachineActor} actor
     * @returns {Promise<void>}
     */
    static async calculate_scores(actor) {
        // Armor properties
        actor.system.scores.armor.properties = actor.armor_properties();

        // Equipped armor
        if (!actor.system.scores.armor.custom)
            actor.system.scores.armor.value = actor.calculate_score('armor', actor.armor_value());

        // Handling
        actor.system.scores.handling.boons = (actor.system.scores.handling.label.match(/\+/g) || []).length;
        actor.system.scores.handling.banes = (actor.system.scores.handling.label.match(/-/g) || []).length;

        // Defense
        if (!actor.system.scores.defense.custom)
            actor.system.scores.defense.tn = actor.calculate_score('defense',
                10 + actor.system.scores.handling.boons -
                        (actor.system.scores.size.value + actor.system.scores.handling.banes));

        // Health
        if (!actor.system.scores.health.custom)
            actor.system.scores.health.max = actor.calculate_score('health',
                15 * (2**actor.system.scores.size.value));

        // Wound total
        actor.system.scores.health.value = actor.wound_total();

        // Loads total
        actor.system.scores.space.value = VehicleHelper.loads_total(actor);
    }

    /**
     * Calculate the total number of loads on the vehicle
     *
     * @param {SagaMachineActor} actor
     * @returns {number}
     */
    static loads_total(actor) {
        return actor.items.filter(item => item.type === 'item').reduce((total, item) => item.system.loads + total, 0);
    }
}
