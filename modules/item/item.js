import { token_actor, saga_machine_path } from "../system/utils.js";
import { Effect } from "../game/damage.js";

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

        // Derive the full name from the base name and specialization
        this.full_name();

        // Don't derive properties for items you don't own or which haven't been saved to the db
        if (!this.actor || !this.actor.isOwner || !this.id || !this.actor.items.get(this.id)) return;

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
            if (this.type === 'skill') this.update({'img': `${saga_machine_path()}/images/defaults/skill.svg`});
            if (this.type === 'trait') this.update({'img': `${saga_machine_path()}/images/defaults/trait.svg`});
            if (this.type === 'origin') this.update({'img': `${saga_machine_path()}/images/defaults/origin.svg`});
            if (this.type === 'path') this.update({'img': `${saga_machine_path()}/images/defaults/path.svg`});
            if (this.type === 'ambition') this.update({'img': `${saga_machine_path()}/images/defaults/ambition.svg`});
            if (this.type === 'consequence') this.update({'img': `${saga_machine_path()}/images/defaults/consequence.svg`});
            if (this.type === 'action') this.update({'img': `${saga_machine_path()}/images/defaults/action.svg`});
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
        this.system.armor = ItemHelper.calc_armor(this);
        this.system.bulky = this.property_value('Bulky');
        this.system.parry = this.property_value('Parry');
        this.system.powered = this.property_value('Powered');
        this.system.hands = this.property_value('Hands') || 1;
        this.system.unit_encumbrance = ItemHelper.calc_unit_encumbrance(this);
        this.system.container_encumbrance = ItemHelper.calc_container_encumbrance(this);
        this.system.encumbrance = ItemHelper.calc_encumbrance(this);
        this.system.unit_loads = ItemHelper.calc_unit_loads(this);
        this.system.loads = ItemHelper.calc_loads(this);
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

    /**
     * Removes an item from its parent container
     *
     * @return {Promise<void>}
     */
    async remove_from_container() {
        if (this.type === 'item') this.update({ 'system.parent': null });
    }
}

/**
 * Helper class for operations on actions
 */
export class ActionHelper {
    /**
     * Get the index of this action in the parent's list
     *
     * @param {SagaMachineItem} parent - Parent item of action
     * @param id - ID of action
     * @return {number}
     */
    static parent_action_index(parent, id) {
        const parent_actions = parent?.system?.actions;
        if (!parent_actions) return -1;

        for (let i = 0; i < parent_actions.length; i++)
            if (parent_actions[i]._id === id)
                return i;

        return -1;
    }

    static is_power(dataset) {
        if (!dataset.properties) return false;
        return ActionHelper.has_property(dataset.properties, 'Power');
    }

    /**
     * Returns whether this action is an attack (shorthand: targets Defense or Willpower)
     *
     * @param dataset
     * @return {boolean}
     */
    static is_attack(dataset) {
        return dataset.tn === 'Defense' || dataset.tn === 'Willpower';
    }

    /**
     * Returns whether the character meets the strength requirements for the attack
     *
     * @param dataset
     * @param {SagaMachineActor} actor
     * @return {boolean}
     */
    static strength_met(dataset, actor = null) {
        // Get a reference to the actor if one has not been provided
        if (!actor) actor = token_actor(dataset);

        const strength = actor?.system?.stats?.strength?.value;                     // Get the actor's strength
        if (strength == null) return true;
        const damage = ActionHelper.damage(dataset);                                  // Get the attack's damage
        const properties = ActionHelper.parse_properties(dataset.properties);
        const str = ActionHelper.property_value(properties, 'Str');       // Get the Str X property, if any
        const hands = ActionHelper.property_value(properties, 'Hands');  // Get the Hands X property

        // Check to see if the strength requirement is met
        if (hands >= 2) return strength >= (str || (damage / 2))
        else return strength >= (str || damage)
    }

    /**
     * Returns the base damage value of an attack
     *
     * @param dataset
     * @return {number}
     */
    static damage(dataset) {
        if (!dataset.effects) return 0;

        // Parse effects into a list
        let effects_list = JSON.parse(dataset.effects);
        if (!Array.isArray(effects_list)) effects_list = [effects_list];

        // Get the damage
        for (let i = 0; i < effects_list.length; i++) {
            const effect = new Effect(effects_list[i]);
            if (effect.type === 'damage') return effect.base_damage();
        }

        return 0;
    }

    /**
     * Returns whether the action serves as a Defense test
     *
     * @param {*[]} effects_list - Array of JSON representations of effects
     * @return {boolean}
     */
    static is_defense(effects_list) {
        if (!effects_list || !effects_list.length) return false;

        for (let i = 0; i < effects_list.length; i++)
            if (effects_list[i].type === 'defense') return true;

        return false;
    }

    /**
     * Merge two sets of modifiers into a single list
     *
     * @param initial_mods
     * @param override_mods
     * @return {string[]}
     */
    static merge_modifiers(initial_mods, override_mods) {
        initial_mods = ActionHelper.parse_properties(initial_mods);
        override_mods = ActionHelper.parse_properties(override_mods);
        return override_mods.concat(initial_mods);
    }

    /**
     * Merge two sets of properties in the format output by property_set, with the second set overriding any
     * colliding values from the first set
     *
     * @param initial_props
     * @param override_props
     * @param stringify_props - Return each prop as a string instead of a dict
     * @return {{property: string, value: number|null}[]|string[]}
     */
    static merge_properties(initial_props, override_props, stringify_props=false) {
        initial_props = ActionHelper.property_set(initial_props);
        override_props = ActionHelper.property_set(override_props);

        const found = []
        const obj_set = override_props.concat(initial_props).filter(i => {
            if (found.indexOf(i.property) >= 0) return false;
            else return !!found.push(i.property);
        });

        if (stringify_props) return obj_set.map(p => `${p.property} ${p.value ?? ''}`.trim());
        else return obj_set;
    }

    /**
     * Parses properties into a list of objects, each separating the property name and value
     *
     * @param properties
     * @return {{property: string, value: number|null}[]}
     */
    static property_set(properties) {
        return ActionHelper.parse_properties(properties).map(p => {
            const [prop, val] = p.split(' ');
            return { property: prop, value: Number(val) || null };
        });
    }

    /**
     * Parses the action properties, if necessary, from string to list
     *
     * @param properties
     * @return {string[]}
     */
    static parse_properties(properties) {
        if (typeof properties === 'string') return properties.split(',').map(t => t.trim());
        else if (Array.isArray(properties)) return properties;
        else return [];
    }

    /**
     * Returns the value of the specified property, returning 0 if not specified or no match
     *
     * @param {string|string[]} properties
     * @param {string} property
     * @return {number}
     */
    static property_value(properties, property) {
        for (const prop of ActionHelper.parse_properties(properties)) {
            if (prop.toLowerCase().startsWith(`${property.toLowerCase()} `)) {
                const [, val] = prop.split(' ');
                return Number(val);
            }
        }
        return 0;
    }

    /**
     * Returns whether the action has the specified property
     *
     * @param {string|string[]} properties
     * @param {string} property
     * @return {boolean}
     */
    static has_property(properties, property) {
        return ActionHelper.parse_properties(properties).map(p => p.split(' ')[0]).includes(property);
    }
}

/**
 * Helper class for operations on inventory items
 */
export class ItemHelper {
    /**
     * Calculate the encumbrance per item, taking all item properties into account
     *
     * @param {SagaMachineItem} item
     * @return {number}
     */
    static calc_unit_encumbrance(item) {
        if (item.system.load) return 100;
        else if (item.system.properties.includes('Neg')) return 0;
        else {
            for (const prop of item.system.properties) {
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
     * @param {SagaMachineItem} item
     * @return {number}
     */
    static calc_unit_loads(item) {
        return item.system.unit_encumbrance / 100;
    }

    /**
     * Calculate the encumbrance value of the stack in regards to how much container space it takes.
     *
     * @param {SagaMachineItem} item
     * @return {number}
     */
    static calc_container_encumbrance(item) {
        return item.system.unit_encumbrance * item.system.quantity;
    }

    /**
     * Calculate the encumbrance value of the stack, taking into account item properties,
     * quantity and whether the item is equipped.
     *
     * @param {SagaMachineItem} item
     * @return {number}
     */
    static calc_encumbrance(item) {
        if (!item.system.carried) return 0;
        if (item.system.parent) return 0;
        if (item.system.equipped && item.system.properties.includes('Worn')) return 0;
        return item.system.unit_encumbrance * item.system.quantity;
    }

    /**
     * Calculate the number of loads in the stack.
     * Loads are Encumbrance 100 and are used in the trading and vehicles sub-systems.
     *
     * @param {SagaMachineItem} item
     * @return {number}
     */
    static calc_loads(item) {
        return Math.floor(item.system.unit_loads * item.system.quantity);
    }

    /**
     * Calculate the armor value of the item based on uses and Armor property
     *
     * @param {SagaMachineItem} item
     * @return {number}
     */
    static calc_armor(item) {
        if (item.system.group !== 'Armors') return 0;
        else if (Number.isFinite(parseInt(item.system.uses))) return parseInt(item.system.uses);
        else return item.property_value('Armor') || 0;
    }
}