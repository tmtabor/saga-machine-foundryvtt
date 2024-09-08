import { random_member } from "../system/utils.js";
import { Attack } from "./tests.js";

/**
 * Object representing the effects of a test
 */
export class Effect {
    test = null;
    type = null;        // Valid values are 'consequence', 'damage' and 'defense'
    target = 'self';    // Valid values are 'self' and 'target'
    when = 'always';    // Valid values are 'success', 'failure' and 'always'
    message = ''

    /**
     * Constant representing Ignores property
     *
     * @type {number}
     */
    static IGNORES_ALL_ARMOR = -1;

    constructor(dataset, test = null) {
        Object.assign(this, dataset);   // Assign properties from the dataset
        if (test) this.test = test;     // Assign the test
        this.validate(dataset);         // Validate the dataset
    }

    /**
     * Validate whether this Effect object meets basic requirements
     */
    validate() {
        if (!['consequence', 'damage', 'defense', 'message'].includes(this.type))
            throw `Unknown type ${this.type}`;
    }

    /**
     * Is this the right time to execute this effect?
     *
     * @param {string} when
     * @return {boolean}
     */
    right_time(when) {
        return this.when === 'always' || this.when === when;
    }

    /**
     * Format this effect for concise display in a chat card
     *
     * @param {string} key
     * @param value
     * @return {string}
     */
    format_message(key, value) {
        return `<div><strong>${key}:</strong> ${value}</div>`;
    }

    /**
     * Summarize this effect for easy display
     *
     * @return {string}
     */
    effect() {
        if (this.type === 'damage') return `${this.value} ${this.damage_type}`;
        else if (this.type === 'consequence') return this.name;
        else return 'Special';
    }

    /**
     * Given a consequence name, return a link to the consequence item
     *
     * @param {string} name
     * @return {string}
     */
    consequence_link(name = null) {
        // If no provided name, use the default one
        if (!name) name = this.name;

        // Get the consequence, if it exists as an item
        let consequence = game.items.filter(item => item.type === 'consequence' && item.name === name);
        if (!consequence || !consequence.length) return name;
        return `<a class="content-link" draggable="true" data-link="" data-uuid="${consequence[0].uuid}" data-id="${consequence[0].id}" data-type="Item" data-tooltip="Item"><i class="fas fa-suitcase"></i>${name}</a>`;
    }

    /**
     * Given an effect representing damage based on a stat, calculate the actual total
     *
     * @return {number}
     */
    base_damage() {
        let damage = 0;

        // Search damage string for each stat and apply
        let str_dmg = String(this.value).toLowerCase();
        if (str_dmg.includes('str')) damage += Number(this?.test?.actor?.system?.stats?.strength?.value);
        if (str_dmg.includes('dex')) damage += Number(this?.test?.actor?.system?.stats?.dexterity?.value);
        if (str_dmg.includes('spd')) damage += Number(this?.test?.actor?.system?.stats?.speed?.value);
        if (str_dmg.includes('end')) damage += Number(this?.test?.actor?.system?.stats?.endurance?.value);
        if (str_dmg.includes('int')) damage += Number(this?.test?.actor?.system?.stats?.intelligence?.value);
        if (str_dmg.includes('per')) damage += Number(this?.test?.actor?.system?.stats?.perception?.value);
        if (str_dmg.includes('chr')) damage += Number(this?.test?.actor?.system?.stats?.charisma?.value);
        if (str_dmg.includes('det')) damage += Number(this?.test?.actor?.system?.stats?.determination?.value);

        // Strip the damage string of any alphabetic characters, add and return
        str_dmg = str_dmg.replace(/[^\d.-]/g, '');
        damage += Number(str_dmg);
        return damage;
    }

    /**
     * Apply this effect if it is the right time to do so
     *
     * @param {string} when - success, failure or always
     * @param dataset - optional dataset representing the originating test
     * @return {Effect}
     */
    apply(when = 'always', dataset) {
        if (!dataset) dataset = this;

        if (this.type === 'consequence' && this.right_time(when)) this.apply_consequence();
        if (this.type === 'damage' && this.right_time(when)) this.apply_damage(dataset);
        if (this.type === 'defense' && this.right_time(when)) this.apply_defense();
        if (this.type === 'message' && this.right_time(when)) this.apply_message();

        return this;
    }

    /**
     * Apply a message effect, generating a message for later display
     */
    apply_message() {
        this.message = this.format_message(this.key ? this.key : 'Message', this.value);
    }

    /**
     * Apply a consequence effect, generating a message containing a consequence item link
     */
    apply_consequence() {
        // Attach subject to name if specified
        const clean_name = this.name ? this.name : 'Unknown';
        const full_name = this.subject ? `${clean_name} (${this.subject})` : clean_name;

        // Create the embedded consequence link
        let link = this.consequence_link(full_name);
        if (!link) link = full_name;

        // Set the message
        this.message = this.format_message('Consequence', link);
    }

    /**
     * Apply a damage effect, generating a damage message and taking into account any attack properties from the
     *     originating test, if provided
     *
     * @param dataset
     */
    apply_damage(dataset) {
        // Calculate the damage
        let base_damage = this.base_damage();                         // Base damage
        let margin = this.margin ? Number(this.margin) :              // Get the margin
            (this.test && this.test.margin ? Number(this.test.margin) : 0);

        // Handle the Feeble property
        this.properties = Attack.parse_properties(dataset.properties);
        if (Attack.has_property(this.properties, 'Feeble'))
            margin = Math.min(base_damage, margin);

        // Handle the Ignores and Pierce properties
        const ignores = Attack.has_property(this.properties, 'Ignores');
        const pierce = ignores ? Effect.IGNORES_ALL_ARMOR : Attack.property_value(this.properties, 'Pierce');

        let damage = base_damage + margin;                              // Add base damage and margin
        if (damage < 0) damage = 0;                                     // Minimum 0

        // Get the damage type
        const damage_type = this.damage_type ? this.damage_type : '';

        // Set the message
        this.message = this.format_message('Damage',
            `<span class="damage" data-pierce="${pierce}">${damage}</span> <span class="damage-type">${damage_type}</span>`);
    }

    /**
     * Update the actor's Defense and Willpower TNs after a Defense roll
     */
    apply_defense() {
        if (!this.test) return; // If no test is know, nothing to do now

        // Get the target
        let target = null;
        if (this.target === 'self') target = this.test.actor;
        else if (this.target === 'target' && this.test.target) target = this.test.target;

        // Calculate the TNs
        const defense_tn = target.system.scores.defense.value + this.test.randomizer;
        const willpower_tn = target.system.scores.willpower.value + this.test.randomizer;

        // Update defense and willpower
        target.update({'system.scores.defense.tn': defense_tn});
        target.update({'system.scores.willpower.tn': willpower_tn});

        // Set the message
        this.message = this.format_message('Defense', `TN ${defense_tn}`) +
            this.format_message('Willpower', `TN ${willpower_tn}`);
    }

    /**
     * Return a json representation of the effect
     *
     * @param effect
     * @return {{}}
     */
    static to_json(effect) {
        const json = {};
        for (let [key, value] of Object.entries(effect)) {
            // For basic data, copy it over to the JSON
            if (typeof value === 'string' || typeof value === 'number' ||
                typeof value === 'boolean' || value === null || key === 'properties')
                json[key] = value;
        }

        return json;
    }

    /**
     * Create a new Effect object from its json representation
     *
     * @param obj
     * @return {Effect}
     */
    static from_json(obj) {
        return new Effect(obj);
    }
}

/**
 * A simple data class representing narrative aspects of a wound ahead of being transformed into a consequence.
 *
 * @see WoundFactory - A class for generating Wound objects randomly and from the Grave Wounds table
 */
class Wound {
    /**
     * A brief description of the wound. This gets turned into the specialization field of the resulting consequence.
     *
     * @type {string}
     */
    descriptor;

    /**
     * A longer description of the wound and its effects. This turns into the description field of the resulting
     * consequence. This is primarily used to describe the game mechanics of Grave Wounds.
     *
     * @type {string}
     */
    description;

    /**
     * Creates a new wound and optionally sets descriptor and description
     *
     * @param {string} [descriptor='']
     * @param {string} [description='']
     */
    constructor(descriptor, description) {
        this.descriptor = descriptor || '';
        this.description = description || '';
    }
}

/**
 * Generates Wound objects which get passed to actors and transformed into the appropriate consequences
 *
 * @see Wound - A simple data class representing the wound
 */
export class WoundFactory {
    /**
     * Generates a Wound object to be given to an actor
     *
     * @param {string} type - The damage type of the wound in abbreviated format (e.g. cut, pi, sm)
     * @param {boolean} critical - Whether the wound is being dealt by a critical hit
     * @returns {Promise<Wound>}
     */
    static async generate_wound(type, critical) {
        const wound = new Wound();

        // Handle grave wounds
        if (critical) {
            const grave_wounds_table = game.tables.getName('Grave Wounds');
            if (grave_wounds_table) {
                wound.description = (await grave_wounds_table.draw()).results[0].text;
                wound.descriptor = wound.description.split(':')[0];
                return wound;
            }
            else {
                wound.descriptor = random_member(['grave ', 'deep ', 'severe ',
                    'critical ', 'serious ', 'major ']);
            }
        }

        if (type !== 'fat') wound.descriptor += random_member(['arm ', 'leg ', 'abdomen ', 'chest ', 'head ',
            'neck ', 'hand ', 'foot ', 'knee ', 'elbow ', 'forearm ', 'shin ', 'side ', 'back ', 'cheek ', 'brow ',
            'shoulder ', 'hip ', 'thigh ', 'groin ', 'rib ', 'skull ', 'face ']);

        switch (type) {
            case 'burn':
            case 'cor':
            case 'fr':
            case 'tox':
                wound.descriptor += random_member(['burn', 'sore', 'lesion']);
                break;
            case 'cut':
                wound.descriptor += random_member(['slash', 'cut', 'slice']);
                break;
            case 'fat':
                wound.descriptor += random_member(['tired', 'weakened', 'winded']);
                break;
            case 'pi':
                wound.descriptor += random_member(['stab', 'puncture', 'gash']);
                break;
            case 'sm':
                wound.descriptor += random_member(['bruise', 'trauma', 'rent']);
                break;
            default:
                wound.descriptor += random_member(['wound', 'gash', 'laceration']);
        }

        return wound;
    }
}
